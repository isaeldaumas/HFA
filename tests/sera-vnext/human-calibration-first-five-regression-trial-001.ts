import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

function run(inputId: string, narrative: string) {
  return runSeraVNextEngineV0({
    inputId,
    narrative,
    locale: 'pt-BR',
    sourceType: 'real_event',
    requestId: inputId,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
}

const cal01 = run('CAL-01-REGRESSION', [
  'Durante a preparação para decolagem offshore, a checklist foi interrompida para atualização da documentação.',
  'O copiloto atualizou a documentação e retomou a checklist a partir do ponto em que acreditava ter parado.',
  'O copiloto não executou o item de confirmação do seletor de combustível.',
].join(' '))
assert.match(cal01.escapePoint.firstDepartureCandidate ?? '', /n[aã]o executou.*item de confirma[cç][aã]o.*seletor de combust[ií]vel/i)
assert.equal(cal01.directActor.actor, 'copiloto')
assert.equal(cal01.axes.action.proposedCode, 'A-B', 'specific checklist omission must reach the canonical A-B implementation-failure leaf')
assert.equal(cal01.axes.objective.proposedCode, null, 'an omitted step does not establish the actor operational objective')
assert.match(cal01.canonicalTraversal.paths.find((path) => path.axis === 'P')?.answers[0]?.responseText ?? '', /acreditava ter retomado a checklist/i)

const cal02 = run('CAL-02-REGRESSION', 'Primeiro, ao configurar a automação para a descida, o piloto selecionou um modo diferente daquele que pretendia, apesar de os modos disponíveis e suas indicações estarem normais.')
assert.equal(cal02.axes.action.proposedCode, 'A-B', 'selection/configuration different from what was intended is an implementation mismatch')
assert.equal(cal02.axes.objective.proposedCode, null, 'intended control/configuration must not be promoted into an operational goal')
assert.match(cal02.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]?.responseText ?? '', /n[aã]o [eé] poss[ií]vel determinar/i)
assert.doesNotMatch(cal02.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]?.responseText ?? '', /operador pretendia Primeiro/i)

const cal03 = run('CAL-03-REGRESSION', 'Nesse período, o piloto monitorando deixou de acompanhar uma indicação que permanecia disponível e, logo depois, o piloto voando selecionou uma configuração inadequada entre duas alternativas conhecidas.')
assert.match(cal03.escapePoint.firstDepartureCandidate ?? '', /piloto monitorando deixou de acompanhar uma indica[cç][aã]o/i)
assert.doesNotMatch(cal03.escapePoint.firstDepartureCandidate ?? '', /piloto voando/i, 'later PF act must not remain inside the PM escape-point clause')
assert.match(cal03.escapePoint.criticalUnsafeActCandidate ?? '', /piloto voando selecionou uma configura[cç][aã]o inadequada/i)
assert.equal(cal03.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(cal03.directActor.actor, 'piloto monitorando (PM)')
assert.equal(cal03.escapePoint.criticalUnsafeActActor, 'piloto voando (PF)')
assert.notEqual(cal03.axes.action.proposedCode, 'A-F', 'later PF selection must not contaminate the PM P/O/A traversal')
for (const axis of [cal03.axes.perception, cal03.axes.objective, cal03.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => /piloto voando selecionou/i.test(text)), false)
}

const al04 = run('AL-04-REGRESSION', 'Em um voo de transporte offshore, um item de preparação foi omitido e a aeronave iniciou uma etapa com uma configuração que precisou ser corrigida logo após a decolagem.')
assert.equal(al04.escapePoint.status, 'CANDIDATE')
assert.match(al04.escapePoint.firstDepartureCandidate ?? '', /item de prepara[cç][aã]o foi omitido/i)
assert.doesNotMatch(al04.escapePoint.firstDepartureCandidate ?? '', /aeronave iniciou/i, 'downstream aircraft state must not be fused into the omission escape point')
assert.equal(al04.directActor.status, 'AMBIGUOUS', 'passive omission cannot invent an actor')
assert.equal(al04.canonicalTraversal.paths.length, 0, 'P/O/A must remain blocked until the passive omission actor is factually identified')

const al05 = run('AL-05-REGRESSION', 'No terceiro setor de um dia operacional prolongado, o copiloto omitiu uma etapa rotineira da checklist de pós-pouso.')
assert.equal(al05.directActor.actor, 'copiloto')
assert.equal(al05.axes.action.proposedCode, 'A-B')
const readiness = al05.preconditions.find((item) => item.canonicalCategory === 'PERSONAL_READINESS')
assert.ok(readiness, 'prolonged duty context must remain visible for readiness investigation')
assert.equal(readiness?.methodologyMatch, 'HYPOTHESIS_ONLY')
assert.equal(readiness?.relationship, 'UNRELATED_OR_UNSUPPORTED')
assert.equal(readiness?.confidence, 'LOW')
assert.match(readiness?.description ?? '', /n[aã]o equivale a fadiga confirmada/i, 'duty exposure must not be converted into diagnosed/confirmed fatigue')

for (const output of [cal01, cal02, al05]) {
  const taxonomyOnly = output.preconditions.filter((item) => item.basedOnCandidateCode && item.evidence.length === 0)
  assert.ok(taxonomyOnly.length > 0, 'Table 1 routes should remain available as investigation guidance after an A-B candidate')
  assert.equal(taxonomyOnly.every((item) => item.methodologyMatch === 'HYPOTHESIS_ONLY' && item.relationship === 'UNRELATED_OR_UNSUPPORTED'), true)
}

console.log('PASS human calibration first five regression — A-B omission, action-intent boundary, multi-actor sequencing, passive actor gate, duty-readiness context')
