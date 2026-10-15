import { runSeraVNextEngineV0 } from '@/lib/sera-vnext/engine-v0/run-engine'
import { enrichSeraNarrativeSemantically, enrichSeraPoaSemantically, mergeFocusedPoaSemanticEvidence } from '@/lib/sera-vnext/ai/semantic-enrichment'
import { notFound, SeraVNextProductError } from '../errors'
import { hashJson, sha256Hex } from '../hashing'
import { assertValidAnalysisTransition } from '../transitions'
import type { SeraVNextClarificationResponse, SeraVNextProductContext } from '../types'
import type { SeraVNextEngineInput } from '@/lib/sera-vnext/engine-contract'
import { getSeraVNextProductVersionSet } from '../versioning'
import { createAuditEvent } from './create-audit-event'
import { SERA_ENGINE_REFRESH_EPOCH } from '../engine-refresh'
import { createSeraVNextProductRepository, type SeraVNextProductRepository } from './repositories'

export async function reanalyzeSeraVNextAnalysis(args: {
  analysisId: string
  reason?: string
  reprocessCurrentEngine?: boolean
  /** New clarification facts are consumed deterministically with the previously audited semantic snapshot. */
  preserveSemanticForClarifications?: boolean
  updatedNarrative?: string
  clarificationResponses?: SeraVNextClarificationResponse[]
  carriedSupplementalEvidence?: SeraVNextEngineInput['supplementalEvidence']
  locale?: 'pt-BR' | 'en'
  context: SeraVNextProductContext
  repository?: SeraVNextProductRepository
  semanticEnricher?: typeof enrichSeraNarrativeSemantically
}) {
  const repository = args.repository ?? createSeraVNextProductRepository()
  const analysis = await repository.getAnalysis(args.context.tenantId, args.analysisId)
  if (!analysis) throw notFound()
  if (analysis.status === 'ARCHIVED') {
    throw new SeraVNextProductError('SERA_REANALYSIS_ARCHIVED', 'Análises arquivadas não podem ser reprocessadas.', 409)
  }

  const clarificationResponses = args.clarificationResponses ?? []
  const narrative = args.updatedNarrative?.trim() || analysis.narrative
  const hasNewNarrative = narrative !== analysis.narrative
  if (args.reprocessCurrentEngine && (hasNewNarrative || clarificationResponses.length > 0)) {
    throw new SeraVNextProductError(
      'SERA_ENGINE_REFRESH_MUST_PRESERVE_EVIDENCE',
      'O reprocessamento do motor só é permitido sem fatos novos ou respostas adicionais.',
      422,
    )
  }
  if (hasNewNarrative && !narrative.startsWith(analysis.narrative)) {
    throw new SeraVNextProductError('SERA_REANALYSIS_MUST_PRESERVE_ORIGINAL', 'O relato e as evidências anteriores devem ser preservados integralmente.', 422)
  }
  await createAuditEvent({
    repository,
    context: args.context,
    analysisId: analysis.id,
    eventType: 'analysis.reanalysis_requested',
    fromStatus: analysis.status,
    toStatus: analysis.status,
    payload: { currentRevision: analysis.current_revision },
  })

  const versions = getSeraVNextProductVersionSet()
  if (analysis.status === 'REQUIRES_MORE_EVIDENCE' && clarificationResponses.length === 0 && !hasNewNarrative && !args.reprocessCurrentEngine) {
    throw new SeraVNextProductError(
      'SERA_VNEXT_CLARIFICATION_RESPONSE_REQUIRED',
      'Esta análise requer evidência adicional antes de uma nova execução.',
      400,
    )
  }
  const activeQuestions = new Map(
    analysis.engine_output.evidenceSufficiency.questions.map((item) => [item.id, item]),
  )
  for (const response of clarificationResponses) {
    if (!activeQuestions.has(response.questionId)) {
      throw new SeraVNextProductError(
        'SERA_VNEXT_CLARIFICATION_QUESTION_NOT_ACTIVE',
        `A pergunta ${response.questionId} não está ativa nesta revisão.`,
        409,
      )
    }
  }
  const nextRevision = analysis.current_revision + 1
  const newSupplementalEvidence = clarificationResponses.map((response) => {
    const question = activeQuestions.get(response.questionId)!
    return {
      evidenceId: `SUP-REV${nextRevision}-${response.questionId}`,
      statement: response.response,
      linkedQuestionId: response.questionId,
      stage: question.stage,
      temporalRelation: question.stage === 'SAFE_OPERATION' ? 'PRE_ESCAPE' as const : 'AT_ESCAPE' as const,
    }
  })
  const supplementalEvidence = [] as NonNullable<SeraVNextEngineInput['supplementalEvidence']>
  const seenSupplemental = new Set<string>()
  const usedEvidenceIds = new Set<string>()
  const carried = args.carriedSupplementalEvidence?.length
    ? args.carriedSupplementalEvidence
    : (analysis.engine_input.supplementalEvidence ?? [])
  for (const [index, item] of [...carried, ...newSupplementalEvidence].entries()) {
    const normalized = item.statement.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
    const key = `${item.linkedQuestionId}\u0000${normalized}`
    if (seenSupplemental.has(key)) continue
    seenSupplemental.add(key)
    let evidenceId = item.evidenceId
    if (usedEvidenceIds.has(evidenceId)) {
      evidenceId = `${evidenceId}-M${index}`
      let suffix = 2
      while (usedEvidenceIds.has(evidenceId)) {
        evidenceId = `${item.evidenceId}-M${index}-${suffix}`
        suffix += 1
      }
    }
    usedEvidenceIds.add(evidenceId)
    supplementalEvidence.push({ ...item, evidenceId })
  }
  const locale = args.locale ?? analysis.engine_input.locale ?? 'pt-BR'
  // Engine-only correction is a deterministic replay of the immutable factual and
  // source-anchored semantic evidence already audited for this analysis. Re-running an
  // external LLM here is both operationally fragile (provider/timeouts) and can silently
  // change evidence interpretation without the analyst supplying new facts. A full
  // semantic pass remains reserved for genuine new narrative evidence. Submitted
  // clarifications stay as new factual supplements with immutable source and
  // evidence IDs; the deterministic engine can assess them without requiring
  // a third-party provider to save the analyst's answer. No new semantic
  // hypothesis is inferred from these answers.
  const reuseExistingSemantic = args.reprocessCurrentEngine === true
    || (args.preserveSemanticForClarifications === true && clarificationResponses.length > 0 && !hasNewNarrative)
  let semantic = analysis.source_flow === 'VNEXT_CANONICAL' && !reuseExistingSemantic
    ? await (args.semanticEnricher ?? enrichSeraNarrativeSemantically)({ narrative, locale })
    : null
  let engineInput: SeraVNextEngineInput = {
    ...analysis.engine_input,
    narrative,
    locale,
    supplementalEvidence,
    semanticEvidence: semantic?.annotations ?? analysis.engine_input.semanticEvidence,
    semanticSafeOperationModel: semantic?.safeOperationModel ?? analysis.engine_input.semanticSafeOperationModel,
    semanticEnrichmentMeta: semantic?.meta ?? analysis.engine_input.semanticEnrichmentMeta,
    options: {
      ...analysis.engine_input.options,
      allowLlm: Boolean(semantic ?? analysis.engine_input.semanticEvidence?.length),
      requireHumanReview: true as const,
    },
    requestId: args.context.requestId,
    inputId: `${analysis.client_request_id}:rev:${nextRevision}`,
  }
  let engineOutput = runSeraVNextEngineV0(engineInput)

  const escapePoint = engineOutput.escapePoint.firstDepartureCandidate ?? engineOutput.escapePoint.poaAnchorCandidate
  const needsFocusedPoa = semantic
    && engineOutput.directActor.status === 'IDENTIFIED'
    && Boolean(engineOutput.directActor.actor)
    && Boolean(escapePoint)
    && engineOutput.evidenceSufficiency.questions.some((question) => ['PERCEPTION', 'OBJECTIVE', 'ACTION'].includes(question.stage))
  if (needsFocusedPoa && semantic && escapePoint && engineOutput.directActor.actor) {
    try {
      const focused = await enrichSeraPoaSemantically({
        narrative,
        locale,
        escapePoint,
        directActor: engineOutput.directActor.actor,
      })
      if (focused.annotations.length > 0) {
        const merged = mergeFocusedPoaSemanticEvidence({
          primary: semantic.annotations,
          focused: focused.annotations,
          directActor: engineOutput.directActor.actor,
        })
        semantic = {
          ...semantic,
          annotations: merged,
          meta: {
            ...semantic.meta,
            provider: focused.meta.provider,
            model: focused.meta.model,
            acceptedAnnotations: merged.length,
            rejectedAnnotations: semantic.meta.rejectedAnnotations + focused.meta.rejectedAnnotations,
          },
        }
        engineInput = {
          ...engineInput,
          semanticEvidence: semantic.annotations,
          semanticSafeOperationModel: semantic.safeOperationModel ?? engineInput.semanticSafeOperationModel,
          semanticEnrichmentMeta: semantic.meta,
          options: { ...engineInput.options, allowLlm: true, requireHumanReview: true as const },
        }
        engineOutput = runSeraVNextEngineV0(engineInput)
      }
    } catch (error) {
      console.warn('[SERA semantic P/O/A focus] falling back to primary semantic pass during reanalysis', error instanceof Error ? error.message : String(error))
    }
  }
  if (engineOutput.selectedCode !== null || engineOutput.releasedCode !== null
    || engineOutput.finalConclusion !== null || engineOutput.downstreamAllowed !== false
    || engineOutput.classifiedOutput !== false || engineOutput.readyPromotion !== false) {
    throw new Error('SERA_REANALYSIS_FINAL_OUTPUT_LOCK_VIOLATED')
  }
  const nextStatus = engineOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    ? 'REQUIRES_MORE_EVIDENCE' as const
    : 'CANDIDATE_ANALYSIS_CREATED' as const
  const nextReviewStatus = engineOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    ? 'MORE_EVIDENCE_REQUIRED' as const
    : 'NOT_REVIEWED' as const
  if (analysis.status !== nextStatus) assertValidAnalysisTransition(analysis.status, nextStatus)
  const outputHash = hashJson(engineOutput)
  const revision = await repository.insertRevision({
    analysis_id: analysis.id,
    tenant_id: args.context.tenantId,
    revision_number: nextRevision,
    created_by: args.context.userId,
    request_id: args.context.requestId,
    engine_version: versions.engineVersion,
    engine_runtime_version: versions.engineRuntimeVersion,
    source_flow: analysis.source_flow ?? versions.sourceFlow,
    engine_input: engineInput,
    engine_output: engineOutput,
    engine_output_hash: outputHash,
    reason: args.reason?.trim() || 'reanalyze_analysis',
    metadata: {
      source: 'product_beta_reanalyze',
      clarificationResponses,
      previousNarrativeHash: analysis.narrative_hash,
      updatedNarrativeHash: sha256Hex(narrative),
      additionalNarrativeEvidenceApplied: hasNewNarrative,
      engineRefreshEpoch: SERA_ENGINE_REFRESH_EPOCH,
      reprocessCurrentEngine: args.reprocessCurrentEngine === true,
      evidenceSufficiencyStatus: engineOutput.evidenceSufficiency.status,
      provenance: {
        codeCommit: versions.codeCommit,
        codeCommitSource: versions.codeCommitSource,
        deploymentId: versions.deploymentId,
        semanticEnrichment: semantic?.meta ?? analysis.engine_input.semanticEnrichmentMeta ?? null,
        semanticLayer: semantic ? 'AI_EXTRACTION_DETERMINISTIC_SERA_TRAVERSAL'
          : reuseExistingSemantic && (analysis.engine_input.semanticEvidence?.length ?? 0) > 0
            ? 'REUSED_SOURCE_ANCHORED_SEMANTICS_DETERMINISTIC_TRAVERSAL'
            : 'DETERMINISTIC_FALLBACK',
      },
    },
  })

  const updated = await repository.updateAnalysis(args.context.tenantId, analysis.id, {
    narrative,
    narrative_hash: sha256Hex(narrative),
    status: nextStatus,
    review_status: nextReviewStatus,
    request_id: args.context.requestId,
    engine_version: versions.engineVersion,
    engine_runtime_version: versions.engineRuntimeVersion,
    methodology_version: versions.methodologyVersion,
    baseline_id: versions.baselineId,
    fixture_set_id: versions.fixtureSetId,
    input_schema_version: versions.inputSchemaVersion,
    output_schema_version: versions.outputSchemaVersion,
    code_commit: versions.codeCommit,
    source_flow: analysis.source_flow ?? versions.sourceFlow,
    canonical_tree_version: versions.canonicalTreeVersion,
    engine_input: engineInput,
    engine_output: engineOutput,
    engine_output_hash: outputHash,
    escape_point_status: engineOutput.escapePoint.status,
    escape_point_statement: engineOutput.escapePoint.statement,
    direct_actor: engineOutput.directActor.actor,
    perception_candidate_code: engineOutput.axes.perception.proposedCode,
    objective_candidate_code: engineOutput.axes.objective.proposedCode,
    action_candidate_code: engineOutput.axes.action.proposedCode,
    uncertainties: engineOutput.uncertainties,
    limitations: engineOutput.limitations,
    current_revision: nextRevision,
    generated_by_type: semantic ? 'llm_suggestion' : analysis.generated_by_type ?? 'deterministic_engine',
  })

  await createAuditEvent({
    repository,
    context: args.context,
    analysisId: analysis.id,
    eventType: 'analysis.reanalyzed',
    fromStatus: analysis.status,
    toStatus: nextStatus,
    payload: {
      revisionNumber: nextRevision,
      additionalNarrativeEvidenceApplied: hasNewNarrative,
      clarificationResponsesCount: clarificationResponses.length,
      clarificationQuestionIds: clarificationResponses.map((item) => item.questionId),
      engineRefreshEpoch: SERA_ENGINE_REFRESH_EPOCH,
      reprocessCurrentEngine: args.reprocessCurrentEngine === true,
      evidenceSufficiencyStatus: engineOutput.evidenceSufficiency.status,
      codeCommit: versions.codeCommit,
      codeCommitSource: versions.codeCommitSource,
      deploymentId: versions.deploymentId,
    },
  })
  return { analysis: updated, revision }
}
