import assert from 'node:assert/strict'
import { calibrationCases, validationCases } from './engine-validation-v03-naturalistic/cases'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

type Axis = 'perception' | 'objective' | 'action'
type Expected =
  | { kind: 'code'; axis: Axis; code: string }
  | { kind: 'abstention' }

const expected: Record<string, Expected> = {
  'V03-CAL-01': { kind: 'code', axis: 'perception', code: 'P-B' },
  'V03-CAL-02': { kind: 'abstention' },
  'V03-CAL-03': { kind: 'code', axis: 'perception', code: 'P-H' },
  'V03-CAL-04': { kind: 'code', axis: 'perception', code: 'P-C' },
  'V03-CAL-05': { kind: 'abstention' },
  'V03-CAL-06': { kind: 'abstention' },
  'V03-CAL-07': { kind: 'code', axis: 'action', code: 'A-F' },
  'V03-CAL-08': { kind: 'code', axis: 'action', code: 'A-F' },
  'V03-CAL-09': { kind: 'abstention' },
  'V03-CAL-10': { kind: 'abstention' },
  'V03-CAL-11': { kind: 'code', axis: 'objective', code: 'O-C' },
  'V03-CAL-12': { kind: 'code', axis: 'objective', code: 'O-C' },
  'V03-VAL-01': { kind: 'code', axis: 'action', code: 'A-B' },
  'V03-VAL-02': { kind: 'code', axis: 'perception', code: 'P-B' },
  'V03-VAL-03': { kind: 'code', axis: 'perception', code: 'P-H' },
  'V03-VAL-04': { kind: 'code', axis: 'perception', code: 'P-G' },
  'V03-VAL-05': { kind: 'code', axis: 'action', code: 'A-F' },
  'V03-VAL-06': { kind: 'code', axis: 'perception', code: 'P-H' },
  'V03-VAL-07': { kind: 'abstention' },
  'V03-VAL-08': { kind: 'abstention' },
  'V03-VAL-09': { kind: 'abstention' },
  'V03-VAL-10': { kind: 'abstention' },
  'V03-VAL-11': { kind: 'abstention' },
  'V03-VAL-12': { kind: 'abstention' },
}

// Engineering regression only. It deliberately excludes the frozen V03 holdout cohort.
// These expectations follow the current canonical SERA v1 matrix and conservative
// evidence/escape-point rules; this is not a substitute for human/scientific validation.
const cases = [...calibrationCases, ...validationCases]
assert.equal(cases.length, 24)
assert.equal(Object.keys(expected).length, 24)

for (const testCase of cases) {
  const exp = expected[testCase.caseId]
  assert.ok(exp, 'missing canonical expectation for ' + testCase.caseId)

  const output = runSeraVNextEngineV0({
    inputId: 'CANONICAL-' + testCase.caseId,
    narrative: testCase.narrative,
    locale: testCase.locale,
    sourceType: testCase.sourceType,
    requestId: 'canonical-' + testCase.caseId,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })

  const codes = {
    perception: output.axes.perception.proposedCode,
    objective: output.axes.objective.proposedCode,
    action: output.axes.action.proposedCode,
  }

  if (exp.kind === 'abstention') {
    assert.deepEqual(codes, { perception: null, objective: null, action: null }, testCase.caseId)
  } else {
    assert.equal(codes[exp.axis], exp.code, testCase.caseId + ' expected ' + exp.code)
  }

  assert.equal(output.selectedCode, null)
  assert.equal(output.releasedCode, null)
  assert.equal(output.finalConclusion, null)
  assert.equal(output.classifiedOutput, false)
  assert.equal(output.readyPromotion, false)
  assert.equal(output.downstreamAllowed, false)
  assert.notEqual(output.axes.objective.proposedCode, 'O-E')

  for (const excluded of output.escapePoint.excludedPostEscapeEvidence) {
    assert.equal(output.axes.perception.supportingEvidence.includes(excluded), false, testCase.caseId + ' post-escape P')
    assert.equal(output.axes.objective.supportingEvidence.includes(excluded), false, testCase.caseId + ' post-escape O')
    assert.equal(output.axes.action.supportingEvidence.includes(excluded), false, testCase.caseId + ' post-escape A')
  }

  if (output.escapePoint.status === 'INSUFFICIENT_EVIDENCE' || output.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT') {
    assert.deepEqual(codes, { perception: null, objective: null, action: null }, testCase.caseId + ' no escape => no P/O/A')
    assert.equal(output.preconditions.length, 0, testCase.caseId + ' no escape => no causal preconditions')
  }

  console.log(testCase.caseId, output.escapePoint.status, codes.perception, codes.objective, codes.action)
}

console.log('PASS canonical naturalistic regression v1', cases.length)
