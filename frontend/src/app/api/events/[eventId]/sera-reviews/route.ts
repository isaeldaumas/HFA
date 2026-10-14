import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { createSeraVNextReview } from '@/lib/sera-vnext-product/persistence/create-review'
import { SeraVNextProductError } from '@/lib/sera-vnext-product/errors'
import { validateReviewInput } from '@/lib/sera-vnext-product/schemas'

export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ eventId: string }> }
const writerRoles = new Set(['admin', 'analyst'])

async function resolveEventAnalysis(req: Request, eventId: string, analysisId: string) {
  const user = await requireBearerUser(req)
  const admin = getSupabaseAdmin()
  const { data: event, error: eventError } = await admin.from('events')
    .select('id').eq('id', eventId).eq('tenant_id', user.tenantId).is('deleted_at', null).maybeSingle()
  if (eventError) throw new Error('SERA_REVIEW_EVENT_LOOKUP_FAILED')
  if (!event) return { user, analysis: null }
  const { data: analysis, error } = await admin.from('sera_vnext_analyses')
    .select('id, status, review_status, current_revision, engine_output')
    .eq('id', analysisId).eq('source_reference', eventId).eq('tenant_id', user.tenantId)
    .is('deleted_at', null).maybeSingle()
  if (error) throw new Error('SERA_REVIEW_ANALYSIS_LOOKUP_FAILED')
  return { user, analysis }
}

async function getHistory(analysisId: string, tenantId: string) {
  const { data, error } = await getSupabaseAdmin().from('sera_vnext_analysis_reviews')
    .select('id, reviewer_id, review_version, created_at, decision, evidence_sufficiency, requires_more_evidence, review_notes, metadata')
    .eq('tenant_id', tenantId).eq('analysis_id', analysisId)
    .order('review_version', { ascending: true })
  if (error) throw new Error('SERA_REVIEW_HISTORY_LOOKUP_FAILED')
  return data ?? []
}

function failure(error: unknown, requestId: string) {
  if (error instanceof Response) return error
  if (error instanceof SeraVNextProductError) {
    return NextResponse.json({ detail: error.message, errorCode: error.code }, { status: error.status, headers: { 'x-request-id': requestId } })
  }
  // An optimistic concurrency collision must not silently create two version N records.
  const message = error instanceof Error ? error.message : ''
  if (message.includes('duplicate key') || message.includes('review_version_unique')) {
    return NextResponse.json({ detail: 'Outra revisão foi salva antes desta. Atualize o histórico e registre a nova decisão.', errorCode: 'SERA_REVIEW_VERSION_CONFLICT' }, { status: 409 })
  }
  console.error('[event-sera-reviews]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
  return NextResponse.json({ detail: 'Não foi possível registrar ou consultar a revisão.', request_id: requestId }, { status: 500 })
}

export async function GET(req: Request, ctx: Context) {
  const requestId = getOrCreateRequestId(req)
  try {
    const { eventId } = await ctx.params
    const analysisId = new URL(req.url).searchParams.get('analysisId') ?? ''
    if (!/^[0-9a-f-]{36}$/i.test(analysisId)) return NextResponse.json({ detail: 'Identificador da análise inválido.' }, { status: 400 })
    const { user, analysis } = await resolveEventAnalysis(req, eventId, analysisId)
    if (!analysis) return NextResponse.json({ detail: 'Análise não encontrada neste evento.' }, { status: 404 })
    const reviews = await getHistory(analysis.id, user.tenantId)
    // Event-level chronology also displays earlier legacy reanalyses saved as
    // distinct analysis IDs; newer reanalyses must append to one analysis ID.
    const admin = getSupabaseAdmin()
    const { data: relatedAnalyses, error: relatedError } = await admin.from('sera_vnext_analyses')
      .select('id').eq('tenant_id', user.tenantId).eq('source_reference', eventId)
      .is('deleted_at', null).order('created_at', { ascending: true }).limit(50)
    if (relatedError) throw new Error('SERA_EVENT_HISTORY_LOOKUP_FAILED')
    const relatedIds = (relatedAnalyses ?? []).map((item) => item.id)
    const { data: storedRevisions, error: revisionsError } = relatedIds.length
      ? await admin.from('sera_vnext_analysis_revisions')
        .select('analysis_id, revision_number, created_at, created_by, reason, engine_output')
        .eq('tenant_id', user.tenantId).in('analysis_id', relatedIds)
        .order('created_at', { ascending: true }).limit(100)
      : { data: [], error: null }
    if (revisionsError) throw new Error('SERA_EVENT_REVISIONS_LOOKUP_FAILED')
    const revisions = (storedRevisions ?? []).map((revision, index) => ({
      eventVersion: index + 1,
      engineRevision: revision.revision_number,
      analysisId: revision.analysis_id,
      distinctLegacyAnalysis: revision.analysis_id !== analysis.id,
      createdAt: revision.created_at,
      createdBy: revision.created_by,
      reason: revision.reason,
      escapePoint: revision.engine_output?.escapePoint?.statement ?? null,
      actor: revision.engine_output?.directActor?.actor ?? null,
      poa: [revision.engine_output?.axes?.perception?.proposedCode ?? '—',
        revision.engine_output?.axes?.objective?.proposedCode ?? '—',
        revision.engine_output?.axes?.action?.proposedCode ?? '—'].join(' / '),
    }))
    return NextResponse.json({ analysisId: analysis.id, status: analysis.status, reviewStatus: analysis.review_status,
      engineRevision: analysis.current_revision, evidenceBlocked: analysis.engine_output?.evidenceSufficiency?.status === 'NEEDS_CLARIFICATION',
      canReview: writerRoles.has(String(user.role).toLowerCase()), reviews, revisions }, { headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } })
  } catch (error) { return failure(error, requestId) }
}

