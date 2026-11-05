import assert from 'node:assert/strict'
import {
  generateDevelopmentAuthorWorksheet,
  validateDevelopmentAuthorWorksheet,
  renderDevelopmentAuthorWorksheetHtml,
} from './dev-author-adjudication-contract'

const template = generateDevelopmentAuthorWorksheet('V03-CAL-07')
assert.equal(template.sourceSentences.length, 6)
assert.equal(template.inputContainsEnginePredictions, false)
assert.ok(!JSON.stringify(template).includes('The operator intended to execute a go-around.'))
assert.ok(!JSON.stringify(template).includes('A-F'))
assert.ok(!JSON.stringify(template).includes('O-A'))
assert.equal(validateDevelopmentAuthorWorksheet(template).status, 'UNREVIEWED_TEMPLATE_VALID')
const html = renderDevelopmentAuthorWorksheetHtml(template)
assert.match(html, /Ficha de revisão humana/)
assert.match(html, /não usar ações de recuperação/)
assert.match(html, /SOURCE-S005/)
assert.match(html, /default-src &#39;none&#39;/)
assert.ok(!html.includes('O-A') && !html.includes('A-F'), 'ENGINE_CODE_LEAK_TO_HUMAN_FORM')
assert.ok(!html.includes('<script') && !html.includes('<iframe') && !html.includes('http://') && !html.includes('https://'))
assert.ok(html.includes('&quot;checked&quot;'), 'SOURCE_HTML_ESCAPING_REQUIRED')
assert.throws(() => generateDevelopmentAuthorWorksheet('V03-HLD-01'), /SEALED_CASE_ID_FORBIDDEN/)
assert.throws(() => generateDevelopmentAuthorWorksheet('V04_SEALED_001'), /SEALED_CASE_ID_FORBIDDEN/)
assert.throws(() => generateDevelopmentAuthorWorksheet('V03-CAL-99'), /CASE_NOT_IN_EXPOSED/)

function mutate(fn: (x: ReturnType<typeof generateDevelopmentAuthorWorksheet>) => void) {
  const copy = structuredClone(template)
  fn(copy)
  return copy
}
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  x.sourceSentences[2].statement = 'Fictional source.'
})), /SOURCE_PROVENANCE_CHANGED/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  x.narrativeSha256 = 'x'.repeat(64)
})), /UNAUTHORIZED_METADATA_CHANGE/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  (x as any).releasedCode = 'O-A'
})), /UNEXPECTED_KEYS_ROOT/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  x.scientificValidation = 'NOT_RUN'
  ;(x as any).methodologicalGate = 'READY_FOR_SCIENTIFIC_RELEASE'
})), /UNAUTHORIZED_METADATA_CHANGE/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  x.reviewStatus = 'HUMAN_INPUT_RECORDED_NOT_VERIFIED'
  x.reviewerReference = 'Reviewer-001'
})), /HUMAN_INPUT_EMPTY/)

const partial = mutate(x => {
  x.reviewStatus = 'HUMAN_INPUT_RECORDED_NOT_VERIFIED'
  x.reviewerReference = 'Test reviewer: not an actual signoff'
  x.axes.O.status = 'UNRESOLVED'
  x.axes.O.rationale =
    'The supplied narrative does not establish what the operator intended at the exact first departure from safe operation.'
})
const validated = validateDevelopmentAuthorWorksheet(partial)
assert.equal(validated.status, 'HUMAN_INPUT_FORMAT_VALID_NOT_VERIFIED')
assert.deepEqual(validated.reviewedAxisIds, ['O'])
assert.equal(validated.approvedForRuntime, false)
assert.equal(validated.releasedCodes, null)
assert.equal(validated.reviewerIdentityVerified, false)
assert.equal(validated.independentScientificValidation, 'NOT_RUN')
assert.equal(validated.downstreamAllowed, false)

const positive = mutate(x => {
  x.reviewStatus = 'HUMAN_INPUT_RECORDED_NOT_VERIFIED'
  x.reviewerReference = 'Synthetic-test-only, no real reviewer'
  x.escapePointReview = {
    status: 'ACCEPT_SOURCE_ANCHOR_AS_CANDIDATE',
    anchorSourceIds: ['SOURCE-S002'],
    justification:
      'Synthetic test: this input claims the first unsafe departure occurred in the captain initial unacted acknowledgment.',
  }
  x.axes.O.status = 'PROVISIONAL_CODE'
  x.axes.O.code = 'O-A'
  x.axes.O.temporalBasis = 'PRE_OR_AT_ESCAPE'
  x.axes.O.sourceIds = ['SOURCE-S005']
  x.axes.O.rationale =
    'Synthetic test: a code was provisionally suggested solely to exercise the data-format checks, not to assert its validity.'
})
assert.throws(() => validateDevelopmentAuthorWorksheet(positive), /MISSING_SUBSTANTIVE_TEMPORAL_JUSTIFICATION_O/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  Object.assign(x, structuredClone(positive))
  x.axes.O.temporalBasis = 'POST_ESCAPE_ONLY'
  x.axes.O.temporalExplanation = 'Synthetic test explanation of why later evidence has no pre-escape applicability.'
})), /CODE_REQUIRES_AT_ESCAPE_TEMPORAL_BASIS_O/)
const allowedOnlyAsInput = structuredClone(positive)
allowedOnlyAsInput.axes.O.temporalExplanation =
  'Synthetic test provides a purported temporal explanation; the tool checks text presence, not factual correctness or timing.'
const v = validateDevelopmentAuthorWorksheet(allowedOnlyAsInput)
assert.equal(v.status, 'HUMAN_INPUT_FORMAT_VALID_NOT_VERIFIED')
assert.equal(v.releasedCodes, null)

assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  Object.assign(x, structuredClone(allowedOnlyAsInput))
  x.axes.O.code = 'O-E'
})), /NONCANONICAL_CODE_O/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  Object.assign(x, structuredClone(allowedOnlyAsInput))
  x.axes.O.sourceIds = ['SOURCE-S999']
})), /UNVERIFIABLE_SOURCE_ID_O/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  Object.assign(x, structuredClone(allowedOnlyAsInput))
  x.axes.O.sourceIds = ['SOURCE-S005', 'SOURCE-S005']
})), /DUPLICATE_SOURCE_ID_O/)
assert.throws(() => validateDevelopmentAuthorWorksheet(mutate(x => {
  Object.assign(x, structuredClone(allowedOnlyAsInput))
  x.escapePointReview.status = 'PENDING'
})), /PENDING_ESCAPE_HAS_SOURCES/)

console.log('DEV_AUTHOR_WORKSHEET_CONTRACT_PASS', JSON.stringify({
  sourceSentences: template.sourceSentences.length,
  protectedScientificStatus: validated.independentScientificValidation,
  version: template.schemaVersion,
  confirmedNoRelease: validated.releasedCodes === null,
  status: 'NON_BLIND_SYNTHETIC_DEVELOPMENT_ONLY',
}))
