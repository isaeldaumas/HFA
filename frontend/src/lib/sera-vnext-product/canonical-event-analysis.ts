import type { SeraVNextCreateAnalysisInput, SeraVNextCreateAnalysisResult, SeraVNextProductContext } from '@/lib/sera-vnext-product/types'
import { createSeraVNextAnalysis } from '@/lib/sera-vnext-product/persistence/create-analysis'

type CanonicalEventMode = 'INITIAL' | 'REANALYSIS'


export function mergeCanonicalReanalysisNarrative(args: {
  baseNarrative: string
  submittedNarrative?: string | null
  additionalInformation?: string | null
  originalNarrative?: string | null
}): string {
  const base = args.baseNarrative.trim()
  const submitted = args.submittedNarrative?.trim() ?? ''
  const additional = args.additionalInformation?.trim() ?? ''
  const original = args.originalNarrative?.trim() ?? ''
  let merged = base

  const append = (text: string) => {
    const value = text.trim()
    if (!value || merged.includes(value)) return
    merged = `${merged}

[INFORMAÇÕES ADICIONAIS PARA REANÁLISE]
${value}`.trim()
  }

  if (submitted && submitted !== base) {
    // Some clients resend the full original narrative with appended evidence; others send
    // only the newly entered text. Preserve prior additions already stored in `base`.
    if (submitted.includes(base)) merged = submitted
    else if (!base.includes(submitted)) {
      const submittedDelta = original && submitted.includes(original)
        ? submitted.replace(original, '').trim()
        : submitted
      append(submittedDelta)
    }
  }
  append(additional)
  return merged
}



export function mergeCanonicalSupplementalEvidence(
  engineInputsNewestFirst: unknown[],
): NonNullable<SeraVNextCreateAnalysisInput['supplementalEvidence']> {
  const merged: NonNullable<SeraVNextCreateAnalysisInput['supplementalEvidence']> = []
  const seenStatements = new Set<string>()
  const usedEvidenceIds = new Set<string>()

  // Clarification is additive: a later answer may complement an earlier answer to
  // the same canonical question. Preserve every distinct factual statement across
  // revisions instead of letting the newest revision erase older evidence.
  for (const [historyIndex, rawInput] of engineInputsNewestFirst.entries()) {
    if (!rawInput || typeof rawInput !== 'object') continue
    const rawEvidence = (rawInput as { supplementalEvidence?: unknown }).supplementalEvidence
    if (!Array.isArray(rawEvidence)) continue
    for (const rawItem of rawEvidence) {
      if (!rawItem || typeof rawItem !== 'object') continue
      const item = rawItem as Record<string, unknown>
      const evidenceId = typeof item.evidenceId === 'string' ? item.evidenceId.trim() : ''
      const statement = typeof item.statement === 'string' ? item.statement.trim() : ''
      const linkedQuestionId = typeof item.linkedQuestionId === 'string' ? item.linkedQuestionId.trim() : ''
      const stage = item.stage
      const temporalRelation = item.temporalRelation
      if (!evidenceId || !statement || !linkedQuestionId) continue
      if (!['SAFE_OPERATION', 'ESCAPE_POINT', 'DIRECT_ACTOR', 'PERCEPTION', 'OBJECTIVE', 'ACTION'].includes(String(stage))) continue
      if (temporalRelation !== 'PRE_ESCAPE' && temporalRelation !== 'AT_ESCAPE') continue

      const normalizedStatement = statement.toLocaleLowerCase().replace(/\s+/g, ' ').trim()
      const statementKey = `${linkedQuestionId}\u0000${normalizedStatement}`
      if (seenStatements.has(statementKey)) continue
      seenStatements.add(statementKey)

      let uniqueEvidenceId = evidenceId
      if (usedEvidenceIds.has(uniqueEvidenceId)) {
        uniqueEvidenceId = `${evidenceId}-H${historyIndex}`
        let collisionIndex = 2
        while (usedEvidenceIds.has(uniqueEvidenceId)) {
          uniqueEvidenceId = `${evidenceId}-H${historyIndex}-${collisionIndex}`
          collisionIndex += 1
        }
      }
      usedEvidenceIds.add(uniqueEvidenceId)
      merged.push({
        evidenceId: uniqueEvidenceId,
        statement,
        linkedQuestionId,
        stage: stage as NonNullable<SeraVNextCreateAnalysisInput['supplementalEvidence']>[number]['stage'],
        temporalRelation,
      })
    }
  }
  return merged
}

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
  supplementalEvidence?: SeraVNextCreateAnalysisInput['supplementalEvidence']
}): SeraVNextCreateAnalysisInput & { sourceFlowOverride: 'VNEXT_CANONICAL'; metadata: Record<string, unknown> } {
  return {
    title: args.title,
    narrative: args.narrative,
    sourceType: 'REAL_EVENT',
    sourceReference: args.eventId,
    clientRequestId: buildCanonicalEventClientRequestId(args),
    locale: args.locale ?? 'pt-BR',
    supplementalEvidence: args.supplementalEvidence,
    sourceFlowOverride: 'VNEXT_CANONICAL',
    metadata: {
      eventId: args.eventId,
      source: args.mode === 'INITIAL' ? 'primary_sera_engine' : 'primary_sera_reanalysis',
      canonicalEventMode: args.mode,
      operationalEngineRole: 'PRIMARY',
      candidateOnly: true,
      semanticAiRequired: true,
    },
  }
}

export async function createCanonicalEventAnalysis(args: {
  eventId: string
  title: string
  narrative: string
  mode: CanonicalEventMode
  locale?: 'pt-BR' | 'en'
  supplementalEvidence?: SeraVNextCreateAnalysisInput['supplementalEvidence']
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
      supplementalEvidence: args.supplementalEvidence,
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
