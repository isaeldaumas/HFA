import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { writeAuditLog } from '@/lib/observability/audit'
import { getOrCreateRequestId } from '@/lib/observability/request-id'

type BootstrapFailureCategory =
  | 'network_or_transient'
  | 'permission_or_rls'
  | 'missing_tenant'
  | 'inconsistent_tenant'
  | 'unexpected_response'
  | 'unknown'

function randomSlug(base: string): string {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 10)
  return `${clean || 'org'}-${suffix}`
}

const TRANSIENT_ERROR_RE = /(timeout|timed out|network|fetch failed|connection|temporar|unavailable|econn|etimedout|eai_again|socket)/i
const PERMISSION_ERROR_RE = /(permission|not authorized|forbidden|row level security|rls|insufficient_privilege|unauthorized)/i
const SAFE_REASON_RE = /[^a-z0-9_.:-]/gi

function normalizeReason(input: unknown, fallback: string): string {
  if (typeof input === 'string') {
    const cleaned = input.toLowerCase().replace(SAFE_REASON_RE, '_').slice(0, 120).replace(/_+/g, '_').replace(/^_|_$/g, '')
    return cleaned || fallback
  }
  if (input && typeof input === 'object') {
    const candidate = input as { code?: string; status?: number; message?: string }
    if (candidate.code) return normalizeReason(`code_${candidate.code}`, fallback)
    if (typeof candidate.status === 'number') return normalizeReason(`status_${candidate.status}`, fallback)
    if (candidate.message) return normalizeReason(candidate.message, fallback)
  }
  return fallback
}

function classifySupabaseError(error: unknown): BootstrapFailureCategory {
  if (!error || typeof error !== 'object') return 'unknown'
  const err = error as { message?: string; code?: string; status?: number }
  const status = typeof err.status === 'number' ? err.status : 0
  const code = (err.code ?? '').toLowerCase()
  const message = err.message ?? ''

  if (status >= 500) return 'network_or_transient'
  if (status === 401 || status === 403) return 'permission_or_rls'
  if (code === '42501') return 'permission_or_rls'
  if (code === '08000' || code === '08001' || code === '08006' || code === '53300' || code === '57p03') {
    return 'network_or_transient'
  }
  if (PERMISSION_ERROR_RE.test(message)) return 'permission_or_rls'
  if (TRANSIENT_ERROR_RE.test(message)) return 'network_or_transient'
  return 'unknown'
}

function isRecoverable(category: BootstrapFailureCategory): boolean {
  return category === 'network_or_transient'
}

function detailForCategory(category: BootstrapFailureCategory): string {
  if (category === 'network_or_transient') return 'Bootstrap de tenant temporariamente indisponível'
  if (category === 'permission_or_rls') return 'Sem permissão para concluir bootstrap de tenant'
  if (category === 'missing_tenant') return 'Conta autenticada sem tenant válido'
  if (category === 'inconsistent_tenant') return 'Inconsistência detectada no tenant da conta'
  if (category === 'unexpected_response') return 'Resposta inesperada ao bootstrap de tenant'
  return 'Falha ao concluir bootstrap de tenant'
}

