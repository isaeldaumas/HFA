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

const cal01 = run('CAL-01-REGRESSION', 'Durante a preparação para uma decolagem offshore, a tripulação recebeu uma alteração de última hora na sequência de passageiros e bagagens. O copiloto atualizou a documentação e retomou a checklist a partir do ponto em que acreditava ter parado. O item de confirmação do seletor de combustível não foi executado. Após a partida, ainda no táxi, o comandante percebeu que a configuração não correspondia ao previsto e corrigiu antes da decolagem. O copiloto declarou que conhecia o item, que normalmente o executava e que simplesmente não se lembrou de retomá-lo após a interrupção. Não houve falha de indicação do sistema. A mudança de última hora gerou pressão para manter o horário e várias comunicações simultâneas na cabine.')
assert.match(cal01.escapePoint.firstDepartureCandidate ?? '', /item de confirma[cç][aã]o.*seletor de combust[ií]vel.*n[aã]o foi executado/i)
assert.equal(cal01.directActor.actor, 'copiloto', 'passive anchor may be attributed only because the source explicitly assigns the procedure-resumption memory lapse to the copilot')
assert.equal(cal01.axes.action.proposedCode, 'A-B', 'specific checklist omission must reach the canonical A-B implementation-failure leaf')
assert.equal(cal01.axes.objective.proposedCode, null, 'an omitted step does not establish the actor operational objective')
assert.match(cal01.canonicalTraversal.paths.find((path) => path.axis === 'P')?.answers[0]?.responseText ?? '', /acreditava ter retomado a checklist/i)
assert.ok(cal01.preconditions.some((item) => item.canonicalCategory === 'TIME_PRESSURE' && !item.basedOnCandidateCode && item.evidence.some((text) => /press[aã]o para manter o hor[aá]rio/i.test(text))), 'source-grounded schedule pressure must remain visible without being presumed causal')
assert.ok(cal01.preconditions.some((item) => item.category === 'ATTENTION_WORKLOAD_CONTEXT' && !item.basedOnCandidateCode && item.evidence.some((text) => /comunica[cç][oõ]es simult[aâ]neas/i.test(text))), 'simultaneous communications must remain visible as source-grounded context')

const cal02 = run('CAL-02-REGRESSION', 'Em uma aproximação para uma plataforma, ocorreram dois momentos distintos de saída da operação segura. Primeiro, ao configurar a automação para a descida, o piloto selecionou um modo diferente daquele que pretendia, apesar de os modos disponíveis e suas indicações estarem normais. O desvio foi percebido pelo outro piloto e corrigido. Alguns minutos depois, já estabilizada a aproximação, a tripulação interrompeu a checklist para responder a uma chamada operacional. Ao retomá-la, um item de confirmação de configuração não foi executado e só foi identificado após o pouso. Os depoimentos distinguem claramente os dois momentos e indicam mecanismos diferentes: uma seleção incorreta entre alternativas no primeiro e uma omissão de etapa no segundo.')
assert.match(cal02.escapePoint.firstDepartureCandidate ?? '', /primeiro.*selecionou um modo diferente daquele que pretendia/i)
assert.match(cal02.escapePoint.criticalUnsafeActCandidate ?? '', /item de confirma[cç][aã]o de configura[cç][aã]o n[aã]o foi executado/i, 'later checklist omission must remain visible as downstream evolution')
assert.equal(cal02.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(cal02.directActor.actor, 'piloto')
assert.equal(cal02.axes.action.proposedCode, 'A-B', 'selection/configuration different from what was intended is an implementation mismatch')
assert.equal(cal02.axes.objective.proposedCode, null, 'intended control/configuration must not be promoted into an operational goal')
assert.match(cal02.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]?.responseText ?? '', /n[aã]o [eé] poss[ií]vel determinar/i)
assert.match(cal02.canonicalTraversal.paths.find((path) => path.axis === 'A')?.answers[0]?.responseText ?? '', /configurar o sistema.*sele[cç][aã]o de uma alternativa dispon[ií]vel/i, 'action strategy must be neutral and not embed the implementation failure')
for (const axis of [cal02.axes.perception, cal02.axes.objective, cal02.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => /ao retom[aá]-la.*item de confirma[cç][aã]o/i.test(text)), false, 'second deviation must not contaminate first-departure P/O/A')
}

