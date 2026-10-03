import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'

const SUPPORTED_RELATIONSHIPS = new Set(['ENABLING_PRECONDITION', 'CONTEXTUAL_PRECONDITION'])
const VALID_ACTION_KINDS = new Set(['CORRECTIVE_PREVENTIVE', 'INVESTIGATION'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'critical'])
const VALID_CATEGORIES = new Set(['TREINAMENTO', 'PROCEDIMENTO', 'EQUIPAMENTO', 'SUPERVISAO', 'COMUNICACAO', 'OUTRO'])

type EnginePrecondition = {
  id?: unknown
  canonicalCategory?: unknown
  relationship?: unknown
  methodologyMatch?: unknown
}

function enginePreconditions(engineOutput: unknown): EnginePrecondition[] {
  if (!engineOutput || typeof engineOutput !== 'object') return []
  const value = (engineOutput as { preconditions?: unknown }).preconditions
  return Array.isArray(value) ? value.filter((item): item is EnginePrecondition => !!item && typeof item === 'object') : []
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const requestedEventId = new URL(req.url).searchParams.get('eventId')?.trim() || null

    const { data, error } = await admin
      .from('corrective_actions')
      .select('id, title, description, related_failure, status, responsible, due_date, completed_at, effectiveness_status, effectiveness_notes, effectiveness_review_due_date, effectiveness_reviewed_at, created_at, analysis_id, sera_vnext_analysis_id, source_event_id, precondition_id, precondition_category, action_kind, priority, owner_user_id, category')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
    if (error) return jsonError(error.message, 500)

    const legacyIds = (data ?? []).map((row) => row.analysis_id).filter((id): id is string => typeof id === 'string')
    const currentIds = (data ?? []).map((row) => row.sera_vnext_analysis_id).filter((id): id is string => typeof id === 'string')

    const [legacyRows, currentRows] = await Promise.all([
      legacyIds.length
        ? admin.from('analyses').select('id, event_id').eq('tenant_id', user.tenantId).in('id', legacyIds)
        : Promise.resolve({ data: [], error: null }),
      currentIds.length
        ? admin.from('sera_vnext_analyses').select('id, source_reference').eq('tenant_id', user.tenantId).in('id', currentIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (legacyRows.error || currentRows.error) return jsonError('Não foi possível resolver a origem das ações.', 500)

    const legacyEventByAnalysis = new Map((legacyRows.data ?? []).map((row) => [String(row.id), row.event_id as string | null]))
    const currentEventByAnalysis = new Map((currentRows.data ?? []).map((row) => [String(row.id), row.source_reference as string | null]))
    const eventIdForRow = (row: (typeof data)[number]): string | null => {
      if (typeof row.source_event_id === 'string' && row.source_event_id) return row.source_event_id
      if (typeof row.sera_vnext_analysis_id === 'string') return currentEventByAnalysis.get(row.sera_vnext_analysis_id) ?? null
      if (typeof row.analysis_id === 'string') return legacyEventByAnalysis.get(row.analysis_id) ?? null
      return null
    }

    const candidateEventIds = [...new Set((data ?? []).map(eventIdForRow).filter((id): id is string => !!id))]
    const activeEvents = candidateEventIds.length
      ? await admin
          .from('events')
          .select('id, title')
          .eq('tenant_id', user.tenantId)
          .in('id', candidateEventIds)
          .is('deleted_at', null)
      : { data: [], error: null }
    if (activeEvents.error) return jsonError('Não foi possível resolver os eventos ativos das ações.', 500)
    const activeEventById = new Map((activeEvents.data ?? []).map((event) => [String(event.id), String(event.title ?? 'Evento')]))

    const latestCurrentByEvent = new Map<string, { id: string; engine_output: unknown }>()
    if (activeEventById.size > 0) {
      const latestAnalyses = await admin
        .from('sera_vnext_analyses')
        .select('id, source_reference, updated_at, engine_output')
        .eq('tenant_id', user.tenantId)
        .in('source_reference', [...activeEventById.keys()])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (latestAnalyses.error) return jsonError('Não foi possível validar o vínculo atual das ações.', 500)
      for (const analysis of latestAnalyses.data ?? []) {
        const sourceEventId = typeof analysis.source_reference === 'string' ? analysis.source_reference : ''
        if (sourceEventId && !latestCurrentByEvent.has(sourceEventId)) {
          latestCurrentByEvent.set(sourceEventId, { id: String(analysis.id), engine_output: analysis.engine_output })
        }
      }
    }

    const rows = (data ?? []).flatMap<Record<string, unknown>>((row) => {
      const currentId = row.sera_vnext_analysis_id as string | null
      const legacyId = row.analysis_id as string | null
      const sourceEventId = eventIdForRow(row)
      // Soft-deleted events leave their treatment history intact for audit, but disappear
      // from the active queue. Restoring the event makes the same rows visible again.
      if (!sourceEventId || !activeEventById.has(sourceEventId)) return []
      if (requestedEventId && sourceEventId !== requestedEventId) return []
      if (row.action_kind === 'GENERAL_SAFETY') {
        return [{
          id: row.id,
          title: row.title,
          description: row.description,
          related_failure: row.related_failure,
          status: row.status,
          responsible: row.responsible,
          due_date: row.due_date,
          completed_at: row.completed_at,
          effectiveness_status: row.effectiveness_status,
          effectiveness_notes: row.effectiveness_notes,
          effectiveness_review_due_date: row.effectiveness_review_due_date,
          effectiveness_reviewed_at: row.effectiveness_reviewed_at,
          created_at: row.created_at,
          analysis_id: null,
          analysis_engine: 'SAFETY_EVENT',
          event_id: sourceEventId,
          event_title: activeEventById.get(sourceEventId) ?? 'Evento',
          precondition_id: null,
          precondition_category: null,
          action_kind: 'GENERAL_SAFETY',
          linkage_status: 'EVENT_ONLY',
          current_analysis_id: latestCurrentByEvent.get(sourceEventId)?.id ?? null,
          priority: row.priority,
          owner_user_id: row.owner_user_id,
          category: row.category,
        }]
      }
      // SERA-derived actions remain strict: current analysis + explicit precondition traceability.
      if (!currentId || typeof row.precondition_id !== 'string' || typeof row.precondition_category !== 'string' || typeof row.action_kind !== 'string') return []
      const latest = latestCurrentByEvent.get(sourceEventId)
      const currentSupportedCategories = new Set(
        enginePreconditions(latest?.engine_output)
          .filter((item) => item.methodologyMatch !== 'HYPOTHESIS_ONLY'
            && typeof item.relationship === 'string'
            && SUPPORTED_RELATIONSHIPS.has(item.relationship))
          .map((item) => typeof item.canonicalCategory === 'string' ? item.canonicalCategory : '')
          .filter(Boolean),
      )
      const linkageStatus = row.action_kind === 'INVESTIGATION'
        ? 'INVESTIGATION_TASK'
        : currentSupportedCategories.has(row.precondition_category)
          ? 'CURRENT'
          : 'STALE_PRECONDITION_LINK'
      return [{
        id: row.id,
        title: row.title,
        description: row.description,
        related_failure: row.related_failure,
        status: row.status,
        responsible: row.responsible,
        due_date: row.due_date,
        completed_at: row.completed_at,
        effectiveness_status: row.effectiveness_status,
        effectiveness_notes: row.effectiveness_notes,
        effectiveness_review_due_date: row.effectiveness_review_due_date,
        effectiveness_reviewed_at: row.effectiveness_reviewed_at,
        created_at: row.created_at,
        analysis_id: currentId ?? legacyId,
        analysis_engine: currentId ? 'SERA_ENGINE_0_3' : 'LEGACY_HISTORICAL',
        event_id: sourceEventId,
        event_title: activeEventById.get(sourceEventId) ?? 'Evento',
        precondition_id: row.precondition_id,
        precondition_category: row.precondition_category,
        action_kind: row.action_kind,
        linkage_status: linkageStatus,
        current_analysis_id: latest?.id ?? null,
        priority: row.priority,
        owner_user_id: row.owner_user_id,
        category: row.category,
      }]
    })
    return NextResponse.json(rows, { headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[/api/actions GET]', { requestId, errorType: e instanceof Error ? e.name : typeof e })
    return jsonError('Não foi possível listar as ações.', 500)
  }
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    if (!['admin', 'analyst'].includes(String(user.role).toLowerCase())) {
      return jsonError('Permissão insuficiente para criar ações de Safety.', 403)
    }
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const analysisId = typeof body.analysis_id === 'string' ? body.analysis_id.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const preconditionId = typeof body.precondition_id === 'string' ? body.precondition_id.trim() : ''
    const preconditionCategory = typeof body.precondition_category === 'string' ? body.precondition_category.trim() : ''
    const actionKind = typeof body.action_kind === 'string' ? body.action_kind.trim() : ''
    const requestedEventId = typeof body.event_id === 'string' ? body.event_id.trim() : ''
    const priority = typeof body.priority === 'string' && VALID_PRIORITIES.has(body.priority) ? body.priority : 'medium'
    const category = typeof body.category === 'string' && VALID_CATEGORIES.has(body.category) ? body.category : null
    const ownerUserId = typeof body.owner_user_id === 'string' && body.owner_user_id.trim() ? body.owner_user_id.trim() : null
    const responsible = typeof body.responsible === 'string' && body.responsible.trim() ? body.responsible.trim().slice(0, 255) : null
    const dueDate = typeof body.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null

    if (!title) return jsonError('title é obrigatório', 400)
    if (actionKind === 'GENERAL_SAFETY') {
      if (!requestedEventId) return jsonError('event_id é obrigatório para ação geral de Safety.', 400)
      const activeEvent = await admin
        .from('events')
        .select('id, title')
        .eq('id', requestedEventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
        .maybeSingle()
      if (activeEvent.error) return jsonError('Não foi possível validar o evento da ação.', 500)
      if (!activeEvent.data) return jsonError('Evento não encontrado ou inativo.', 404)

      if (ownerUserId) {
        const owner = await admin.from('users').select('id').eq('id', ownerUserId).eq('tenant_id', user.tenantId).eq('is_active', true).maybeSingle()
        if (owner.error) return jsonError('Não foi possível validar o responsável.', 500)
        if (!owner.data) return jsonError('Responsável não pertence à organização ou está inativo.', 400)
      }

      const created = await admin
        .from('corrective_actions')
        .insert({
          analysis_id: null,
          sera_vnext_analysis_id: null,
          source_event_id: requestedEventId,
          tenant_id: user.tenantId,
          title,
          description: description || null,
          related_failure: null,
          precondition_id: null,
          precondition_category: null,
          action_kind: 'GENERAL_SAFETY',
          status: 'pending',
          priority,
          category,
          owner_user_id: ownerUserId,
          responsible,
          due_date: dueDate,
        })
        .select('id, title, description, status, source_event_id, action_kind, priority, category, owner_user_id, responsible, due_date')
        .single()
      if (created.error || !created.data) return jsonError(created.error?.message || 'Não foi possível criar a ação.', 500)

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'safety_action_created', entityType: 'corrective_action', entityId: created.data.id,
        route: '/api/actions', method: 'POST',
        metadata: { source_event_id: requestedEventId, action_kind: 'GENERAL_SAFETY', priority, category },
      })
      return NextResponse.json({
        ...created.data,
        analysis_id: null,
        analysis_engine: 'SAFETY_EVENT',
        event_id: requestedEventId,
        event_title: activeEvent.data.title,
        linkage_status: 'EVENT_ONLY',
      }, { status: 201, headers: { 'x-request-id': requestId } })
    }

    if (!analysisId) return jsonError('analysis_id é obrigatório para ação derivada do SERA.', 400)
    if (ownerUserId) {
      const owner = await admin.from('users').select('id').eq('id', ownerUserId).eq('tenant_id', user.tenantId).eq('is_active', true).maybeSingle()
      if (owner.error) return jsonError('Não foi possível validar o responsável.', 500)
      if (!owner.data) return jsonError('Responsável não pertence à organização ou está inativo.', 400)
    }
    if (!preconditionId || !preconditionCategory || !VALID_ACTION_KINDS.has(actionKind)) {
      return jsonError('Toda nova ação deve estar vinculada a uma pré-condição SERA identificada.', 400)
    }

    const { data: analysis, error: analysisError } = await admin
      .from('sera_vnext_analyses')
      .select('id, source_reference, engine_output')
      .eq('id', analysisId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()
    if (analysisError) return jsonError('Não foi possível validar a análise SERA.', 500)
    if (!analysis) {
      return jsonError('Novas ações só podem ser criadas a partir da análise SERA 0.3 e de suas pré-condições.', 409)
    }

    const sourceEventId = typeof analysis.source_reference === 'string' ? analysis.source_reference : ''
    if (!sourceEventId) return jsonError('A análise SERA não está vinculada a um evento.', 409)
    const { data: activeEvent, error: activeEventError } = await admin
      .from('events')
      .select('id, title')
      .eq('id', sourceEventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()
    if (activeEventError) return jsonError('Não foi possível validar o evento da ação.', 500)
    if (!activeEvent) return jsonError('O evento não está ativo; nenhuma nova ação pode ser criada para ele.', 409)

    const matchedPrecondition = enginePreconditions(analysis.engine_output).find((item) =>
      item.id === preconditionId && item.canonicalCategory === preconditionCategory,
    )
    if (!matchedPrecondition) {
      return jsonError('A pré-condição informada não pertence à análise SERA atual deste evento.', 409)
    }

    const isSupported = matchedPrecondition.methodologyMatch !== 'HYPOTHESIS_ONLY'
      && typeof matchedPrecondition.relationship === 'string'
      && SUPPORTED_RELATIONSHIPS.has(matchedPrecondition.relationship)
    if (actionKind === 'CORRECTIVE_PREVENTIVE' && !isSupported) {
      return jsonError('Ação corretiva exige uma pré-condição sustentada pela evidência do evento.', 409)
    }
    if (actionKind === 'INVESTIGATION' && isSupported) {
      return jsonError('Pré-condição já sustentada deve gerar ação corretiva, não tarefa de investigação.', 409)
    }

    const relatedFailure = actionKind === 'CORRECTIVE_PREVENTIVE'
      ? `PC:${preconditionCategory}`
      : `INVESTIGATE:${preconditionCategory}`

    const duplicate = await admin
      .from('corrective_actions')
      .select('id, title, status, related_failure')
      .eq('tenant_id', user.tenantId)
      .eq('source_event_id', sourceEventId)
      .eq('precondition_category', preconditionCategory)
      .eq('action_kind', actionKind)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle()
    if (duplicate.error) return jsonError('Não foi possível verificar ação existente.', 500)
    if (duplicate.data) {
      return NextResponse.json({
        ...duplicate.data,
        analysis_id: analysisId,
        analysis_engine: 'SERA_ENGINE_0_3',
        event_id: sourceEventId,
        event_title: activeEvent.title,
        precondition_id: preconditionId,
        precondition_category: preconditionCategory,
        action_kind: actionKind,
        idempotent: true,
      }, { status: 200, headers: { 'x-request-id': requestId } })
    }

    const { data, error } = await admin
      .from('corrective_actions')
      .insert({
        analysis_id: null,
        sera_vnext_analysis_id: analysis.id,
        source_event_id: sourceEventId,
        tenant_id: user.tenantId,
        title,
        description: description || null,
        related_failure: relatedFailure,
        precondition_id: preconditionId,
        precondition_category: preconditionCategory,
        action_kind: actionKind,
        status: 'pending',
        priority,
        category,
        owner_user_id: ownerUserId,
        responsible,
        due_date: dueDate,
      })
      .select('id, title, status, related_failure, sera_vnext_analysis_id, source_event_id, precondition_id, precondition_category, action_kind, priority, category, owner_user_id, responsible, due_date')
      .single()
    if (error) return jsonError(error.message, 500)

    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'corrective_action_created',
      entityType: 'corrective_action', entityId: data.id,
      route: '/api/actions', method: 'POST',
      metadata: {
        analysis_id: analysisId,
        analysis_engine: 'SERA_ENGINE_0_3',
        source_event_id: sourceEventId,
        precondition_id: preconditionId,
        precondition_category: preconditionCategory,
        action_kind: actionKind,
      },
    })

    return NextResponse.json({
      id: data.id,
      title: data.title,
      status: data.status,
      related_failure: data.related_failure,
      analysis_id: analysisId,
      analysis_engine: 'SERA_ENGINE_0_3',
      event_id: sourceEventId,
      event_title: activeEvent.title,
      precondition_id: data.precondition_id,
      precondition_category: data.precondition_category,
      action_kind: data.action_kind,
      priority: data.priority,
      category: data.category,
      owner_user_id: data.owner_user_id,
      responsible: data.responsible,
      due_date: data.due_date,
    }, { status: 201, headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[/api/actions POST]', { requestId, errorType: e instanceof Error ? e.name : typeof e })
    return jsonError('Não foi possível criar a ação.', 500)
  }
}
