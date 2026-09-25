import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import {
  debitCreditForEvent,
  ensurePublicUserRow,
  refundCreditForFailedAnalysis,
} from '@/lib/server/tenant-user'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { canonicalAnalyzeResponse, createCanonicalEventAnalysis } from '@/lib/sera-vnext-product/canonical-event-analysis'

export const maxDuration = 300

type AnalyzeErrorCode =
  | 'ANALYZE_INVALID_INPUT'
  | 'ANALYZE_UNAUTHORIZED'
  | 'ANALYZE_FORBIDDEN'
  | 'ANALYZE_ENGINE_UNAVAILABLE'
  | 'ANALYZE_PERSISTENCE_ERROR'
  | 'ANALYZE_INTERNAL_ERROR'

const ANALYZE_PUBLIC_ERROR_MESSAGE = 'Não foi possível concluir a análise.'

function buildErrorResponse(code: AnalyzeErrorCode, requestId: string, status: number) {
  return NextResponse.json(
    { error: { code, message: ANALYZE_PUBLIC_ERROR_MESSAGE, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  )
}

function errorType(error: unknown): string {
  if (error instanceof Response) return `Response:${error.status}`
  if (error instanceof Error) return error.name || 'Error'
  return typeof error
}

function logAnalyzeError(event: string, requestId: string, error: unknown, context: Record<string, unknown> = {}) {
  console.error('[/api/analyze]', { event, requestId, errorType: errorType(error), ...context })
}

function errorResponseFromAuthResponse(error: Response, requestId: string) {
  if (error.status === 401) return buildErrorResponse('ANALYZE_UNAUTHORIZED', requestId, 401)
  if (error.status === 403) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
  return buildErrorResponse('ANALYZE_INTERNAL_ERROR', requestId, 500)
}

async function persistCanonicalResult(args: {
  admin: ReturnType<typeof getSupabaseAdmin>
  eventId: string
  title: string
  narrative: string
  mode: 'INITIAL' | 'REANALYSIS'
  tenantId: string
  publicUserId: string
  authUserId: string
  role: string
  email: string | null
  requestId: string
  creditsUsed?: number
  auditSource: string
}) {
  const result = await createCanonicalEventAnalysis({
    eventId: args.eventId,
    title: args.title,
    narrative: args.narrative,
    mode: args.mode,
    context: {
      tenantId: args.tenantId,
      userId: args.publicUserId,
      role: args.role,
      email: args.email ?? '',
      requestId: args.requestId,
    },
  })

  const needsClarification = result.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
  const patch: Record<string, unknown> = { status: needsClarification ? 'received' : 'completed' }
  if (typeof args.creditsUsed === 'number') patch.credits_used = args.creditsUsed
  const eventUpdate = await args.admin
    .from('events')
    .update(patch)
    .eq('id', args.eventId)
    .eq('tenant_id', args.tenantId)
    .is('deleted_at', null)
  if (eventUpdate.error) throw new Error('PRIMARY_SERA_EVENT_STATUS_UPDATE_FAILED')

  await writeAuditLog({
    tenantId: args.tenantId,
    userId: args.authUserId,
    requestId: args.requestId,
    eventType: 'canonical_engine.used',
    entityType: 'analysis',
    entityId: result.analysis.id,
    route: '/api/analyze',
    method: 'POST',
    status: needsClarification ? 'partial' : 'success',
    metadata: {
      source: args.auditSource,
      engine_role: 'PRIMARY',
      source_flow: result.analysis.source_flow,
      engine_runtime_version: result.analysis.engine_runtime_version,
      canonical_tree_version: result.analysis.canonical_tree_version,
      event_id: args.eventId,
      human_review_required: true,
      evidence_sufficiency_status: result.analysis.engine_output.evidenceSufficiency.status,
    },
  })

  return result
}

/**
 * Motor operacional único: SERA 0.3.x.
 * - Com eventId: reanalisa o evento sem novo débito de crédito.
 * - Sem eventId: cria o evento, debita crédito conforme o plano e executa o mesmo motor.
 * O motor legacy não participa de criação/reanálise; permanece apenas para histórico já gravado.
 */
export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    try {
      assertServiceRoleEnv()
    } catch (cfg) {
      logAnalyzeError('service_role_missing', requestId, cfg)
      return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 503)
    }

    const admin = getSupabaseAdmin()
    let body: {
      eventoNarrativa: string
      userId?: string
      title?: string
      eventId?: string
      operation_type?: string | null
      aircraft_type?: string | null
      occurred_at?: string | null
      sourceType?: 'text' | 'pdf' | 'docx'
      sourceFileName?: string
      sourceWordCount?: number
      sourceFileUrl?: string | null
    }
    try {
      body = (await req.json()) as typeof body
    } catch (parseErr) {
      logAnalyzeError('invalid_json_payload', requestId, parseErr)
      return buildErrorResponse('ANALYZE_INVALID_INPUT', requestId, 400)
    }

    const rawInput = body.eventoNarrativa?.trim()
    if (!rawInput) return buildErrorResponse('ANALYZE_INVALID_INPUT', requestId, 400)
    if (body.userId && body.userId !== user.userId) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)

    const submittedById = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)

    if (body.eventId) {
      const { data: ev, error: evErr } = await admin
        .from('events')
        .select('id, tenant_id, title, raw_input')
        .eq('id', body.eventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
        .maybeSingle()
      if (evErr || !ev) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)

      await admin
        .from('events')
        .update({ status: 'processing' })
        .eq('id', body.eventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_started', entityType: 'event', entityId: body.eventId,
        route: '/api/analyze', method: 'POST', metadata: { source: 'reanalysis', engine_role: 'PRIMARY' },
      })

      try {
        const result = await persistCanonicalResult({
          admin,
          eventId: body.eventId,
          title: String(ev.title ?? body.title ?? `SERA ${body.eventId}`),
          narrative: String(ev.raw_input ?? rawInput),
          mode: 'REANALYSIS',
          tenantId: user.tenantId,
          publicUserId: submittedById,
          authUserId: user.userId,
          role: user.role,
          email: user.email ?? null,
          requestId,
          auditSource: 'reanalysis',
        })
        return NextResponse.json(canonicalAnalyzeResponse(result, body.eventId), { headers: { 'x-request-id': requestId } })
      } catch (err) {
        await admin.from('events').update({ status: 'failed' }).eq('id', body.eventId).eq('tenant_id', user.tenantId)
        logAnalyzeError('reanalysis_failed', requestId, err)
        return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 500)
      }
    }

    const title = body.title?.trim() || `SERA ${new Date().toISOString().slice(0, 10)} ${rawInput.slice(0, 48)}`
    const { data: tenant, error: terr } = await admin
      .from('tenants')
      .select('plan, credits_balance')
      .eq('id', user.tenantId)
      .single()
    if (terr || !tenant) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)

    const isEnterprise = tenant.plan === 'enterprise'
    if (!isEnterprise && (tenant.credits_balance ?? 0) < 1) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)

    const inputType = body.sourceType === 'docx' || body.sourceType === 'pdf' ? body.sourceType : 'text'
    const { data: eventRow, error: eerr } = await admin
      .from('events')
      .insert({
        tenant_id: user.tenantId,
        submitted_by: submittedById,
        title,
        raw_input: rawInput,
        input_type: inputType,
        operation_type: body.operation_type ?? null,
        aircraft_type: body.aircraft_type ?? null,
        occurred_at: body.occurred_at ?? null,
        status: 'received',
      })
      .select('id')
      .single()
    if (eerr || !eventRow) return buildErrorResponse('ANALYZE_PERSISTENCE_ERROR', requestId, 500)

    const eventId = eventRow.id as string
    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'event_created', entityType: 'event', entityId: eventId,
      route: '/api/analyze', method: 'POST',
      metadata: { source_type: body.sourceType ?? 'text', engine_role: 'PRIMARY' },
    })

    let creditDebited = false
    let success = false
    try {
      await debitCreditForEvent({
        admin,
        tenantId: user.tenantId,
        submittedById,
        eventId,
        title,
        isEnterprise,
        currentBalance: tenant.credits_balance ?? 0,
      })
      creditDebited = true

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_started', entityType: 'event', entityId: eventId,
        route: '/api/analyze', method: 'POST', metadata: { source: 'new_analysis', engine_role: 'PRIMARY' },
      })

      const result = await persistCanonicalResult({
        admin,
        eventId,
        title,
        narrative: rawInput,
        mode: 'INITIAL',
        tenantId: user.tenantId,
        publicUserId: submittedById,
        authUserId: user.userId,
        role: user.role,
        email: user.email ?? null,
        requestId,
        creditsUsed: 1,
        auditSource: 'new_analysis',
      })
      success = true
      return NextResponse.json(canonicalAnalyzeResponse(result, eventId), { headers: { 'x-request-id': requestId } })
    } catch (err) {
      await admin.from('events').update({ status: 'failed' }).eq('id', eventId).eq('tenant_id', user.tenantId)
      logAnalyzeError('analysis_failed', requestId, err, { phase: 'new_analysis' })
      return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 500)
    } finally {
      if (creditDebited && !success) {
        try {
          const { data: tNow } = await admin.from('tenants').select('credits_balance').eq('id', user.tenantId).single()
          await refundCreditForFailedAnalysis({
            admin,
            tenantId: user.tenantId,
            submittedById,
            eventId,
            title,
            isEnterprise,
            currentBalanceAfterDebit: tNow?.credits_balance ?? 0,
          })
        } catch (refundErr) {
          logAnalyzeError('refund_failed', requestId, refundErr)
        }
      }
    }
  } catch (e) {
    if (e instanceof Response) return errorResponseFromAuthResponse(e, requestId)
    logAnalyzeError('unhandled_error', requestId, e)
    return buildErrorResponse('ANALYZE_INTERNAL_ERROR', requestId, 500)
  }
}
