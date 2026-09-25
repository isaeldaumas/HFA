import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const narrative =
  'During the night approach, the crew noticed unstable indications and descended below the intended glide path. The captain decided to continue the approach despite the warning. Seconds later the aircraft struck runway lights and sustained damage.'

const result = runSeraVNextEngineV0({
  inputId: 'ENGINE-V0-CONTRACT-001',
  narrative,
  locale: 'en',
  sourceType: 'neutral_trial',
  requestId: 'ENGINE-V0-CONTRACT-001',
  mode: 'VALIDATION',
  options: { allowLlm: false, requireHumanReview: true },
})

assert.equal(result.engineVersion, '0.3.0')
assert.equal(result.methodologyVersion, 'SERA_PT_V1_FROZEN')
assert.equal(result.baselineId, 'SERA_VNEXT_BASELINE_V0')
assert.equal(result.fixtureSetId, 'SERA_VNEXT_FIXTURE_SET_V0')
assert.ok(result.factualExtraction.facts.length >= 3)
assert.ok(result.factualExtraction.timeline.length >= 3)
assert.equal(result.selectedCode, null)
assert.equal(result.releasedCode, null)
assert.equal(result.finalConclusion, null)
assert.equal(result.classifiedOutput, false)
assert.equal(result.readyPromotion, false)
assert.equal(result.downstreamAllowed, false)
assert.equal(result.humanReviewRequired, true)
assert.ok(result.humanReviewPackage.reviewerDecisionsRequired.length >= 1)
console.log('ENGINE_V0_CONTRACT_OK')
