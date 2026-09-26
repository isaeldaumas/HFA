import type { RiskProfileSourceStatus } from './types'

export function normalizeRiskProfileVNextStatus(
  status: string | null | undefined,
  reviewStatus: string | null | undefined,
  deletedAt: string | null | undefined,
): RiskProfileSourceStatus {
  if (deletedAt || status === 'ARCHIVED') return 'archived'
  if (status === 'HUMAN_REVIEW_COMPLETED_NON_FINAL' || reviewStatus === 'REVIEWED' || reviewStatus === 'APPROVED') return 'completed'
  if (status === 'REQUIRES_MORE_EVIDENCE' || reviewStatus === 'MORE_EVIDENCE_REQUIRED') return 'received'
  if (status === 'UNDER_HUMAN_REVIEW') return 'processing'
  if (status === 'CANDIDATE_ANALYSIS_CREATED' || reviewStatus === 'NOT_REVIEWED') return 'provisional'
  return 'draft'
}
