import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

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
assert.notEqual(fullContextEpisode.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.match(fullContextEpisode.escapePoint.statement ?? '', /despachada|MEL|procedimentos previstos|checklist|Airframe De-Icing/i)
assert.equal(fullContextEpisode.escapePoint.humanFactorGate?.status, 'PASSED')
assert.equal(fullContextEpisode.escapePoint.humanFactorGate?.anchorType, 'UNSAFE_ACT')
assert.ok(fullContextEpisode.escapePoint.supportingEvidence.some((text) => /Airframe De-Icing|SEV ICE|meteorológ|procedimentos previstos/i.test(text)))
assert.ok(fullContextEpisode.escapePoint.counterEvidence.some((text) => /Multiple human-factor unsafe-act\/condition candidates/i.test(text)))
assert.equal(fullContextEpisode.directActor.status, 'AMBIGUOUS')
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
