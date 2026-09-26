import type { SeraVNextCreateAnalysisInput, SeraVNextCreateAnalysisResult, SeraVNextProductContext } from '@/lib/sera-vnext-product/types'
import { createSeraVNextAnalysis } from '@/lib/sera-vnext-product/persistence/create-analysis'

type CanonicalEventMode = 'INITIAL' | 'REANALYSIS'


export function isSeraVNextCanonicalAnalyzeEnabled(): boolean {
  return process.env.SERA_VNEXT_CANONICAL_ANALYZE_ENABLED?.trim().toLowerCase() === 'true'
}

export function isSeraVNextCanonicalAnalyzeUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SERA_VNEXT_CANONICAL_ANALYZE_UI_ENABLED?.trim().toLowerCase() === 'true'
}

export function buildCanonicalEventClientRequestId(args: {
  eventId: string
  requestId: string
  mode: CanonicalEventMode
}): string {
  if (args.mode === 'INITIAL') return `CANONICAL_ROUTE_${args.eventId}`
  return `CANONICAL_REANALYSIS_${args.eventId}_${args.requestId}`
}

export function buildCanonicalEventAnalysisInput(args: {
  eventId: string
  title: string
  narrative: string
  requestId: string
  mode: CanonicalEventMode
  locale?: 'pt-BR' | 'en'
}): SeraVNextCreateAnalysisInput & { sourceFlowOverride: 'VNEXT_CANONICAL'; metadata: Record<string, unknown> } {
  return {
    title: args.title,
    narrative: args.narrative,
    sourceType: 'REAL_EVENT',
    sourceReference: args.eventId,
    clientRequestId: buildCanonicalEventClientRequestId(args),
    locale: args.locale ?? 'pt-BR',
    sourceFlowOverride: 'VNEXT_CANONICAL',
    metadata: {
      eventId: args.eventId,
      source: args.mode === 'INITIAL' ? 'primary_sera_engine' : 'primary_sera_reanalysis',
      canonicalEventMode: args.mode,
      operationalEngineRole: 'PRIMARY',
      candidateOnly: true,
    },
  }
}

export async function createCanonicalEventAnalysis(args: {
  eventId: string
  title: string
  narrative: string
  mode: CanonicalEventMode
  locale?: 'pt-BR' | 'en'
  context: SeraVNextProductContext
  create?: typeof createSeraVNextAnalysis
}): Promise<SeraVNextCreateAnalysisResult> {
  const create = args.create ?? createSeraVNextAnalysis
  return create({
    input: buildCanonicalEventAnalysisInput({
      eventId: args.eventId,
      title: args.title,
      narrative: args.narrative,
      requestId: args.context.requestId,
      mode: args.mode,
      locale: args.locale,
    }),
    context: args.context,
  })
}

export function canonicalAnalyzeResponse(result: SeraVNextCreateAnalysisResult, eventId: string) {
  const engineOutput = result.analysis.engine_output
  const pt = (result.analysis.engine_input.locale ?? 'pt-BR') === 'pt-BR'
  return {
    event_id: eventId,
    analysis_id: result.analysis.id,
    sourceFlow: result.analysis.source_flow,
    engineRuntimeVersion: result.analysis.engine_runtime_version,
    canonicalTreeVersion: result.analysis.canonical_tree_version,
    warnings: result.analysis.warnings,
    guardrails: engineOutput.guardrails,
    guardrailEvidence: engineOutput.guardrailEvidence,
    escapePoint: engineOutput.escapePoint,
    axes: engineOutput.axes,
    preconditions: engineOutput.preconditions,
    evidenceSufficiency: engineOutput.evidenceSufficiency,
    humanReviewRequired: true,
    candidateOnly: true,
    limitations: result.analysis.limitations,
    seraAnalysis: null,
    vnextNotice: engineOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
      ? (pt
          ? 'Análise interrompida por evidência insuficiente. Responda às perguntas de esclarecimento antes de tratar P/O/A como hipótese utilizável.'
          : 'Analysis stopped because the evidence is insufficient. Answer the clarification questions before treating P/O/A as usable hypotheses.')
      : (pt
          ? 'Análise SERA criada pelo motor operacional 0.3.0. A classificação permanece sujeita à revisão humana antes de liberação formal.'
          : 'SERA analysis created by operational engine 0.3.0. Classification remains subject to human review before formal release.'),
  }
}