export async function POST(req: Request, ctx: Context) {
  const requestId = getOrCreateRequestId(req)
  try {
    const { eventId } = await ctx.params
    const user = await requireBearerUser(req)
    if (!writerRoles.has(String(user.role).toLowerCase())) return NextResponse.json({ detail: 'Revisão restrita a analistas e administradores.' }, { status: 403 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const analysisId = typeof body.analysisId === 'string' ? body.analysisId : ''
    if (!/^[0-9a-f-]{36}$/i.test(analysisId)) return NextResponse.json({ detail: 'Identificador da análise inválido.' }, { status: 400 })
    const scope = await resolveEventAnalysis(req, eventId, analysisId)
    if (!scope.analysis) return NextResponse.json({ detail: 'Análise não encontrada neste evento.' }, { status: 404 })
    const input = validateReviewInput(body)
    if (!input.reviewNotes || input.reviewNotes.length < 10) {
      return NextResponse.json({ detail: 'Justifique a decisão em pelo menos 10 caracteres, sem acrescentar fatos não documentados.' }, { status: 422 })
    }
    if (scope.analysis.engine_output?.evidenceSufficiency?.status === 'NEEDS_CLARIFICATION'
      && input.decision === 'REJECT_WORKING_HYPOTHESIS') {
      return NextResponse.json({ detail: 'Não há hipótese sustentada para rejeitar: registre a insuficiência ou solicite reanálise.' }, { status: 422 })
    }
    const previous = await getHistory(analysisId, user.tenantId)
    const latest = previous.reduce((max, review) => Math.max(max, review.review_version), 0)
    if (body.baseEngineRevision !== scope.analysis.current_revision) {
      return NextResponse.json({ detail: 'A análise SERA foi reprocessada. Atualize a página e revise a evidência atual.' }, { status: 409 })
    }
    const lastReview = previous.find((review) => review.review_version === latest)
    if (lastReview && lastReview.decision === input.decision && lastReview.evidence_sufficiency === input.evidenceSufficiency
      && lastReview.review_notes?.trim() === input.reviewNotes?.trim()) {
      return NextResponse.json({ detail: 'Esta decisão e justificativa já foram registradas. Uma nova revisão precisa acrescentar avaliação metodológica própria.' }, { status: 422 })
    }
    if (!Number.isInteger(body.baseReviewVersion) || body.baseReviewVersion !== latest) {
      return NextResponse.json({ detail: 'O histórico mudou. Atualize a página antes de salvar uma nova decisão.' }, { status: 409 })
    }
    // A blocked SERA axis cannot be formally accepted on the strength of a review note.
    if (scope.analysis.engine_output?.evidenceSufficiency?.status === 'NEEDS_CLARIFICATION'
      && (input.decision === 'ACCEPT_AS_WORKING_HYPOTHESIS' || input.evidenceSufficiency === 'SUFFICIENT_FOR_WORKING_HYPOTHESIS')) {
      return NextResponse.json({ detail: 'Evidência insuficiente: mantenha a hipótese inconclusiva ou solicite reanálise.' }, { status: 422 })
    }
    const result = await createSeraVNextReview({ analysisId, input: {
      ...input, metadata: { source: 'event_human_review', eventId, basedOnEngineRevision: scope.analysis.current_revision },
    }, context: { tenantId: user.tenantId, userId: user.publicUserId, role: user.role,
      email: user.email ?? '', requestId } })
    return NextResponse.json({ reviewId: result.review.id, reviewVersion: result.review.review_version,
      reviewStatus: result.reviewStatus, status: result.status }, { status: 201, headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } })
  } catch (error) { return failure(error, requestId) }
}
