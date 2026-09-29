import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { buildSeraActionSuggestions } from '@/lib/corrective-actions/sera-suggestions'

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const url = new URL(req.url)
    const eventId = url.searchParams.get('eventId')?.trim() || null

    let eventQuery = admin
      .from('events')
      .select('id, title')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
    if (eventId) eventQuery = eventQuery.eq('id', eventId)

    const { data: activeEvents, error: eventsError } = await eventQuery
    if (eventsError) return jsonError('Não foi possível obter os eventos ativos.', 500)

    const activeEventById = new Map((activeEvents ?? []).map((event) => [String(event.id), String(event.title ?? 'Evento')]))
    const activeEventIds = [...activeEventById.keys()]
    if (activeEventIds.length === 0) {
      return NextResponse.json([], { headers: { 'x-request-id': requestId } })
    }

    const { data: analyses, error: analysesError } = await admin
      .from('sera_vnext_analyses')
      .select('id, title, source_reference, updated_at, status, review_status, engine_output')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .in('source_reference', activeEventIds)
      .order('updated_at', { ascending: false })
      .limit(Math.min(1000, Math.max(100, activeEventIds.length * 8)))
    if (analysesError) return jsonError('Não foi possível obter as análises SERA para sugestões.', 500)

    // One current analysis per active event. Reanalysis replaces the methodological basis
    // for future suggestions without duplicating the event in the treatment queue.
    const latestByEvent = new Map<string, (typeof analyses)[number]>()
    for (const analysis of analyses ?? []) {
      const key = String(analysis.source_reference ?? '')
      if (!key || !activeEventById.has(key)) continue
      if (!latestByEvent.has(key)) latestByEvent.set(key, analysis)
    }

    const { data: existingActions, error: actionsError } = await admin
      .from('corrective_actions')
      .select('id, source_event_id, precondition_category, action_kind, status')
      .eq('tenant_id', user.tenantId)
      .in('source_event_id', activeEventIds)
      .neq('status', 'cancelled')
    if (actionsError) return jsonError('Não foi possível comparar as sugestões com as ações existentes.', 500)

    // Event + precondition + kind is the stable identity. This remains idempotent across reanalysis.
    const existingKeys = new Set((existingActions ?? []).flatMap((item) => {
      const sourceEventId = typeof item.source_event_id === 'string' ? item.source_event_id : null
      const category = typeof item.precondition_category === 'string' ? item.precondition_category : null
      const kind = typeof item.action_kind === 'string' ? item.action_kind : null
      return sourceEventId && category && kind ? [`${sourceEventId}|${kind}|${category}`] : []
    }))

    const suggestions = [...latestByEvent.entries()].flatMap(([sourceEventId, analysis]) =>
      buildSeraActionSuggestions({
        analysisId: String(analysis.id),
        eventId: sourceEventId,
        analysisTitle: String(analysis.title ?? activeEventById.get(sourceEventId) ?? 'Análise SERA'),
        output: analysis.engine_output as SeraVNextEngineOutput,
      })
        .map((suggestion) => ({
          ...suggestion,
          eventTitle: activeEventById.get(sourceEventId) ?? suggestion.analysisTitle,
        }))
        .filter((suggestion) => suggestion.canonicalCategory
          && !existingKeys.has(`${sourceEventId}|${suggestion.kind}|${suggestion.canonicalCategory}`)),
    )

    suggestions.sort((a, b) => {
      const eventCmp = String(a.eventTitle ?? a.analysisTitle).localeCompare(String(b.eventTitle ?? b.analysisTitle), 'pt-BR')
      if (eventCmp !== 0) return eventCmp
      if (a.kind !== b.kind) return a.kind === 'CORRECTIVE_PREVENTIVE' ? -1 : 1
      return a.title.localeCompare(b.title, 'pt-BR')
    })

    return NextResponse.json(suggestions, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/actions/suggestions GET]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Não foi possível gerar sugestões de ações.', 500)
  }
}
