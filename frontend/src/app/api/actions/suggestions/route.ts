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

    let analysisQuery = admin
      .from('sera_vnext_analyses')
      .select('id, title, source_reference, updated_at, status, review_status, engine_output')
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100)
    if (eventId) analysisQuery = analysisQuery.eq('source_reference', eventId)

    const { data: analyses, error: analysesError } = await analysisQuery
    if (analysesError) return jsonError('Não foi possível obter as análises SERA para sugestões.', 500)

    const latestByEvent = new Map<string, (typeof analyses)[number]>()
    for (const analysis of analyses ?? []) {
      const key = String(analysis.source_reference ?? analysis.id)
      if (!latestByEvent.has(key)) latestByEvent.set(key, analysis)
    }

    const analysisIds = [...latestByEvent.values()].map((item) => String(item.id))
    const { data: existingActions, error: actionsError } = analysisIds.length
      ? await admin
          .from('corrective_actions')
          .select('id, sera_vnext_analysis_id, related_failure, status')
          .eq('tenant_id', user.tenantId)
          .in('sera_vnext_analysis_id', analysisIds)
      : { data: [], error: null }
    if (actionsError) return jsonError('Não foi possível comparar as sugestões com as ações existentes.', 500)

    const existingKeys = new Set((existingActions ?? []).map((item) =>
      `${String(item.sera_vnext_analysis_id ?? '')}|${String(item.related_failure ?? '')}`,
    ))

    const suggestions = [...latestByEvent.values()].flatMap((analysis) =>
      buildSeraActionSuggestions({
        analysisId: String(analysis.id),
        eventId: typeof analysis.source_reference === 'string' ? analysis.source_reference : null,
        analysisTitle: String(analysis.title ?? 'Análise SERA'),
        output: analysis.engine_output as SeraVNextEngineOutput,
      }).filter((suggestion) => !existingKeys.has(`${suggestion.analysisId}|${suggestion.relatedFailure}`)),
    )

    suggestions.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'CORRECTIVE_PREVENTIVE' ? -1 : 1
      return a.analysisTitle.localeCompare(b.analysisTitle, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR')
    })

    return NextResponse.json(suggestions, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/actions/suggestions GET]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Não foi possível gerar sugestões de ações.', 500)
  }
}
