import assert from 'node:assert/strict'
import { calibrationCases, validationCases, type EngineV03Expected } from './engine-validation-v03-naturalistic/cases'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const corrections: Record<string, { expected: EngineV03Expected; rationale: string }> = {
  'V03-CAL-03': {
    expected: { kind: 'code', axis: 'perception', code: 'P-H' },
    rationale: 'System reverted without alerting the crew; information/communication availability failure is causal before any independent action error.',
  },
  'V03-CAL-08': {
    expected: { kind: 'code', axis: 'action', code: 'A-F' },
    rationale: 'Copilot inserted a flight level different from the chart: wrong selection among available alternatives, not a generic procedural omission.',
  },
  'V03-CAL-09': {
    expected: { kind: 'abstention' },
    rationale: 'Narrative states a long touchdown/overrun outcome but does not establish a specific pre-escape action mechanism; causal anchoring requires abstention.',
  },
  'V03-CAL-11': {
    expected: { kind: 'code', axis: 'objective', code: 'O-C' },
    rationale: 'Known minimum + explicit awareness + conscious one-off decision to depart below the minimum = exceptional/non-routine conscious violation.',
  },
  'V03-CAL-12': {
    expected: { kind: 'code', axis: 'objective', code: 'O-C' },
    rationale: 'Known approach rule + explicit awareness + conscious continuation = exceptional/non-routine conscious violation.',
  },
  'V03-VAL-03': {
    expected: { kind: 'code', axis: 'perception', code: 'P-H' },
    rationale: 'Autothrottle disconnected without clear annunciation; information availability/communication failure precedes the late corrective action.',
  },
  'V03-VAL-04': {
    expected: { kind: 'code', axis: 'perception', code: 'P-G' },
    rationale: 'Mode indication was present on the display but not noticed: available/correct information not monitored/integrated.',
  },
  'V03-VAL-06': {
    expected: { kind: 'code', axis: 'perception', code: 'P-H' },
    rationale: 'Critical discrepancy was conveyed in a low voice and not processed; the operative mechanism is degraded communication/information delivery.',
  },
}

function classify(expected: EngineV03Expected, out: ReturnType<typeof runSeraVNextEngineV0>): boolean {
  const codes = {
    perception: out.axes.perception.proposedCode,
    objective: out.axes.objective.proposedCode,
    action: out.axes.action.proposedCode,
  }
  if (expected.kind === 'abstention') return !codes.perception && !codes.objective && !codes.action
  if (expected.kind === 'notCode') return codes[expected.axis] !== expected.code
  return codes[expected.axis] === expected.code
}

const results: Array<{ caseId: string; pass: boolean; expected: EngineV03Expected; original: EngineV03Expected; changed: boolean }> = []

for (const c of [...calibrationCases, ...validationCases]) {
  const correction = corrections[c.caseId]
  const expected = correction?.expected ?? c.expected
  const out = runSeraVNextEngineV0({
    inputId: 'V04-' + c.caseId,
    narrative: c.narrative,
    locale: c.locale,
    sourceType: c.sourceType,
    requestId: 'V04-' + c.caseId,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
  const pass = classify(expected, out)
  results.push({ caseId: c.caseId, pass, expected, original: c.expected, changed: !!correction })
  console.log(pass ? 'PASS' : 'FAIL', c.caseId, JSON.stringify(expected), '=>',
    out.axes.perception.proposedCode, out.axes.objective.proposedCode, out.axes.action.proposedCode)
}

const failures = results.filter((r) => !r.pass)
console.log('SUMMARY', JSON.stringify({ total: results.length, pass: results.length - failures.length, fail: failures.length, rebaselined: Object.keys(corrections).length }))
if (failures.length) console.log('FAILURES', JSON.stringify(failures, null, 2))
assert.equal(failures.length, 0)

console.log('\nREBASELINE_RATIONALE')
for (const [caseId, correction] of Object.entries(corrections)) {
  console.log(caseId + ': ' + correction.rationale)
}
