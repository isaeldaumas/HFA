/**
 * Development-exposed synthetic V03-CAL-07 contrast, not validation.
 * This test documents which later statements trigger candidate O-A.
 * NO assertion ratifies the current candidate. The author must adjudicate it.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { calibrationCases } from './engine-validation-v03-naturalistic/cases'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const c = calibrationCases.find(x => x.caseId === 'V03-CAL-07')
assert.ok(c)
assert.equal(c.sourceType, 'synthetic')
assert.equal(c.group, 'calibration')
const run = (label: string, narrative: string) => {
  const result = runSeraVNextEngineV0({
    inputId: 'DEV-CAL-CONTRAST-' + label,
    narrative, sourceType: 'synthetic', locale: c.locale,
    sourceReference: 'EXPOSED_SYNTHETIC_DEV_CAL07_CONTRAST',
    requestId: 'contrast-' + label,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true },
  })
  assert.equal(result.selectedCode, null)
  assert.equal(result.releasedCode, null)
  assert.equal(result.finalConclusion, null)
  assert.equal(result.classifiedOutput, false)
  assert.equal(result.readyPromotion, false)
  assert.equal(result.downstreamAllowed, false)
  assert.equal(result.humanReviewRequired, true)
  return {
    label,
    sourceSha256: createHash('sha256').update(narrative, 'utf8').digest('hex'),
    codes: {
      perception: result.axes.perception.proposedCode,
      objective: result.axes.objective.proposedCode,
      action: result.axes.action.proposedCode,
    },
    pointOfEscape: result.escapePoint.status,
    objectiveSupportNotLiteral: result.axes.objective.supportingEvidence
      .filter(quote => !narrative.includes(quote))
      .slice(0, 2),
  }
}

const initial = run('FULL_ORIGINAL', c.narrative)
const original = runSeraVNextEngineV0({
  inputId: 'DEV-CAL-CONTRAST-ANCHOR',
  narrative: c.narrative, sourceType: 'synthetic', locale: c.locale,
  sourceReference: 'EXPOSED_SYNTHETIC_DEV_CAL07_CONTRAST',
  requestId: 'contrast-anchor', mode: 'CANDIDATE_ONLY',
  options: { allowLlm: false, requireHumanReview: true },
})
const anchor = original.escapePoint.poaAnchorCandidate ?? original.escapePoint.firstDepartureCandidate
assert.ok(anchor)
const sourceIndex = original.factualExtraction.timeline
  .find(t => t.statement === anchor || t.statement.includes(anchor) || anchor.includes(t.statement))?.sourceSentenceIndex
assert.ok(typeof sourceIndex === 'number')
const prefix = original.factualExtraction.timeline
  .filter(t => t.sourceSentenceIndex <= sourceIndex)
  .map(t => t.statement).join(' ')
assert.ok(prefix.length > 40)
const add = (suffix: string) => prefix + ' ' + suffix
const contrast = [
  initial,
  run('PREFIX_TO_ANCHOR', prefix),
  run('LATER_GO_AROUND_ONLY', add('The captain finally called for the go-around.')),
  run('LATER_OUTCOME_ONLY', add('The landing damaged the nose gear.')),
  run('LATER_GO_AROUND_NEUTRAL', add('The captain later called for a go-around.')),
  run('LATER_INTENDED_GO_AROUND', add('The captain intended to go around but delayed the call.')),
  run('LATER_PM_TESTIMONY', add('The first officer stated after landing that the captain intended to go around.')),
]
assert.equal(contrast.length, 7)
assert.ok(contrast.every(x => x.pointOfEscape === 'CANDIDATE'))
const report = {
  schemaVersion: 'HFA_DEV_CAL07_CONTRAST_V1',
  scientificValidation: 'NOT_RUN',
  methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
  sourceExposure: 'DEVELOPMENT_EXPOSED_SYNTHETIC_ONLY',
  finalOutputsBlocked: true,
  authorAdjudication: 'PENDING',
  assertionOfCorrectness: false,
  note: 'Variant responses are observations, not desired targets. Future changes are not automatically correct or wrong.',
  anchorSourceIndex: sourceIndex,
  contrast,
}
console.log('DEV_CAL07_CONTRAST_PASS', JSON.stringify(report))