async function buildFailureResponse(params: {
  requestId: string
  stage: string
  category: BootstrapFailureCategory
  reason: unknown
  status: number
  userId?: string | null
  tenantId?: string | null
}): Promise<NextResponse> {
  const { requestId, stage, category, reason, status, userId = null, tenantId = null } = params
  const recoverable = isRecoverable(category)
  const safeReason = normalizeReason(reason, `${stage}_failed`)

  console.error('[auth/oauth/bootstrap] failed', {
    requestId,
    stage,
    category,
    recoverable,
    reason: safeReason,
    status,
    userId,
    tenantId,
  })

  await writeAuditLog({
    tenantId,
    userId,
    requestId,
    eventType: 'tenant.bootstrap_failed',
    route: '/api/auth/oauth/bootstrap',
    method: 'POST',
    status: 'failed',
    metadata: {
      source: 'oauth_bootstrap',
      stage,
      category,
      recoverable,
      reason: safeReason,
      http_status: status,
    },
  })

  return NextResponse.json(
    {
      detail: detailForCategory(category),
      request_id: requestId,
      category,
      stage,
      recoverable,
    },
    { status, headers: { 'x-request-id': requestId } }
  )
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  let userId: string | null = null
  let tenantId: string | null = null

  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return buildFailureResponse({
        requestId,
        stage: 'auth_header',
        category: 'permission_or_rls',
        reason: 'missing_or_invalid_bearer',
        status: 401,
      })
    }
    const token = auth.slice(7)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !anon || !service) {
      return buildFailureResponse({
        requestId,
        stage: 'env',
        category: 'network_or_transient',
        reason: 'missing_supabase_env',
        status: 503,
      })
    }

    const client = createClient(url, anon)
    const admin = createClient(url, service)

    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser(token)
    if (userErr || !user) {
      return buildFailureResponse({
        requestId,
        stage: 'get_user',
        category: userErr ? classifySupabaseError(userErr) : 'permission_or_rls',
        reason: userErr ?? 'user_not_found',
        status: 401,
      })
    }
    userId = user.id

    // user_metadata is NOT used as a source of tenant authorization.
    // Membership must be resolved from public.users (persistent, server-controlled).
    const email = (user.email || `${user.id}@oauth.placeholder`).trim()
    const local = email.split('@')[0] || 'user'

    const byId = await admin
      .from('users')
      .select('tenant_id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (byId.error) {
      return buildFailureResponse({
        requestId,
        stage: 'resolve_user_by_id',
        category: classifySupabaseError(byId.error),
        reason: byId.error,
        status: 503,
        userId,
      })
    }

    let foundTenantId: string | null = null
    let role = 'admin'

    if (byId.data) {
      if (!byId.data.tenant_id) {
        return buildFailureResponse({
          requestId,
          stage: 'resolve_user_by_id',
          category: 'missing_tenant',
          reason: 'user_row_without_tenant',
          status: 409,
          userId,
        })
      }
      foundTenantId = String(byId.data.tenant_id)
      role = String(byId.data.role ?? 'admin')
    } else {
      const byEmail = await admin
        .from('users')
        .select('id, tenant_id, role')
        .eq('email', email)
        .maybeSingle()

      if (byEmail.error) {
        return buildFailureResponse({
          requestId,
          stage: 'resolve_user_by_email',
          category: classifySupabaseError(byEmail.error),
          reason: byEmail.error,
          status: 503,
          userId,
        })
      }
      if (byEmail.data) {
        if (byEmail.data.id && String(byEmail.data.id) !== user.id) {
          return buildFailureResponse({
            requestId,
            stage: 'resolve_user_by_email',
            category: 'inconsistent_tenant',
            reason: 'email_bound_to_different_user_id',
            status: 409,
            userId,
          })
        }
        if (!byEmail.data.tenant_id) {
          return buildFailureResponse({
            requestId,
            stage: 'resolve_user_by_email',
            category: 'missing_tenant',
            reason: 'email_row_without_tenant',
            status: 409,
            userId,
          })
        }
        foundTenantId = String(byEmail.data.tenant_id)
        role = String(byEmail.data.role ?? 'admin')
      }
    }

    let created = false
    if (foundTenantId) {
      tenantId = foundTenantId
    } else {
      const tenantIns = await admin
        .from('tenants')
        .insert({
          name: local.slice(0, 255),
          slug: randomSlug(local),
          plan: 'trial',
          credits_balance: 3,
        })
        .select('id')
        .single()
      if (tenantIns.error) {
        return buildFailureResponse({
          requestId,
          stage: 'create_tenant',
          category: classifySupabaseError(tenantIns.error),
          reason: tenantIns.error,
          status: 503,
          userId,
        })
      }
      if (!tenantIns.data?.id) {
        return buildFailureResponse({
          requestId,
          stage: 'create_tenant',
          category: 'unexpected_response',
          reason: 'tenant_insert_missing_id',
          status: 500,
          userId,
        })
      }
      tenantId = String(tenantIns.data.id)
      created = true

      const userIns = await admin.from('users').insert({
        id: user.id,
        tenant_id: tenantId,
        email,
        full_name: local.slice(0, 255),
        role,
        is_active: true,
      })
      if (userIns.error) {
        return buildFailureResponse({
          requestId,
          stage: 'create_public_user',
          category: classifySupabaseError(userIns.error),
          reason: userIns.error,
          status: 503,
          userId,
          tenantId,
        })
      }
    }

    const tenantCheck = await admin.from('tenants').select('id').eq('id', tenantId).maybeSingle()
    if (tenantCheck.error) {
      return buildFailureResponse({
        requestId,
        stage: 'validate_tenant_after_resolve',
        category: classifySupabaseError(tenantCheck.error),
        reason: tenantCheck.error,
        status: 503,
        userId,
        tenantId,
      })
    }
    if (!tenantCheck.data?.id) {
      return buildFailureResponse({
        requestId,
        stage: 'validate_tenant_after_resolve',
        category: 'inconsistent_tenant',
        reason: 'resolved_tenant_not_found',
        status: 409,
        userId,
        tenantId,
      })
    }

    // Write to app_metadata (server-controlled) instead of user_metadata (user-controlled).
    // This is descriptive/cache only — authorization is ALWAYS resolved from public.users.
    const metaRes = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        tenant_id: tenantId,
        role,
      },
    })
    if (metaRes.error) {
      return buildFailureResponse({
        requestId,
        stage: 'update_app_metadata',
        category: classifySupabaseError(metaRes.error),
        reason: metaRes.error,
        status: 503,
        userId,
        tenantId,
      })
    }

    return NextResponse.json(
      { ok: true, tenant_id: tenantId, created, request_id: requestId },
      { headers: { 'x-request-id': requestId } }
    )
  } catch (e) {
    return buildFailureResponse({
      requestId,
      stage: 'unexpected_exception',
      category: 'unknown',
      reason: e instanceof Error ? e.message : String(e),
      status: 500,
      userId,
      tenantId,
    })
  }
}
