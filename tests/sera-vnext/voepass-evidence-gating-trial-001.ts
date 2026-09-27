import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { classifyCanonicalPrecondition } from '../../frontend/src/lib/sera-vnext/precondition-taxonomy'
import { classifyPreconditionCategory } from '../../frontend/src/lib/sera-vnext/engine-v0/utils'

const authorDecision = readFileSync(path.resolve(__dirname, '../../docs/sera-vnext/SERA_PT_AUTHOR_DECISION_HUMAN_FACTOR_ESCAPE_SCOPE_v1.0.md'), 'utf8')
assert.match(authorDecision, /human-factors investigation/i)
assert.match(authorDecision, /one unsafe act at a time/i)
assert.match(authorDecision, /Purely technical failures, weather states, documentary statements or organizational conditions cannot, by themselves/i)

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

const referenceTrap = run('VOEPASS-REFERENCE-TRAP', `
COMANDO DA AERONÁUTICA. RELATÓRIO FINAL. ADVERTÊNCIA.
O objetivo único deste trabalho é recomendar o estudo e o estabelecimento de providências de caráter preventivo.
Approach (APP – aproximação) – armava ou ativava o modo de aproximação para capturar sinais de uma rota final de aproximação para pouso.
Conforme o checklist da aeronave, a inserção do peso era feita por meio de um botão rotativo localizado no painel do APM.
As luzes permitiam alertar a tripulação e indicar a urgência da situação.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)

assert.equal(referenceTrap.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(referenceTrap.axes.perception.proposedCode, null)
assert.equal(referenceTrap.axes.objective.proposedCode, null)
assert.equal(referenceTrap.axes.action.proposedCode, null)
const evidenceTypes = new Map(referenceTrap.factualExtraction.evidence.map((item) => [item.statement, item.evidenceType]))
assert.ok([...evidenceTypes.entries()].some(([text, type]) => /objetivo único deste trabalho/i.test(text) && type === 'NON_CAUSAL_DOCUMENT'))
assert.ok([...evidenceTypes.entries()].some(([text, type]) => /Approach \(APP/i.test(text) && type === 'SYSTEM_DESCRIPTION'))
assert.equal(referenceTrap.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')

const collectiveActor = run('VOEPASS-COLLECTIVE-ACTOR', `
O voo encontrou formação de gelo. A tripulação reconheceu a falha AIRFRAME DE-ICING.
A tripulação decidiu continuar no nível de voo apesar da falha e manteve a trajetória.
`)

assert.equal(collectiveActor.escapePoint.status, 'CANDIDATE')
assert.equal(collectiveActor.directActor.status, 'AMBIGUOUS')
assert.equal(collectiveActor.axes.perception.proposedCode, null)
assert.equal(collectiveActor.axes.objective.proposedCode, null)
assert.equal(collectiveActor.axes.action.proposedCode, null)
assert.ok(collectiveActor.evidenceSufficiency.blockingReasons.includes('DIRECT_ACTOR_UNRESOLVED'))

const icingEvent = run('VOEPASS-EVENT-CHAIN', `
O comandante era o PF e o copiloto era o PM. Durante o voo em condições de gelo, o comandante verbalizou que o AIRFRAME DE-ICING havia falhado.
O copiloto comentou que, para não pegar gelo, teriam que voar no FL110. O comandante decidiu continuar no FL170 e manteve a trajetória.
O QRH estabelecia que, diante da falha do AIRFRAME DE-ICING em condições de gelo, a tripulação deveria abandonar a condição de formação de gelo.
O alerta MASTER CAUTION indicava uma condição anormal com necessidade de ação urgente.
`)
assert.equal(icingEvent.escapePoint.status, 'CANDIDATE')
assert.match(icingEvent.escapePoint.statement ?? '', /comandante|FL170|falh/i)
assert.doesNotMatch(icingEvent.escapePoint.statement ?? '', /Approach \(APP/i)
assert.equal(icingEvent.directActor.status, 'IDENTIFIED')
assert.notEqual(icingEvent.axes.perception.proposedCode, 'P-E')
assert.notEqual(icingEvent.axes.objective.proposedCode, 'O-D')
assert.notEqual(icingEvent.axes.action.proposedCode, 'A-H')
assert.equal(icingEvent.guardrails.nonCausalEvidenceUsed, false)
assert.equal(icingEvent.guardrails.escapePointReferenceContamination, false)
assert.equal(icingEvent.guardrails.candidateEvidenceMinimumMissing, false)

for (const axis of [icingEvent.axes.perception, icingEvent.axes.objective, icingEvent.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => /objetivo único deste trabalho|Approach \(APP|botão rotativo/i.test(text)), false)
}

console.log('PASS VoePass evidence gating and fail-closed regression')

// Global context may reconstruct the operational episode, but it must never bypass the canonical tree.
const fullContextEpisode = run('VOEPASS-GLOBAL-CONTEXT-CANONICAL-FLOW', `
3. CONCLUSÕES
3.1. Fatos
k) A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
m) As condições meteorológicas no nível de voo planejado configuravam um ambiente propício a SEV ICE.
n) As condições meteorológicas previstas para a rota, antes do despacho, não foram avaliadas adequadamente pelo CCO, DOV e PIC.
p) Durante a subida, ao cruzar aproximadamente o FL130, o Electronic Ice Detector indicou acúmulo de gelo.
q) No voo do acidente, a aeronave apresentou falha no sistema Airframe De-Icing, ainda durante a subida.
s) Os procedimentos previstos no checklist para a falha do sistema Airframe De-Icing não foram realizados.
x) Os procedimentos previstos para o acionamento dos avisos CRUISE SPEED LOW não foram executados.
O alerta MASTER WARNING apresentava indicação da urgência da situação.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)
assert.equal(fullContextEpisode.escapePoint.status, 'CANDIDATE')
// Hendy keeps the first departure and the most critical unsafe act distinct when the evidence supports both.
assert.match(fullContextEpisode.escapePoint.firstDepartureCandidate ?? '', /despachada.*MEL/i)
assert.match(fullContextEpisode.escapePoint.criticalUnsafeActCandidate ?? '', /procedimentos previstos|CRUISE SPEED LOW|checklist|Airframe De-Icing/i)
assert.equal(fullContextEpisode.escapePoint.anchorBasis, 'CRITICAL_UNSAFE_ACT')
assert.match(fullContextEpisode.escapePoint.statement ?? '', /procedimentos previstos|CRUISE SPEED LOW|checklist|Airframe De-Icing/i)
assert.doesNotMatch(fullContextEpisode.escapePoint.statement ?? '', /despachada.*MEL/i)
assert.equal(fullContextEpisode.escapePoint.humanFactorGate?.status, 'PASSED')
assert.equal(fullContextEpisode.escapePoint.humanFactorGate?.anchorType, 'UNSAFE_ACT')
assert.ok(fullContextEpisode.escapePoint.supportingEvidence.some((text) => /Airframe De-Icing|procedimentos previstos|CRUISE SPEED LOW/i.test(text)))
assert.equal(fullContextEpisode.escapePoint.supportingEvidence.some((text) => /despachada sem as restrições impostas pela MEL/i.test(text)), false)
assert.ok(fullContextEpisode.escapePoint.counterEvidence.some((text) => /Multiple human-factor unsafe-act\/condition candidates/i.test(text)))
assert.ok(fullContextEpisode.escapePoint.counterEvidence.some((text) => /Hendy boundary split/i.test(text)))
assert.equal(fullContextEpisode.directActor.status, 'AMBIGUOUS')
assert.equal(fullContextEpisode.directActor.actor, null)
assert.equal(fullContextEpisode.directActor.alternatives.some((actor) => /^(CCO|DOV|PIC)$/i.test(actor)), false)
const criticalActorQuestion = fullContextEpisode.evidenceSufficiency.questions.find((question) => question.id === 'CLARIFY-DIRECT-ACTOR')
assert.ok(criticalActorQuestion)
assert.match(criticalActorQuestion?.question ?? '', /tripulante|PF|PM/i)
assert.doesNotMatch(criticalActorQuestion?.question ?? '', /despacho|liberação operacional/i)
assert.deepEqual(
  [fullContextEpisode.axes.perception.proposedCode, fullContextEpisode.axes.objective.proposedCode, fullContextEpisode.axes.action.proposedCode],
  [null, null, null],
)
assert.equal(fullContextEpisode.axes.perception.statementAtEscapePoint, null)
assert.equal(fullContextEpisode.axes.objective.statementAtEscapePoint, null)
assert.equal(fullContextEpisode.axes.action.statementAtEscapePoint, null)
assert.equal(fullContextEpisode.canonicalTraversal.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(fullContextEpisode.canonicalTraversal.paths.length, 0)
assert.ok((fullContextEpisode.escapePoint.episodeCandidates ?? []).some((episode) => episode.selected && episode.seraRole === 'HUMAN_FACTOR_CANDIDATE'))
assert.ok((fullContextEpisode.escapePoint.episodeCandidates ?? []).filter((episode) => episode.humanFactorEligible).length >= 2)
assert.equal(fullContextEpisode.preconditions.some((item) => item.category === 'TIME_PRESSURE'), false)
const fullContextPreconditionEvidence = fullContextEpisode.preconditions.flatMap((item) => item.evidence)
assert.equal(fullContextPreconditionEvidence.some((text) => /procedimentos previstos.*não foram (?:executados|realizados)/i.test(text)), false)
assert.equal(fullContextPreconditionEvidence.some((text) => /não foram avaliadas adequadamente.*CCO.*DOV.*PIC/i.test(text)), false)
const warningUrgency = fullContextEpisode.factualExtraction.evidence.find((item) => /urgência da situação/i.test(item.statement))
assert.ok(warningUrgency)
assert.equal(warningUrgency?.evidenceType, 'SYSTEM_DESCRIPTION')
assert.ok(warningUrgency?.prohibitedFor.includes('PRECONDITION'))

// Historical comparator flights may inform context, but cannot become the escape point or P/O/A evidence for the current occurrence.
const historicalComparator = run('VOEPASS-HISTORICAL-COMPARATOR-SCOPE', `
1.18.1.3. Voo -1
A tripulação manteve o Airframe De-Icing ligado após a falha e selecionou o FL160 como novo nível de cruzeiro.
A aeronave operou com baixa velocidade e alertas de desempenho.
1.18.2. Voo do acidente
Durante a subida, o Electronic Ice Detector indicou acúmulo de gelo e o sistema Airframe De-Icing apresentou falha.
Os procedimentos previstos no checklist para a falha do sistema Airframe De-Icing não foram realizados.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)
assert.notEqual(historicalComparator.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.doesNotMatch(historicalComparator.escapePoint.earliestCandidate ?? '', /FL160|novo nível de cruzeiro/i)
assert.match(historicalComparator.escapePoint.earliestCandidate ?? '', /procedimentos previstos|não foram realizados/i)
const priorFlightEvidence = historicalComparator.factualExtraction.evidence.find((item) => /FL160 como novo nível/i.test(item.statement))
assert.ok(priorFlightEvidence)
assert.equal(priorFlightEvidence?.occurrenceScope, 'HISTORICAL_COMPARATOR')
for (const use of ['ESCAPE_POINT', 'PERCEPTION', 'OBJECTIVE', 'ACTION'] as const) {
  assert.ok(priorFlightEvidence?.prohibitedFor.includes(use))
}

// If a code is ever proposed, it must be the terminal result of its canonical node-by-node path.
for (const axisName of ['P', 'O', 'A'] as const) {
  const axis = axisName === 'P' ? icingEvent.axes.perception : axisName === 'O' ? icingEvent.axes.objective : icingEvent.axes.action
  if (!axis.proposedCode) continue
  const path = icingEvent.canonicalTraversal.paths.find((candidate) => candidate.axis === axisName)
  assert.ok(path, `${axisName}: proposed code requires a canonical traversal path`)
  assert.equal(path?.candidateCode, axis.proposedCode)
  assert.ok((path?.nodeIds.length ?? 0) > 0)
  assert.ok((path?.answers.length ?? 0) > 0)
}


// An upstream maintenance/dispatch departure must not displace a later critical unsafe act directly linked to the outcome.
const upstreamSceneSetter = run('SERA-HENDY-FIRST-VS-CRITICAL', `
A inspeção pré-voo foi concluída sem detectar anormalidade e a aeronave foi liberada com a pane do sistema de proteção contra gelo não identificada.
Durante o voo, o comandante reconheceu a formação de gelo severo, mas decidiu continuar na condição e manteve a trajetória.
Os procedimentos previstos no checklist para abandonar a condição de gelo não foram executados.
Como consequência, a aeronave perdeu velocidade, entrou em stall e colidiu contra o solo.
`)
assert.match(upstreamSceneSetter.escapePoint.firstDepartureCandidate ?? '', /continuar|manteve/i)
assert.match(upstreamSceneSetter.escapePoint.criticalUnsafeActCandidate ?? '', /procedimentos previstos|checklist/i)
assert.doesNotMatch(upstreamSceneSetter.escapePoint.statement ?? '', /inspeção pré-voo|liberada/i)
assert.equal(upstreamSceneSetter.escapePoint.supportingEvidence.some((text) => /inspeção pré-voo|liberada/i.test(text)), false)
assert.equal(upstreamSceneSetter.escapePoint.anchorBasis, 'CRITICAL_UNSAFE_ACT')
assert.ok(upstreamSceneSetter.escapePoint.counterEvidence.some((text) => /Hendy boundary split/i.test(text)))

// VoePass terminal chain: keep upstream dispatch as the first departure, but anchor P/O/A on
// the observable SIC input against the stick pusher. Preserve the later irreversibility marker
// as a boundary corroborator, not as the unsafe act itself.
const terminalControlAct = run('VOEPASS-HENDY-TERMINAL-CONTROL-ACT', `
k) A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
aa) O alerta INCREASE SPEED foi acionado e ocorreu 13 segundos antes do Stall Warning System.
cc) Os procedimentos previstos para o acionamento do alerta INCREASE SPEED não foram executados.
dd) Os valores de AOA atingiram o valor limite de ativação do stall warning em condições de gelo.
ee) Os procedimentos previstos para a recuperação do stall não foram executados.
ff) Os valores de AOA atingiram o valor limite de ativação do stick pusher.
Durante a atuação do stick pusher, os dados registrados mostraram que o SIC voltou a fazer esforço acima de 10 daN, no sentido a cabrar (NOSE UP), em oposição à atuação do stick pusher, contrariando a orientação do QRH.
A atuação contrária ao sentido do stick pusher provocou esforço diferencial capaz de ativar o pitch uncoupling mechanism.
Com essa amplitude de AOA, a recuperação da aeronave já não era mais possível e, a partir desse momento, a perda de controle tornou-se irreversível.
A aeronave perdeu o controle e colidiu contra o solo.
`)
assert.match(terminalControlAct.escapePoint.firstDepartureCandidate ?? '', /despachada.*MEL/i)
assert.match(terminalControlAct.escapePoint.criticalUnsafeActCandidate ?? '', /SIC.*NOSE UP.*oposi[cç][aã]o.*stick pusher/i)
assert.match(terminalControlAct.escapePoint.statement ?? '', /SIC.*NOSE UP.*stick pusher/i)
assert.doesNotMatch(terminalControlAct.escapePoint.statement ?? '', /provocou.*pitch uncoupling/i)
assert.match(terminalControlAct.escapePoint.irreversibilityBoundaryCandidate ?? '', /n[aã]o era mais poss[ií]vel|irrevers[ií]vel/i)
assert.equal(terminalControlAct.escapePoint.anchorBasis, 'CRITICAL_UNSAFE_ACT')
assert.equal(terminalControlAct.directActor.status, 'IDENTIFIED')
assert.match(terminalControlAct.directActor.actor ?? '', /copiloto|first officer/i)
assert.equal(terminalControlAct.guardrails.consequenceUsedAsCause, false)
assert.equal(terminalControlAct.guardrails.postEscapeEvidenceUsed, false)
assert.equal(terminalControlAct.axes.perception.supportingEvidence.some((text) => /Roselawn|Lombardia/i.test(text)), false)
assert.equal(terminalControlAct.axes.objective.supportingEvidence.some((text) => /Roselawn|Lombardia/i.test(text)), false)
assert.equal(terminalControlAct.axes.action.supportingEvidence.some((text) => /Roselawn|Lombardia/i.test(text)), false)

// A purely technical failure can be important context, but it cannot by itself start SERA P/O/A.
const technicalOnly = run('SERA-HUMAN-FACTOR-GATE-TECHNICAL-ONLY', `
Durante a subida, o sistema Airframe De-Icing apresentou falha.
Havia formação de gelo severo na rota.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)
assert.equal(technicalOnly.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(technicalOnly.escapePoint.humanFactorGate?.status, 'BLOCKED')
assert.equal(technicalOnly.escapePoint.humanFactorGate?.anchorType, null)
assert.deepEqual([technicalOnly.axes.perception.proposedCode, technicalOnly.axes.objective.proposedCode, technicalOnly.axes.action.proposedCode], [null, null, null])

// Hendy also permits an operator-controlled unsafe condition to mark the boundary.
const controlledCondition = run('SERA-HUMAN-FACTOR-GATE-CONTROLLED-CONDITION', `
Durante a aproximação, a aeronave desceu abaixo da MDA sem a pista à vista.
Posteriormente ocorreu o impacto com o terreno.
`)
assert.notEqual(controlledCondition.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(controlledCondition.escapePoint.humanFactorGate?.status, 'PASSED')
assert.equal(controlledCondition.escapePoint.humanFactorGate?.anchorType, 'OPERATOR_CONTROLLED_UNSAFE_CONDITION')
assert.equal(controlledCondition.unsafeActOrCondition.type, 'UNSAFE_CONDITION')

// Long source reports must retain late operational facts instead of truncating after 800 records.
const longReportFiller = Array.from({ length: 920 }, (_, index) =>
  `Descrição técnica ${index + 1}. O sistema de referência apresentava parâmetros documentais sem ação operacional observável.`,
).join('\n')
const longReport = run('VOEPASS-LONG-REPORT-LATE-FACTS', `
${longReportFiller}
Descrição de referência: system failure é um termo genérico de documentação técnica e não define o ator do evento.
1.18. Histórico do voo
16h17min26s – o PIC iniciou a comunicação para os passageiros, informou que em breve iniciariam a descida e comentou as condições meteorológicas no destino.
16h18min09s – o SIC iniciou nova comunicação via VHF2 com a base da empresa.
3. CONCLUSÕES
3.1. Fatos
k) A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL;
n) As condições meteorológicas previstas para a rota, antes do despacho da aeronave, não foram avaliadas adequadamente pelo CCO, DOV e PIC;
s) Os procedimentos previstos no checklist para a falha do sistema Airframe De-Icing não foram realizados;
x) Os procedimentos previstos para o acionamento dos avisos CRUISE SPEED LOW não foram executados.
`)
assert.notEqual(longReport.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.match(longReport.escapePoint.firstDepartureCandidate ?? '', /despachada.*MEL/i)
assert.match(longReport.escapePoint.criticalUnsafeActCandidate ?? '', /procedimentos previstos|checklist|CRUISE SPEED LOW/i)
assert.match(longReport.escapePoint.statement ?? '', /procedimentos previstos|checklist|CRUISE SPEED LOW/i)
assert.equal(longReport.escapePoint.status, 'CANDIDATE')
assert.equal(longReport.directActor.status, 'AMBIGUOUS')
assert.equal(longReport.directActor.actor, null)
assert.equal(longReport.directActor.alternatives.some((actor) => /^(CCO|DOV|PIC)$/i.test(actor)), false)
const longCriticalActorQuestion = longReport.evidenceSufficiency.questions.find((question) => question.id === 'CLARIFY-DIRECT-ACTOR')
assert.ok(longCriticalActorQuestion)
assert.match(longCriticalActorQuestion?.question ?? '', /tripulante|PF|PM/i)
assert.doesNotMatch(longCriticalActorQuestion?.question ?? '', /despacho|liberação operacional/i)
assert.ok(longReport.factualExtraction.evidence.some((item) => /despachada sem as restrições impostas pela MEL/i.test(item.statement)))
assert.ok(longReport.factualExtraction.evidence.some((item) => /procedimentos previstos no checklist.*não foram realizados/i.test(item.statement)))

// Actors may be decomposed only when the escape-point sentence itself identifies them.
const dispatchActorsInAnchor = run('VOEPASS-DISPATCH-ACTORS-IN-ANCHOR', `
3.1. Fatos
As condições meteorológicas previstas para a rota, antes do despacho da aeronave, não foram avaliadas adequadamente pelo CCO, DOV e PIC.
`)
assert.notEqual(dispatchActorsInAnchor.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(dispatchActorsInAnchor.directActor.status, 'AMBIGUOUS')
assert.deepEqual(new Set(dispatchActorsInAnchor.directActor.alternatives), new Set(['CCO', 'DOV', 'PIC']))

// Investigation-report document order is not event chronology. System/reference prose must not become post-escape evidence.
const temporalScope = run('VOEPASS-TEMPORAL-SCOPE-DISPATCH', `
3.1. Fatos
A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
Durante o voo em rota, realizado no FL170, o Airframe De-Icing apresentou falha e a aeronave encontrou condições de gelo severo.
Esse nível compreendia principalmente falhas de sistemas sem impacto imediato na segurança.
Os boots, quando em operação, atuavam no sentido de quebrar o gelo acumulado nos bordos de ataque.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)
const laterInflight = temporalScope.factualExtraction.evidence.find((item) => /Durante o voo em rota/i.test(item.statement))
assert.ok(laterInflight)
assert.equal(laterInflight?.temporalRelation, 'POST_ESCAPE')
const noImmediateImpact = temporalScope.factualExtraction.evidence.find((item) => /sem impacto imediato na segurança/i.test(item.statement))
assert.ok(noImmediateImpact)
assert.notEqual(noImmediateImpact?.temporalRelation, 'POST_ESCAPE')
const bootsDescription = temporalScope.factualExtraction.evidence.find((item) => /Os boots/i.test(item.statement))
assert.ok(bootsDescription)
assert.equal(bootsDescription?.evidenceType, 'SYSTEM_DESCRIPTION')
assert.notEqual(bootsDescription?.temporalRelation, 'POST_ESCAPE')
assert.equal(temporalScope.escapePoint.excludedPostEscapeEvidence.some((item) => /sem impacto imediato|Os boots/i.test(item)), false)

// Positive training provision is context, not a training-deficiency precondition.
const positiveTraining = run('VOEPASS-POSITIVE-TRAINING-NOT-PRECONDITION', `
3.1. Fatos
A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
O Programa de Treinamento de Operações incluía treinamento UPRT e treinamento para operações em condições meteorológicas adversas, ambos integrados às sessões em FFS.
`)
assert.equal(positiveTraining.preconditions.some((item) => item.category === 'KNOWLEDGE_TRAINING'), false)

// Generic system descriptions and maintenance-program references are not preconditions merely because they mention monitoring.
const monitoringReferenceNoise = run('VOEPASS-MONITORING-REFERENCE-NOISE', `
A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
Relatórios gerados pelo Aircraft Condition Monitoring System eram responsáveis pelo monitoramento das condições operacionais dos sistemas da aeronave.
Luzes MASTER WARNING e MASTER CAUTION, quando acesas, permaneciam piscando com o objetivo de chamar a atenção dos pilotos.
O APM utilizava parâmetros da aeronave e dos motores para monitorar o arrasto aerodinâmico, a fim de alertar a tripulação sobre degradação de desempenho.
Quando o sistema fosse selecionado, a luz ficaria acesa e começaria a piscar conforme a lógica descrita no manual.
Dessa forma, mesmo com uma pack inoperante, o sistema De-Icing estaria disponível para utilização.
A Tabela 1 apresenta um resumo dos dados técnicos do catálogo de peças da aeronave.
Tal fenômeno ocorre quando alterações aerodinâmicas modificam o momento sobre a superfície de controle.
De acordo com o Programa de Manutenção, estava prevista a execução de downloads periódicos do Engine Condition And Trend Monitoring conforme previsto em manual.
`)
assert.equal(monitoringReferenceNoise.preconditions.some((item) => item.category === 'PROCEDURAL_MONITORING'), false)
for (const precondition of monitoringReferenceNoise.preconditions) {
  assert.equal(precondition.evidence.some((text) => /Tabela 1 apresenta|Tal fenômeno ocorre|estaria disponível|ficaria acesa/i.test(text)), false)
}
assert.equal(classifyCanonicalPrecondition('Pane do sistema Airframe De-Icing.'), 'EQUIPMENT')
assert.equal(classifyCanonicalPrecondition('Condições meteorológicas com formação de gelo severo.'), 'ENVIRONMENT')
assert.equal(classifyPreconditionCategory({ text: 'A unidade estava na rota até o destino próximo.', proposedCode: null }), 'ENVIRONMENTAL_CONTEXT')
assert.notEqual(classifyPreconditionCategory({ text: 'O leme permaneceu próximo ao batente à direita.', proposedCode: null }), 'ENVIRONMENTAL_CONTEXT')

// Editorial report prose is documentary, not event chronology.
const editorialTemporalNoise = run('VOEPASS-EDITORIAL-TEMPORAL-NOISE', `
A elaboração deste Relatório Final foi conduzida com base em fatores contribuintes e hipóteses levantadas.
SINOPSE O presente Relatório Final refere-se ao acidente com a aeronave.
A despeito da pane do sistema Airframe De-Icing, a aeronave foi despachada sem as restrições impostas pela MEL.
Como consequência, a aeronave entrou em stall e colidiu contra o solo.
`)
for (const pattern of [/A elaboração deste Relatório Final/i, /SINOPSE O presente Relatório Final/i]) {
  const item = editorialTemporalNoise.factualExtraction.evidence.find((candidate) => pattern.test(candidate.statement))
  assert.ok(item)
  assert.notEqual(item?.temporalRelation, 'POST_ESCAPE')
  assert.equal(editorialTemporalNoise.escapePoint.excludedPostEscapeEvidence.some((statement) => pattern.test(statement)), false)
}
