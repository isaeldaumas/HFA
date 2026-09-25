import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { debitCreditForEvent, ensurePublicUserRow, refundCreditForFailedAnalysis } from '@/lib/server/tenant-user'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { canonicalAnalyzeResponse, createCanonicalEventAnalysis } from '@/lib/sera-vnext-product/canonical-event-analysis'
import { assertFileSize, detectDocumentKind } from '@/lib/sera/document-extraction'
import { inferOccurrenceDateFromNarrative } from '@/lib/sera-vnext/occurrence-date'

export const maxDuration = 300

type SourceMeta = {
  sourceType?: 'text' | 'pdf' | 'docx'
  sourceFileName?: string
  sourceWordCount?: number
}

function logEventsError(error: unknown, stage: string, extra: Record<string, unknown> = {}) {
  const e = error instanceof Error ? error : new Error(String(error))
  console.error('[/api/events Error]', { stage, message: e.message, stack: e.stack, cause: e.cause, ...extra })
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    const scope = new URL(req.url).searchParams.get('scope') ?? 'active'
    const admin = getSupabaseAdmin()
    let query = admin
      .from('events')
      .select('*, analyses(perception_code, objective_code, action_code)')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
    if (scope === 'deleted') query = query.not('deleted_at', 'is', null).neq('deletion_status', 'PURGED')
    else query = query.is('deleted_at', null).neq('deletion_status', 'PURGED')

    const { data, error } = await query
    if (error) return jsonError('Não foi possível listar os eventos.', 500)

    const eventIds = (data ?? []).map((event) => event.id).filter((id): id is string => typeof id === 'string')
    const [exclusions, vnext] = eventIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }] as const
      : await Promise.all([
          admin
            .from('risk_profile_exclusions')
            .select('id, source_id, reason, excluded_at')
            .eq('tenant_id', user.tenantId)
            .eq('source_type', 'legacy_event')
            .in('source_id', eventIds)
            .is('restored_at', null),
          admin
            .from('sera_vnext_analyses')
            .select('id, source_reference, updated_at, perception_candidate_code, objective_candidate_code, action_candidate_code, review_status, status')
            .eq('tenant_id', user.tenantId)
            .in('source_reference', eventIds)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false }),
        ])
    if (exclusions.error || vnext.error) return jsonError('Não foi possível listar os eventos.', 500)

    const exclusionBySourceId = new Map((exclusions.data ?? []).map((row) => [row.source_id as string, row]))
    const vnextByEvent = new Map<string, Record<string, unknown>>()
    for (const row of vnext.data ?? []) {
      const eventId = typeof row.source_reference === 'string' ? row.source_reference : ''
      if (eventId && !vnextByEvent.has(eventId)) vnextByEvent.set(eventId, row as Record<string, unknown>)
    }

    const rows = (data ?? []).map((ev) => {
      const legacyAnalyses = ev.analyses
      const legacy = Array.isArray(legacyAnalyses) ? (legacyAnalyses[0] ?? null) : (legacyAnalyses ?? null)
      const current = vnextByEvent.get(ev.id as string) ?? null
      const exclusion = exclusionBySourceId.get(ev.id as string)
      return {
        ...ev,
        perception_code: (current?.perception_candidate_code as string | null | undefined) ?? null,
        objective_code: (current?.objective_candidate_code as string | null | undefined) ?? null,
        action_code: (current?.action_candidate_code as string | null | undefined) ?? null,
        analysis_engine: current ? 'SERA_ENGINE_0_3' : legacy ? 'LEGACY_HISTORICAL' : null,
        analysis_review_status: current?.review_status ?? null,
        analysis_status: current?.status ?? null,
        is_excluded_from_risk_profile: !!exclusion,
        risk_profile_exclusion_id: exclusion?.id ?? null,
        risk_profile_exclusion_reason: (exclusion?.reason as string | null | undefined) ?? null,
        risk_profile_exclusion_at: (exclusion?.excluded_at as string | null | undefined) ?? null,
        deleted_at: ev.deleted_at ?? null,
        deletion_status: ev.deletion_status ?? null,
        recoverable_until: ev.recoverable_until ?? null,
        analyses: undefined,
      }
    })
    return NextResponse.json(rows, { headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    logEventsError(e, 'get-events', { requestId })
    return jsonError('Não foi possível listar os eventos.', 500)
  }
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  let stage = 'start'
  let context: Record<string, unknown> = { requestId }
  try {
    stage = 'auth'
    const user = await requireBearerUser(req)
    context = { requestId, userId: user.userId, tenantId: user.tenantId }
    try {
      stage = 'assert-service-role-env'
      assertServiceRoleEnv()
    } catch {
      return jsonError('Serviço temporariamente indisponível.', 503)
    }

    const admin = getSupabaseAdmin()
    const ct = req.headers.get('content-type') || ''
    let title: string
    let raw_input: string
    let operation_type: string | null = null
    let aircraft_type: string | null = null
    let occurred_at: string | null = null
    let input_type: 'text' | 'pdf' | 'docx' = 'text'
    const sourceMeta: SourceMeta = { sourceType: 'text' }
    let sourceFile: File | null = null

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      title = String(form.get('title') || '')
      raw_input = String(form.get('raw_input') || '')
      operation_type = form.get('operation_type') ? String(form.get('operation_type')) : null
      aircraft_type = form.get('aircraft_type') ? String(form.get('aircraft_type')) : null
      occurred_at = form.get('occurred_at') ? String(form.get('occurred_at')) : null
      const it = form.get('input_type')
      if (it === 'pdf' || it === 'docx' || it === 'text') input_type = it
      const st = form.get('source_type')
      if (st === 'pdf' || st === 'docx') { sourceMeta.sourceType = st; input_type = st }
      const fn = form.get('source_file_name')
      if (fn) sourceMeta.sourceFileName = String(fn)
      const wc = form.get('source_word_count')
      if (wc) sourceMeta.sourceWordCount = Number(wc)
      const f = form.get('file')
      if (f && f instanceof File && f.size > 0) sourceFile = f
    } else {
      const body = (await req.json()) as Record<string, unknown>
      title = String(body.title || '')
      raw_input = String(body.raw_input || '')
      operation_type = body.operation_type != null ? String(body.operation_type) : null
      aircraft_type = body.aircraft_type != null ? String(body.aircraft_type) : null
      occurred_at = body.occurred_at != null ? String(body.occurred_at) : null
      const it = body.input_type
      if (it === 'pdf' || it === 'docx' || it === 'text') input_type = it
      const st = body.source_type
      if (st === 'pdf' || st === 'docx') { sourceMeta.sourceType = st; input_type = st }
      if (body.source_file_name) sourceMeta.sourceFileName = String(body.source_file_name)
      if (body.source_word_count != null) sourceMeta.sourceWordCount = Number(body.source_word_count)
    }

    if (!title.trim() || !raw_input.trim()) return jsonError('Título e relato são obrigatórios', 400)

    stage = 'ensure-public-user-row'
    const submittedById = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)

    stage = 'fetch-tenant'
    const { data: tenant, error: terr } = await admin
      .from('tenants')
      .select('plan, credits_balance')
      .eq('id', user.tenantId)
      .single()
    if (terr || !tenant) return jsonError('Tenant não encontrado', 400)

    const isEnterprise = tenant.plan === 'enterprise'
    if (!isEnterprise && (tenant.credits_balance ?? 0) < 1) return jsonError('Créditos insuficientes', 402)

    stage = 'insert-event'
    const { data: eventRow, error: eerr } = await admin
      .from('events')
      .insert({
        tenant_id: user.tenantId,
        submitted_by: submittedById,
        title,
        raw_input,
        input_type,
        operation_type,
        aircraft_type,
        occurred_at: occurred_at || inferOccurrenceDateFromNarrative(raw_input) || null,
        status: 'received',
      })
      .select('id')
      .single()
    if (eerr || !eventRow) return jsonError('Não foi possível criar o evento.', 500)

    const eventId = eventRow.id as string
    context = { ...context, eventId }
    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'event_created', entityType: 'event', entityId: eventId,
      route: '/api/events', method: 'POST',
      metadata: { source_type: sourceMeta.sourceType ?? input_type, engine_role: 'PRIMARY' },
    })

    let creditDebited = false
    let success = false
    try {
      stage = 'debit-credit'
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
        route: '/api/events', method: 'POST', metadata: { source: 'new_event', engine_role: 'PRIMARY' },
      })

      stage = 'run-primary-sera-engine'
      const result = await createCanonicalEventAnalysis({
        eventId,
        title,
        narrative: raw_input,
        mode: 'INITIAL',
        context: { tenantId: user.tenantId, userId: submittedById, role: user.role, email: user.email ?? '', requestId },
      })

      if (sourceFile) {
        assertFileSize(sourceFile.size)
        const buf = Buffer.from(await sourceFile.arrayBuffer())
        const kind = detectDocumentKind(buf)
        const ext = sourceFile.name.toLowerCase().endsWith('.docx') || kind === 'docx' ? 'docx' : 'pdf'
        if (!kind || (ext === 'docx' && kind !== 'docx') || (ext === 'pdf' && kind !== 'pdf')) throw new Error('Tipo de arquivo inválido para armazenamento')
        const safeName = sourceFile.name.replace(/[^\w.\-]/g, '_').slice(0, 180)
        const path = `${submittedById}/${result.analysis.id}/${safeName}`
        const { error: uploadError } = await admin.storage.from('analysis-documents').upload(path, buf, {
          contentType: sourceFile.type || (kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
          upsert: true,
        })
        if (!uploadError) {
          await admin
            .from('sera_vnext_analyses')
            .update({ metadata: { ...result.analysis.metadata, sourceFileUrl: path, sourceFileName: sourceFile.name, sourceType: sourceMeta.sourceType ?? input_type } })
            .eq('id', result.analysis.id)
            .eq('tenant_id', user.tenantId)
        }
      }

      const needsClarification = result.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
      const eventUpdate = await admin
        .from('events')
        .update({ status: needsClarification ? 'received' : 'completed', credits_used: 1 })
        .eq('id', eventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
      if (eventUpdate.error) throw new Error('PRIMARY_SERA_EVENT_STATUS_UPDATE_FAILED')

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'canonical_engine.used', entityType: 'analysis', entityId: result.analysis.id,
        route: '/api/events', method: 'POST', status: needsClarification ? 'partial' : 'success',
        metadata: {
          engine_role: 'PRIMARY',
          source_flow: result.analysis.source_flow,
          engine_runtime_version: result.analysis.engine_runtime_version,
          event_id: eventId,
          human_review_required: true,
          evidence_sufficiency_status: result.analysis.engine_output.evidenceSufficiency.status,
        },
      })
      success = true
      return NextResponse.json(
        { ...canonicalAnalyzeResponse(result, eventId), status: needsClarification ? 'received' : 'completed' },
        { headers: { 'x-request-id': requestId } },
      )
    } catch (err) {
      await admin.from('events').update({ status: 'failed' }).eq('id', eventId).eq('tenant_id', user.tenantId)
      logEventsError(err, stage, context)
      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_failed', entityType: 'event', entityId: eventId,
        route: '/api/events', method: 'POST', status: 'failed', metadata: { stage, engine_role: 'PRIMARY' },
      })
      return jsonError('Não foi possível concluir a análise do evento.', 500)
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
          logEventsError(refundErr, 'refund', context)
        }
      }
    }
  } catch (e) {
    if (e instanceof Response) return e
    logEventsError(e, stage, context)
    return jsonError('Não foi possível criar o evento.', 500)
  }
}
