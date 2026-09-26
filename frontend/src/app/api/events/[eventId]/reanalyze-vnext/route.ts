import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { canonicalAnalyzeResponse, createCanonicalEventAnalysis } from '@/lib/sera-vnext-product/canonical-event-analysis'

export const maxDuration = 300

function jsonError(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  )
}

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    const { eventId } = await ctx.params
    const admin = getSupabaseAdmin()
    const { data: event, error } = await admin
      .from('events')
      .select('id, tenant_id, title, raw_input, deleted_at')
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !event) {
      return jsonError(requestId, 'VNEXT_REANALYZE_EVENT_NOT_FOUND', 'Evento não encontrado.', 404)
    }
    const raw = await req.json().catch(() => ({})) as Record<string, unknown>
    const locale: 'pt-BR' | 'en' = raw.locale === 'en' ? 'en' : 'pt-BR'
    const narrative = String(event.raw_input ?? '').trim()
    if (!narrative) {
      return jsonError(requestId, 'VNEXT_REANALYZE_NO_EVIDENCE', 'O evento não possui relato original disponível.', 422)
    }

    const result = await createCanonicalEventAnalysis({
      eventId,
      title: String(event.title ?? `SERA ${eventId}`),
      narrative,
      mode: 'REANALYSIS',
      locale,
      context: {
        tenantId: user.tenantId,
        userId: user.publicUserId,
        role: user.role,
        email: user.email ?? '',
        requestId,
      },
    })

    const needsClarification = result.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    const eventUpdate = await admin
      .from('events')
      .update({ status: needsClarification ? 'received' : 'completed' })
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
    if (eventUpdate.error) throw new Error('VNEXT_REANALYZE_EVENT_STATUS_UPDATE_FAILED')

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      requestId,
      eventType: 'canonical_engine.used',
      entityType: 'analysis',
      entityId: result.analysis.id,
      route: `/api/events/${eventId}/reanalyze-vnext`,
      method: 'POST',
      status: needsClarification ? 'partial' : 'success',
      metadata: {
        source: 'manual_event_reanalysis',
        source_flow: result.analysis.source_flow,
        engine_runtime_version: result.analysis.engine_runtime_version,
        event_id: eventId,
        engine_role: 'PRIMARY',
        human_review_required: true,
        evidence_sufficiency_status: result.analysis.engine_output.evidenceSufficiency.status,
      },
    })

    return NextResponse.json(
      canonicalAnalyzeResponse(result, eventId),
      { headers: { 'x-request-id': requestId } },
    )
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[reanalyze-vnext] unexpected error', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError(requestId, 'VNEXT_REANALYZE_INTERNAL_ERROR', 'Não foi possível reanalisar o evento.', 500)
  }
}
