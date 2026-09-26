import assert from 'node:assert/strict'
import { computeRiskAttentionIndex } from '../../frontend/src/lib/risk-profile/attention-score'
import { normalizeRiskProfileVNextPreconditions } from '../../frontend/src/lib/risk-profile/precondition-normalization'
import { normalizeRiskProfileVNextStatus } from '../../frontend/src/lib/risk-profile/source-status'

const psCdq = computeRiskAttentionIndex([
  { perceptionCode: 'P-G', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 0, openNoOwner: 0, openTotal: 0, totalActions: 0 })
assert.equal(Math.round(psCdq.base), 42)
assert.equal(psCdq.actionPenalty, 0)
assert.equal(psCdq.score, 42)

const withActions = computeRiskAttentionIndex([
  { perceptionCode: 'P-G', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 1, openNoOwner: 1, openTotal: 2, totalActions: 4 })
assert.equal(withActions.actionPenalty, 17)
assert.equal(withActions.score, 59)

const noFailure = computeRiskAttentionIndex([
  { perceptionCode: 'P-A', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 0, openNoOwner: 0, openTotal: 0, totalActions: 0 })
assert.equal(noFailure.score, 0)

const supportedPreconditions = normalizeRiskProfileVNextPreconditions({
  preconditions: [
    { category: 'ENVIRONMENTAL_CONTEXT', relationship: 'CONTEXTUAL_PRECONDITION' },
    { category: 'ATTENTION_WORKLOAD_CONTEXT', relationship: 'UNRELATED_OR_UNSUPPORTED' },
    { category: 'TEAM_COORDINATION', relationship: 'UNRELATED_OR_UNSUPPORTED' },
    { category: 'FEEDBACK_VERIFICATION', relationship: 'ENABLING_PRECONDITION' },
  ],
})
assert.deepEqual(supportedPreconditions, ['ENVIRONMENTAL_CONTEXT', 'FEEDBACK_VERIFICATION'])

assert.equal(normalizeRiskProfileVNextStatus('REQUIRES_MORE_EVIDENCE', 'MORE_EVIDENCE_REQUIRED', null), 'received')
assert.equal(normalizeRiskProfileVNextStatus('CANDIDATE_ANALYSIS_CREATED', 'NOT_REVIEWED', null), 'provisional')
assert.equal(normalizeRiskProfileVNextStatus('HUMAN_REVIEW_COMPLETED_NON_FINAL', 'REVIEWED', null), 'completed')

console.log('PASS risk profile provisional analyses and corrective-action weighting')