const cal03 = run('CAL-03-REGRESSION', 'Durante uma aproximação offshore em condições de alta carga de trabalho, a tripulação recebeu uma mudança tardia de proa e uma solicitação simultânea de coordenação. Nesse período, o piloto monitorando deixou de acompanhar uma indicação que permanecia disponível e, logo depois, o piloto voando selecionou uma configuração inadequada entre duas alternativas conhecidas. A indicação estava legível e não havia falha técnica. A seleção incorreta não decorreu de desconhecimento do sistema: o piloto descreveu corretamente, após o evento, a função de cada alternativa. Os dois desvios foram detectados por barreiras diferentes e em momentos diferentes, antes de produzirem consequência operacional.')
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
assert.ok(cal03.preconditions.some((item) => item.category === 'ATTENTION_WORKLOAD_CONTEXT' && !item.basedOnCandidateCode && item.evidence.some((text) => /alta carga de trabalho/i.test(text))), 'explicit workload context must remain visible without being promoted to cause')

const al04 = run('AL-04-REGRESSION', 'Em um voo de transporte offshore, um item de preparação foi omitido e a aeronave iniciou uma etapa com uma configuração que precisou ser corrigida logo após a decolagem. A investigação identificou que o tripulante estava no fim de uma sequência intensa de jornadas e relatou cansaço. Na cabine, o outro piloto percebeu que a preparação estava acelerada, mas não interrompeu a sequência porque havia forte gradiente de autoridade. O supervisor de operações havia solicitado prioridade para recuperar atrasos acumulados e não reavaliou a carga de trabalho da tripulação. A programação daquele dia fora montada sem margem para atrasos e sem tripulação reserva disponível, embora a área já tivesse registrado dificuldades recorrentes de recuperação de escala. Não houve defeito técnico na aeronave.')
assert.equal(al04.escapePoint.status, 'CANDIDATE')
assert.match(al04.escapePoint.firstDepartureCandidate ?? '', /item de prepara[cç][aã]o foi omitido/i)
assert.doesNotMatch(al04.escapePoint.firstDepartureCandidate ?? '', /aeronave iniciou/i, 'downstream aircraft state must not be fused into the omission escape point')
assert.match(al04.escapePoint.criticalUnsafeActCandidate ?? '', /aeronave iniciou uma etapa.*configura[cç][aã]o.*corrigida/i, 'downstream unsafe aircraft state must remain visible as occurrence evolution')
assert.equal(al04.directActor.actor, null)
assert.equal(al04.directActor.status, 'AMBIGUOUS', 'passive omission cannot invent an actor')
assert.equal(al04.canonicalTraversal.paths.length, 0, 'P/O/A must remain blocked until the passive omission actor is factually identified')
for (const canonical of ['PHYSIOLOGICAL', 'SOCIAL', 'TIME_PRESSURE', 'MONITORING_SUPERVISION', 'PROVISION_RESOURCES', 'OVERSIGHT'] as const) {
  const pc = al04.preconditions.find((item) => item.canonicalCategory === canonical)
  assert.ok(pc, `${canonical} must remain visible because it is explicitly present in the source`)
  assert.equal(pc?.basedOnCandidateCode, false)
  assert.equal(pc?.methodologyMatch, 'HYPOTHESIS_ONLY')
  assert.equal(pc?.relationship, 'UNRELATED_OR_UNSUPPORTED', 'actor-unresolved case cannot promote contextual factors into causal preconditions')
}

