import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

function run(id: string, narrative: string) {
  return runSeraVNextEngineV0({
    inputId: id,
    narrative,
    locale: 'pt-BR',
    sourceType: 'real_event',
    requestId: id,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
}

const outcomeOnly = run(
  'CLARIFY-OUTCOME-ONLY',
  'A aeronave pousou em uma unidade diferente da planejada. O relatório não informa quem pilotava, quando a identificação mudou nem quais informações estavam disponíveis.',
)

assert.equal(outcomeOnly.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.deepEqual(
  {
    p: outcomeOnly.axes.perception.proposedCode,
    o: outcomeOnly.axes.objective.proposedCode,
    a: outcomeOnly.axes.action.proposedCode,
  },
  { p: null, o: null, a: null },
)
assert.equal(outcomeOnly.preconditions.length, 0)
assert.equal(outcomeOnly.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')
assert.equal(outcomeOnly.evidenceSufficiency.minimumEvidenceSatisfied, false)
assert.ok(outcomeOnly.evidenceSufficiency.blockingReasons.includes('ESCAPE_POINT_NOT_ESTABLISHED'))
assert.ok(outcomeOnly.evidenceSufficiency.questions.some((q) => q.stage === 'ESCAPE_POINT'))
assert.match(
  outcomeOnly.evidenceSufficiency.questions.find((q) => q.stage === 'ESCAPE_POINT')?.question ?? '',
  /primeira ação, decisão ou omissão humana/i,
)

const partial = run(
  'CLARIFY-PARTIAL',
  'O copiloto era PF. O destino era UNIT-B. A tripulação iniciou aproximação para UNIT-A. O relato não informa o que o copiloto acreditava estar vendo nem quais informações estavam disponíveis em cabine.',
)

assert.equal(partial.escapePoint.status, 'CANDIDATE')
assert.equal(partial.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')
assert.ok(partial.evidenceSufficiency.questions.some((q) => q.linkedNodeId === 'P_ASSESSMENT'))
assert.ok(partial.evidenceSufficiency.questions.some((q) => q.linkedNodeId === 'O_RULES'))
assert.ok(partial.evidenceSufficiency.questions.some((q) => q.linkedNodeId === 'A_IMPLEMENTED'))
assert.equal(partial.axes.perception.proposedCode, null)
assert.equal(partial.axes.objective.proposedCode, null)
assert.equal(partial.axes.action.proposedCode, null)
assert.equal(partial.preconditions.length, 0)

const sufficient = run(
  'CLARIFY-SUFFICIENT',
  `O primeiro destino programado era UNIT-B. O comandante atuava como PM e o copiloto como PF.
O GPS continha as coordenadas corretas de UNIT-B. UNIT-A ficava praticamente sobre a rota e deveria apenas ser sobrevoada.
Ao avistar UNIT-A, a tripulação passou a tratá-la como a unidade prevista para o primeiro pouso e iniciou o planejamento da aproximação para ela.
A autorização recebida permanecia válida somente para UNIT-B.
Depois do pouso em UNIT-A, o erro foi comunicado à tripulação.`,
)

assert.equal(sufficient.evidenceSufficiency.status, 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS')
assert.equal(sufficient.evidenceSufficiency.minimumEvidenceSatisfied, true)
assert.equal(sufficient.evidenceSufficiency.questions.length, 0)
assert.equal(sufficient.axes.perception.proposedCode, 'P-G')
assert.equal(sufficient.axes.objective.proposedCode, 'O-A')
assert.equal(sufficient.axes.action.proposedCode, 'A-A')

console.log('PASS evidence sufficiency and clarification gate')
