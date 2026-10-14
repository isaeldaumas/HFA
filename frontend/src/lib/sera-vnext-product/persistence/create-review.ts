import { notFound, SeraVNextProductError } from '../errors'
import { assertValidAnalysisTransition, reviewDecisionToStatuses, statusBeforeReview } from '../transitions'
import type { SeraVNextProductContext, SeraVNextReviewInput, SeraVNextReviewRecord } from '../types'
import { createAuditEvent } from './create-audit-event'
import { createSeraVNextProductRepository, type SeraVNextProductRepository } from './repositories'

export async function createSeraVNextReview(args: {
  analysisId: string
  input: SeraVNextReviewInput
  context: SeraVNextProductContext
  repository?: SeraVNextProductRepository
}): Promise<{ review: SeraVNextReviewRecord; status: string; reviewStatus: string }> {
  const repository = args.repository ?? createSeraVNextProductRepository()
  let analysis = await repository.getAnalysis(args.context.tenantId, args.analysisId)
  if (!analysis) throw notFound()
  if (analysis.status === 'ARCHIVED') throw notFound('Análise arquivada não pode ser revisada.')

  // A review is a human decision record, not a new engine run. Keep every prior
  // review and allow another authorized reviewer to challenge a non-final result.
  const existingReviews = await repository.listReviews(args.context.tenantId, analysis.id)
  const alreadyRecorded = existingReviews.find((item) => item.request_id === args.context.requestId)
  if (alreadyRecorded) return { review: alreadyRecorded, status: analysis.status, reviewStatus: analysis.review_status }
  if (analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
    && (args.input.decision === 'ACCEPT_AS_WORKING_HYPOTHESIS'
      || args.input.evidenceSufficiency === 'SUFFICIENT_FOR_WORKING_HYPOTHESIS')) {
    throw new SeraVNextProductError('SERA_REVIEW_CANNOT_ACCEPT_BLOCKED_EVIDENCE', 'Não é possível aceitar uma hipótese enquanto a evidência está bloqueada.', 422)
  }

  const reviewStartStatus = statusBeforeReview(analysis.status)
  if (reviewStartStatus !== analysis.status) {
    assertValidAnalysisTransition(analysis.status, reviewStartStatus)
    analysis = await repository.updateAnalysis(args.context.tenantId, analysis.id, {
      status: reviewStartStatus,
      review_status: 'IN_REVIEW',
    })
    await createAuditEvent({
      repository,
      context: args.context,
      analysisId: analysis.id,
      eventType: 'analysis.review_started',
      fromStatus: 'CANDIDATE_ANALYSIS_CREATED',
      toStatus: reviewStartStatus,
      payload: { reviewStatus: 'IN_REVIEW' },
    })
  }

  const target = reviewDecisionToStatuses(args.input.decision)
  if (analysis.status !== target.analysisStatus) assertValidAnalysisTransition(analysis.status, target.analysisStatus)
  const nextReviewVersion = existingReviews.reduce((max, item) => Math.max(max, item.review_version), 0) + 1
  const review = await repository.insertReview({
    analysis_id: analysis.id,
    tenant_id: args.context.tenantId,
    reviewer_id: args.context.userId,
    decision: args.input.decision,
    review_notes: args.input.reviewNotes ?? null,
    escape_point_assessment: args.input.escapePointAssessment ?? null,
    perception_assessment: args.input.perceptionAssessment ?? null,
    objective_assessment: args.input.objectiveAssessment ?? null,
    action_assessment: args.input.actionAssessment ?? null,
    preconditions_assessment: args.input.preconditionsAssessment ?? null,
    evidence_sufficiency: args.input.evidenceSufficiency,
    requires_more_evidence: args.input.requiresMoreEvidence,
    review_version: nextReviewVersion,
    request_id: args.context.requestId,
    metadata: { ...args.input.metadata, basedOnEngineRevision: analysis.current_revision },
  })

  await repository.updateAnalysis(args.context.tenantId, analysis.id, {
    status: target.analysisStatus,
    review_status: target.reviewStatus,
  })
  await createAuditEvent({
    repository,
    context: args.context,
    analysisId: analysis.id,
    eventType: target.analysisStatus === 'RETURNED_FOR_REANALYSIS' ? 'analysis.returned' : 'analysis.review_submitted',
    fromStatus: analysis.status,
    toStatus: target.analysisStatus,
    payload: {
      decision: args.input.decision,
      evidenceSufficiency: args.input.evidenceSufficiency,
      requiresMoreEvidence: args.input.requiresMoreEvidence,
      reviewVersion: nextReviewVersion,
      engineRevision: analysis.current_revision,
    },
  })

  return { review, status: target.analysisStatus, reviewStatus: target.reviewStatus }
}
