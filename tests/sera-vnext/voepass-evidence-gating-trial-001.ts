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
