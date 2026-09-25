import { forbiddenTransition } from './errors'
import type { SeraVNextAnalysisStatus, SeraVNextReviewDecision, SeraVNextReviewStatus } from './statuses'

const allowedTransitions: Record<SeraVNextAnalysisStatus, SeraVNextAnalysisStatus[]> = {
  CANDIDATE_ANALYSIS_CREATED: ['UNDER_HUMAN_REVIEW', 'ARCHIVED'],
  UNDER_HUMAN_REVIEW: ['REQUIRES_MORE_EVIDENCE', 'HUMAN_REVIEW_COMPLETED_NON_FINAL', 'RETURNED_FOR_REANALYSIS', 'ARCHIVED'],
  REQUIRES_MORE_EVIDENCE: ['RETURNED_FOR_REANALYSIS', 'CANDIDATE_ANALYSIS_CREATED', 'ARCHIVED'],
  RETURNED_FOR_REANALYSIS: ['CANDIDATE_ANALYSIS_CREATED', 'REQUIRES_MORE_EVIDENCE', 'ARCHIVED'],
  HUMAN_REVIEW_COMPLETED_NON_FINAL: ['ARCHIVED'],
  ARCHIVED: ['CANDIDATE_ANALYSIS_CREATED', 'UNDER_HUMAN_REVIEW', 'REQUIRES_MORE_EVIDENCE', 'RETURNED_FOR_REANALYSIS', 'HUMAN_REVIEW_COMPLETED_NON_FINAL'],
}

export function canTransitionAnalysisStatus(from: SeraVNextAnalysisStatus, to: SeraVNextAnalysisStatus): boolean {
  return allowedTransitions[from]?.includes(to) ?? false
}

export function assertValidAnalysisTransition(from: SeraVNextAnalysisStatus, to: SeraVNextAnalysisStatus): void {
  if (!canTransitionAnalysisStatus(from, to)) {
    throw forbiddenTransition(`Transição inválida: ${from} -> ${to}`)
  }
}

export function reviewDecisionToStatuses(decision: SeraVNextReviewDecision): {
  analysisStatus: SeraVNextAnalysisStatus
  reviewStatus: SeraVNextReviewStatus
} {
  switch (decision) {
    case 'ACCEPT_AS_WORKING_HYPOTHESIS':
      return {
        analysisStatus: 'HUMAN_REVIEW_COMPLETED_NON_FINAL',
        reviewStatus: 'WORKING_HYPOTHESIS_ACCEPTED',
      }
    case 'REJECT_WORKING_HYPOTHESIS':
      return {
        analysisStatus: 'HUMAN_REVIEW_COMPLETED_NON_FINAL',
        reviewStatus: 'WORKING_HYPOTHESIS_REJECTED',
      }
    case 'REQUIRES_MORE_EVIDENCE':
      return {
        analysisStatus: 'REQUIRES_MORE_EVIDENCE',
        reviewStatus: 'MORE_EVIDENCE_REQUIRED',
      }
    case 'RETURN_FOR_REANALYSIS':
      return {
        analysisStatus: 'RETURNED_FOR_REANALYSIS',
        reviewStatus: 'REANALYSIS_REQUIRED',
      }
  }
}

export function statusBeforeReview(status: SeraVNextAnalysisStatus): SeraVNextAnalysisStatus {
  if (status === 'CANDIDATE_ANALYSIS_CREATED') return 'UNDER_HUMAN_REVIEW'
  return status
}
