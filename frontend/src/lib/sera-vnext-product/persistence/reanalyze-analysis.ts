import { runSeraVNextEngineV0 } from '@/lib/sera-vnext/engine-v0/run-engine'
import { notFound, SeraVNextProductError } from '../errors'
import { hashJson } from '../hashing'
import { assertValidAnalysisTransition } from '../transitions'
import type { SeraVNextClarificationResponse, SeraVNextProductContext } from '../types'
import { getSeraVNextProductVersionSet } from '../versioning'
import { createAuditEvent } from './create-audit-event'
import { createSeraVNextProductRepository, type SeraVNextProductRepository } from './repositories'

export async function reanalyzeSeraVNextAnalysis(args: {
  analysisId: string
  reason?: string
  clarificationResponses?: SeraVNextClarificationResponse[]
  locale?: 'pt-BR' | 'en'
  context: SeraVNextProductContext
  repository?: SeraVNextProductRepository
}) {
  const repository = args.repository ?? createSeraVNextProductRepository()
  const analysis = await repository.getAnalysis(args.context.tenantId, args.analysisId)
  if (!analysis) throw notFound()
  if (analysis.status !== 'RETURNED_FOR_REANALYSIS' && analysis.status !== 'REQUIRES_MORE_EVIDENCE') {
    throw new Error('SERA_VNEXT_PRODUCT_BETA_REANALYSIS_REQUIRES_RETURNED_OR_MORE_EVIDENCE')
  }

  const clarificationResponses = args.clarificationResponses ?? []
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
  if (analysis.status === 'REQUIRES_MORE_EVIDENCE' && clarificationResponses.length === 0) {
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
  const engineInput = {
    ...analysis.engine_input,
    narrative: analysis.narrative,
    locale: args.locale ?? analysis.engine_input.locale ?? 'pt-BR',
    supplementalEvidence: [...(analysis.engine_input.supplementalEvidence ?? []), ...newSupplementalEvidence],
    requestId: args.context.requestId,
    inputId: `${analysis.client_request_id}:rev:${nextRevision}`,
  }
  const engineOutput = runSeraVNextEngineV0(engineInput)
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
    source_flow: versions.sourceFlow,
    engine_input: engineInput,
    engine_output: engineOutput,
    engine_output_hash: outputHash,
    reason: args.reason?.trim() || 'reanalyze_analysis',
    metadata: {
      source: 'product_beta_reanalyze',
      clarificationResponses,
      evidenceSufficiencyStatus: engineOutput.evidenceSufficiency.status,
    },
  })

  const updated = await repository.updateAnalysis(args.context.tenantId, analysis.id, {
    status: nextStatus,
    review_status: nextReviewStatus,
    request_id: args.context.requestId,
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
      clarificationResponsesCount: clarificationResponses.length,
      clarificationQuestionIds: clarificationResponses.map((item) => item.questionId),
      evidenceSufficiencyStatus: engineOutput.evidenceSufficiency.status,
    },
  })
  return { analysis: updated, revision }
}
