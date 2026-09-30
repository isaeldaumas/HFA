import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const narrative = `
A 5 milhas da plataforma, já a 500 pés, a tripulação verificou pelo radar que estava em IMC e, mesmo assim, a gente resolveu continuar o voo e tentar o pouso.
Mais tarde, o piloto 2 desacoplou o Diretor de Voo.
Quando recebeu o aviso para tomar cuidado com a velocidade, o piloto 2 colocou barra na barra, como fazia no outro equipamento, embora naquele equipamento o correto fosse pitch down.
A velocidade chegou a zero e a razão de descida aumentou. O outro piloto assumiu os comandos e recuperou a aeronave.
`

const output = runSeraVNextEngineV0({
  inputId: 'SINGLE-ESCAPE-POA-001',
  narrative,
  locale: 'pt-BR',
  sourceType: 'real_event',
  requestId: 'single-escape-poa-001',
  mode: 'CANDIDATE_ONLY',
  options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
})

assert.match(output.escapePoint.firstDepartureCandidate ?? '', /500 p[eé]s.*IMC.*continuar/i)
assert.match(output.escapePoint.criticalUnsafeActCandidate ?? '', /barra na barra|desacoplou/i)
assert.notEqual(output.escapePoint.firstDepartureCandidate, output.escapePoint.criticalUnsafeActCandidate)
assert.equal(output.escapePoint.poaAnchorBasis, 'FIRST_DEPARTURE')
assert.equal(output.escapePoint.poaAnchorCandidate, output.escapePoint.firstDepartureCandidate)
assert.notEqual(output.escapePoint.poaAnchorCandidate, output.escapePoint.criticalUnsafeActCandidate)
assert.match(output.directActor.actor ?? '', /tripula[cç][aã]o|decis[aã]o conjunta/i)
for (const axis of [output.axes.perception, output.axes.objective, output.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => /barra na barra|desacoplou.*diretor de voo/i.test(text)), false)
}
assert.equal('trajectories' in output, false, 'the canonical engine must not emit secondary SERA P/O/A trajectories')
assert.equal(output.selectedCode, null)
assert.equal(output.releasedCode, null)
assert.equal(output.humanReviewRequired, true)

console.log('PASS single escape-point methodology — first safe→unsafe departure is the sole P/O/A anchor')
