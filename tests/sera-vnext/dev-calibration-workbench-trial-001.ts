import assert from 'node:assert/strict'
import { createDevelopmentCalibrationReport, evaluateDevelopmentCase } from './dev-calibration-workbench'
import { holdoutCases } from './engine-validation-v03-naturalistic/cases'

const report = createDevelopmentCalibrationReport()
assert.equal(report.schemaVersion, 'HFA_DEV_CALIBRATION_READONLY_V1')
assert.equal(report.metrics.total, 24)
assert.equal(report.scientificUse, false)
assert.equal(report.sealedHoldoutExecuted, false)
assert.equal(report.holdoutEligible, false)
assert.equal(report.scientificValidation, 'NOT_RUN')
assert.equal(report.methodologicalGate, 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
assert.equal(report.productionAuthorization, 'NOT_AUTHORIZED')
assert.equal(report.automatedDecisionAuthorized, false)
assert.equal(report.metrics.criticalGuardrailsPass, true)
assert.equal(report.metrics.unscoredAdditionalCodeCases, 1)
assert.deepEqual(report.pendingHumanReview, [{
  caseId: 'V03-CAL-07',
  extraUnscoredCodes: [{ axis: 'objective', code: 'O-A' }],
  reason: 'V03_EXPECTED_ONLY_ONE_AXIS; no independent per-axis reference',
}])
for (const entry of report.cases) {
  assert.ok(!entry.caseId.startsWith('V03-HLD-'), 'holdout leaked')
  assert.match(entry.narrativeSha256, /^[a-f0-9]{64}$/)
  assert.equal(Object.keys(entry.actual).length, 3)
  for (const axis of ['perception', 'objective', 'action'] as const) {
    assert.ok(entry.actual[axis].status)
    assert.ok(entry.actual[axis].evidenceCount >= 0)
  }
}
assert.throws(() => evaluateDevelopmentCase(holdoutCases[0]), /SEALED_OR_UNAPPROVED_COHORT_FORBIDDEN/)
console.log('DEV_CALIBRATION_WORKBENCH_CONTRACT_PASS', JSON.stringify(report.metrics))
console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