const al04SemanticActorProbe = runSeraVNextEngineV0({
  inputId: 'AL-04-SEMANTIC-ACTOR-PROBE',
  narrative: 'Em um voo de transporte offshore, um item de preparação foi omitido e a aeronave iniciou uma etapa com uma configuração que precisou ser corrigida logo após a decolagem.',
  locale: 'pt-BR',
  sourceType: 'real_event',
  requestId: 'AL-04-SEMANTIC-ACTOR-PROBE',
  mode: 'CANDIDATE_ONLY',
  semanticEvidence: [{
    id: 'SEM-ACTOR-PROBE',
    sourceQuote: 'Em um voo de transporte offshore, um item de preparação foi omitido e a aeronave iniciou uma etapa com uma configuração que precisou ser corrigida logo após a decolagem.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR'],
    concepts: [],
    actor: 'tripulação de voo não especificada',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    confidence: 'HIGH',
    rationale: 'Regression probe: broad semantic crew label cannot invent the actor of a passive omission.',
  }],
  options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: true },
})
assert.equal(al04SemanticActorProbe.directActor.status, 'AMBIGUOUS')
assert.equal(al04SemanticActorProbe.directActor.actor, null)
assert.equal(al04SemanticActorProbe.escapePoint.firstDepartureActor, null, 'semantic broad crew label must not bypass direct-actor fail-closed gate')

const al05 = run('AL-05-REGRESSION', 'No terceiro setor de um dia operacional prolongado, o copiloto omitiu uma etapa rotineira da checklist de pós-pouso. O item só foi percebido durante a preparação para o setor seguinte. Ele afirmou conhecer perfeitamente o procedimento e não relatou dúvida sobre a ação correta. Na entrevista, informou ter dormido cerca de quatro horas na noite anterior, ter iniciado a apresentação muito cedo e sentir sonolência desde o segundo setor. O comandante confirmou bocejos frequentes e redução do ritmo de resposta. Não havia pressão temporal relevante naquele momento, nem falha de equipamento ou informação ambígua. O evento não produziu dano e a configuração foi regularizada antes do próximo voo.')
assert.equal(al05.directActor.actor, 'copiloto')
assert.equal(al05.axes.action.proposedCode, 'A-B')
assert.equal(al05.axes.objective.proposedCode, null)
const physiological = al05.preconditions.find((item) => item.canonicalCategory === 'PHYSIOLOGICAL' && !item.basedOnCandidateCode)
assert.ok(physiological, 'sleep restriction, drowsiness, yawning and slowed response must be preserved as physiological evidence')
assert.equal(physiological?.relationship, 'ENABLING_PRECONDITION')
assert.equal(physiological?.methodologyMatch, 'EVIDENCED_OUTSIDE_MOST_LIKELY_SET', 'source evidence may support an Annex-B factor even when it is outside the A-B Table 1 most-likely set')
assert.match(physiological?.evidence.join(' ') ?? '', /quatro horas.*sonol[eê]ncia|bocejos.*redu[cç][aã]o do ritmo/i)
assert.equal(al05.preconditions.some((item) => !item.basedOnCandidateCode && item.canonicalCategory === 'TIME_PRESSURE'), false, 'explicit absence of relevant time pressure must not become a source-grounded time-pressure factor')

for (const output of [cal01, cal02, al05]) {
  const taxonomyOnly = output.preconditions.filter((item) => item.basedOnCandidateCode && item.evidence.length === 0)
  assert.ok(taxonomyOnly.length > 0, 'Table 1 routes should remain available as investigation guidance after an A-B candidate')
  assert.equal(taxonomyOnly.every((item) => item.methodologyMatch === 'HYPOTHESIS_ONLY' && item.relationship === 'UNRELATED_OR_UNSUPPORTED'), true)
}

console.log('PASS human calibration first five regression — full source narratives, passive actor attribution, downstream sequencing, A-B implementation, explicit contextual factors, physiological evidence')
