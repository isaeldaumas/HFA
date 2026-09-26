import assert from 'node:assert/strict'
import { computeRiskAttentionIndex } from '../../frontend/src/lib/risk-profile/attention-score'

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

console.log('PASS risk profile provisional analyses and corrective-action weighting')
