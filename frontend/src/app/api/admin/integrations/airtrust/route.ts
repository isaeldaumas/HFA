import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { assertServiceRoleEnv, getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { buildErrorResponse, getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { generateIntegrationToken } from '@/lib/integrations/integration-token'

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function requireTenantAdmin(req: Request) {
  const user = await requireBearerUser(req)
  if (String(user.role).toLowerCase() !== 'admin') {
    throw new Response(JSON.stringify({ detail: 'Acesso restrito ao administrador da organização.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireTenantAdmin(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const result = await admin
      .from('integration_connections')
      .select('id, provider, external_tenant_ref, name, token_prefix, scopes, is_active, last_used_at, created_at, updated_at, revoked_at')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'AIRTRUST')
      .order('created_at', { ascending: false })
    if (result.error) return jsonError('Não foi possível listar as integrações.', 500)
    return NextResponse.json(result.data ?? [], { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError('Não foi possível listar as integrações.', 500)
  }
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireTenantAdmin(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const externalTenantRef = clean(body.external_tenant_ref, 255)
    const connectionName = clean(body.name ?? body.display_name, 160)
    if (!externalTenantRef) return jsonError('external_tenant_ref é obrigatório.', 400)

    const generated = generateIntegrationToken()
    const existing = await admin
      .from('integration_connections')
      .select('id')
      .eq('tenant_id', user.tenantId)
      .eq('provider', 'AIRTRUST')
      .eq('external_tenant_ref', externalTenantRef)
      .maybeSingle()
    if (existing.error) return jsonError('Não foi possível validar a integração existente.', 500)

    const now = new Date().toISOString()
    const payload = {
      name: connectionName || 'AirTrust',
      token_hash: generated.tokenHash,
      token_prefix: generated.tokenPrefix,
      is_active: true,
      revoked_at: null,
      updated_at: now,
    }
    const saved = existing.data
      ? await admin.from('integration_connections').update(payload).eq('id', existing.data.id).eq('tenant_id', user.tenantId)
          .select('id, external_tenant_ref, name, token_prefix, scopes, is_active, last_used_at, created_at, updated_at, revoked_at').single()
      : await admin.from('integration_connections').insert({
          tenant_id: user.tenantId,
          provider: 'AIRTRUST',
          external_tenant_ref: externalTenantRef,
          scopes: ['events:write', 'events:read'],
          created_by: user.publicUserId,
          ...payload,
        }).select('id, external_tenant_ref, name, token_prefix, scopes, is_active, last_used_at, created_at, updated_at, revoked_at').single()
    if (saved.error || !saved.data) return jsonError('Não foi possível salvar a integração.', 500)

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.authUserId,
      requestId,
      eventType: 'integration_connection_rotated',
      entityType: 'integration_connection',
      entityId: saved.data.id,
      route: '/api/admin/integrations/airtrust',
      method: 'POST',
      metadata: { provider: 'AIRTRUST', external_tenant_ref: externalTenantRef },
    })

    return NextResponse.json({ connection: saved.data, token: generated.token }, {
      status: existing.data ? 200 : 201,
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError('Não foi possível salvar a integração.', 500)
  }
}

export async function DELETE(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireTenantAdmin(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const connectionId = clean(body.connection_id, 80)
    if (!connectionId) return jsonError('connection_id é obrigatório.', 400)
    const now = new Date().toISOString()
    const result = await admin.from('integration_connections')
      .update({ is_active: false, revoked_at: now, updated_at: now })
      .eq('id', connectionId).eq('tenant_id', user.tenantId).eq('provider', 'AIRTRUST')
      .select('id').maybeSingle()
    if (result.error) return jsonError('Não foi possível revogar a integração.', 500)
    if (!result.data) return jsonError('Integração não encontrada.', 404)
    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.authUserId,
      requestId,
      eventType: 'integration_connection_revoked',
      entityType: 'integration_connection',
      entityId: connectionId,
      route: '/api/admin/integrations/airtrust',
      method: 'DELETE',
      metadata: { provider: 'AIRTRUST' },
    })
    return NextResponse.json({ success: true }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError('Não foi possível revogar a integração.', 500)
  }
}
