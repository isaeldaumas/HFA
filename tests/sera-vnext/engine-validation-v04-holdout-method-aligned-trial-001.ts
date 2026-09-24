import assert from 'node:assert/strict'
import { holdoutCases, type EngineV03Expected } from './engine-validation-v03-naturalistic/cases'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const expected: Record<string, { expected: EngineV03Expected; rationale: string }> = {
  'V03-HLD-01': { expected: { kind: 'code', axis: 'objective', code: 'O-D' }, rationale: 'Contract/client productivity pressure without explicit awareness of a known rule/limit is O-D, not O-C.' },
  'V03-HLD-02': { expected: { kind: 'code', axis: 'objective', code: 'O-D' }, rationale: 'Operational/contractual productivity pressure without explicit known-rule deviation is O-D.' },
  'V03-HLD-03': { expected: { kind: 'code', axis: 'action', code: 'A-F' }, rationale: 'Pulling instead of pushing is a wrong response selection among available alternatives.' },
  'V03-HLD-04': { expected: { kind: 'code', axis: 'action', code: 'A-H' }, rationale: 'Eight-second hesitation before executing the correct maneuver is an execution-timing failure.' },
  'V03-HLD-05': { expected: { kind: 'abstention' }, rationale: 'Fatigue/rostering is precondition context; the narrative does not establish a sufficiently specific active-failure mechanism.' },
  'V03-HLD-06': { expected: { kind: 'abstention' }, rationale: 'Training reduction is a precondition and the report conclusion cannot substitute for a supported active-failure mechanism.' },
  'V03-HLD-07': { expected: { kind: 'abstention' }, rationale: 'Rule interpretation remains ambiguous and no conscious known-rule deviation is established.' },
  'V03-HLD-08': { expected: { kind: 'abstention' }, rationale: 'Ambiguous rule interpretation and an incident-free landing do not establish a causal escape point.' },
  'V03-HLD-09': { expected: { kind: 'abstention' }, rationale: 'Timely go-around preserved safe operation; no unsafe-operation escape point exists to classify.' },
  'V03-HLD-10': { expected: { kind: 'abstention' }, rationale: 'Correct response to an external runway closure preserved safe operation; no active failure exists.' },
  'V03-HLD-11': { expected: { kind: 'abstention' }, rationale: 'Bird strike is the initiating condition and the report explicitly lacks evidence to attribute a human active failure.' },
  'V03-HLD-12': { expected: { kind: 'abstention' }, rationale: 'Multiple factors are listed without causal order or dominant mechanism; abstention is required.' },
}

function passes(e: EngineV03Expected, o: ReturnType<typeof runSeraVNextEngineV0>): boolean {
  const codes = { perception: o.axes.perception.proposedCode, objective: o.axes.objective.proposedCode, action: o.axes.action.proposedCode }
  if (e.kind === 'abstention') return !codes.perception && !codes.objective && !codes.action
  if (e.kind === 'notCode') return codes[e.axis] !== e.code
  return codes[e.axis] === e.code
}

let failed = 0
for (const c of holdoutCases) {
  const target = expected[c.caseId]
  if (!target) throw new Error('Missing method-aligned holdout expectation for ' + c.caseId)
  const o = runSeraVNextEngineV0({
    inputId: 'V04-HOLDOUT-' + c.caseId,
    narrative: c.narrative,
    locale: c.locale,
    sourceType: c.sourceType,
    requestId: 'V04-HOLDOUT-' + c.caseId,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
  const ok = passes(target.expected, o)
  if (!ok) failed += 1
  console.log(ok ? 'PASS' : 'FAIL', c.caseId, JSON.stringify(target.expected), '=>',
    o.escapePoint.status, o.axes.perception.proposedCode, o.axes.objective.proposedCode, o.axes.action.proposedCode)
}
console.log('SUMMARY', JSON.stringify({ total: holdoutCases.length, pass: holdoutCases.length - failed, fail: failed }))
assert.equal(failed, 0)

console.log('\nMETHOD_ALIGNED_HOLDOUT_RATIONALE')
for (const c of holdoutCases) console.log(c.caseId + ': ' + expected[c.caseId].rationale)
