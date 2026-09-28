import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { ensurePublicUserRow } from '@/lib/server/tenant-user'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { validateClarificationResponses } from '@/lib/sera-vnext-product/schemas'
import { reanalyzeSeraVNextAnalysis } from '@/lib/sera-vnext-product/persistence/reanalyze-analysis'
import { SeraVNextProductError } from '@/lib/sera-vnext-product/errors'
import { mergeCanonicalSupplementalEvidence } from '@/lib/sera-vnext-product/canonical-event-analysis'

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    const { eventId } = await ctx.params
    const admin = getSupabaseAdmin()

    const { data: event } = await admin
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!event) return NextResponse.json({ detail: 'Evento não encontrado.' }, { status: 404 })

    const { data: analysisHistory, error: analysisError } = await admin
      .from('sera_vnext_analyses')
      .select('id, engine_input')
      .eq('tenant_id', user.tenantId)
      .eq('source_reference', eventId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(20)
    const analysis = analysisHistory?.[0] ?? null
    if (analysisError || !analysis) return NextResponse.json({ detail: 'Análise SERA atual não encontrada.' }, { status: 404 })
    const carriedSupplementalEvidence = mergeCanonicalSupplementalEvidence(
      (analysisHistory ?? []).map((item) => item.engine_input),
    )

    const raw = await req.json().catch(() => ({})) as Record<string, unknown>
    const clarificationResponses = validateClarificationResponses(raw.clarificationResponses)
    const locale: 'pt-BR' | 'en' = raw.locale === 'en' ? 'en' : 'pt-BR'
    const publicUserId = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)
    const result = await reanalyzeSeraVNextAnalysis({
      analysisId: analysis.id,
      reason: 'event_clarification_evidence',
      clarificationResponses,
      carriedSupplementalEvidence,
      locale,
      context: {
        tenantId: user.tenantId,
        userId: publicUserId,
        role: user.role,
        email: user.email ?? '',
        requestId,
      },
    })

    const needsClarification = result.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    await admin
      .from('events')
      .update({ status: needsClarification ? 'received' : 'completed' })
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      requestId,
      eventType: 'canonical_engine.used',
      entityType: 'analysis',
      entityId: result.analysis.id,
      route: `/api/events/${eventId}/clarifications`,
      method: 'POST',
      status: needsClarification ? 'partial' : 'success',
      metadata: {
        source: 'event_clarification_evidence',
        engine_role: 'PRIMARY',
        revision_number: result.revision.revision_number,
        evidence_sufficiency_status: result.analysis.engine_output.evidenceSufficiency.status,
      },
    })

    return NextResponse.json({
      analysis_id: result.analysis.id,
      revision_number: result.revision.revision_number,
      status: result.analysis.status,
      review_status: result.analysis.review_status,
      engine_output: result.analysis.engine_output,
    }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof SeraVNextProductError) {
      return NextResponse.json({ detail: error.message, errorCode: error.code, request_id: requestId }, { status: error.status })
    }
    console.error('[sera-clarifications]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return NextResponse.json({ detail: 'Não foi possível registrar as informações adicionais.', request_id: requestId }, { status: 500 })
  }
}
