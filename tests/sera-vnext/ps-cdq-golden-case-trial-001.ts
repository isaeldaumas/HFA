import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const filler = Array.from({ length: 24 }, (_, i) =>
  `Registro administrativo ${i + 1}: item documental sem conteúdo causal.`
).join('\n')

const narrative = `
RELATÓRIO DE INVESTIGAÇÃO DE OCORRÊNCIA
1.0 Sumário Executivo
Documento interno de investigação.
2.0 Objetivo da Investigação
O objetivo é prevenir recorrências.
3.0 Classificação do Evento
Incidente operacional.
${filler}

5.5 Relatos/Registros
5.5.1 Tripulação
A rota prevista para o primeiro pouso era PCP2, seguida de PCP1.
O comandante estava na função de PM e o copiloto na função PF.
Após autorização para proa direta de PCP2, a PCP1 estava na rota e deveria ser sobrevoada até o destino próximo.
Porém, numa visão de túnel a tripulação identificou a PCP1 como o primeiro pouso devido ser a unidade que estava em sua rota.
Na aproximação final, a tripulação visualizou a unidade, mas a autorização prévia de pouso era somente para PCP2.
Às 13:34 a aeronave realizou o pouso em PCP-1 erroneamente confundindo a unidade PCP-1 com PCP-2.
Após concluir o pouso, a tripulação foi informada do erro.

Entrevista com o Comandante
As coordenadas foram inseridas normalmente no GPS.
Os checklists foram lidos.
O briefing foi realizado.
Por um descuido, devido à visão de túnel, associou PCP2 à unidade em que a aeronave estava conduzindo o pouso.
A tripulação ficou muito focada na intensidade e direção do vento, o que poderia ter ocasionado distração.

Entrevista com o Copiloto
O copiloto confirmou que estava na posição PF.
Confirmou o ajuste do GPS na saída.
Confirmou o briefing e a leitura dos checklists.

6.0 Conclusão
6.1 Informações Factuais
Os certificados e habilitações estavam válidos.
Os treinamentos de qualificação e IFR estavam em dia.
A aeronave estava tecnicamente normal.

6.2 Fatores Contribuintes
Condições meteorológicas — Não interferiu.
Erro na inclusão das coordenadas — Não interferiu.
Problemas no GPS — Não interferiu.
Semelhança entre unidades — Não interferiu.
Proximidade entre unidades — Contribuiu.
Alta carga de trabalho — Não interferiu.
Falta de Familiaridade com a área — Não interferiu.

6.3 Recomendações de Segurança Operacional
Recomenda-se reforçar o treinamento de WDL.
`

const output = runSeraVNextEngineV0({
  inputId: 'PS-CDQ-GOLDEN-001',
  narrative,
  locale: 'pt-BR',
  sourceType: 'real_event',
  requestId: 'ps-cdq-golden-test',
  mode: 'CANDIDATE_ONLY',
  options: {
    allowLlm: false,
    requireHumanReview: true,
    includeDebugTrace: true,
  },
})

assert.equal(output.escapePoint.status, 'CANDIDATE')
assert.match(output.escapePoint.statement ?? '', /PCP1/i)
assert.doesNotMatch(output.escapePoint.statement ?? '', /pousou|concluiu o pouso/i)
assert.equal(output.directActor.actor, 'copiloto (PF)')

assert.equal(output.axes.perception.proposedCode, 'P-G')
assert.equal(output.axes.objective.proposedCode, 'O-A')
assert.equal(output.axes.action.proposedCode, 'A-A')

const pPath = output.canonicalTraversal.paths.find((p) => p.axis === 'P')
const oPath = output.canonicalTraversal.paths.find((p) => p.axis === 'O')
const aPath = output.canonicalTraversal.paths.find((p) => p.axis === 'A')
assert.deepEqual(pPath?.nodeIds, [
  'P_ROOT',
  'P_ASSESSMENT',
  'P_CAPABILITY',
  'P_TIME_PRESSURE',
  'P_INFORMATION_AMBIGUOUS',
  'P_INFORMATION_AVAILABLE',
])
assert.equal(pPath?.answers.find((a) => a.nodeId === 'P_TIME_PRESSURE')?.answer, 'NÃO')
assert.equal(pPath?.answers.find((a) => a.nodeId === 'P_INFORMATION_AVAILABLE')?.terminalCode, 'P-G')
assert.equal(oPath?.candidateCode, 'O-A')
assert.equal(aPath?.candidateCode, 'A-A')

assert.equal(output.preconditions.some((p) => p.category === 'KNOWLEDGE_TRAINING'), false)
assert.equal(output.preconditions.some((p) => p.category === 'ATTENTION_WORKLOAD_CONTEXT'), true)
assert.equal(output.preconditions.some((p) => p.category === 'ENVIRONMENTAL_CONTEXT'), true)

const rejectedFamiliarity = output.factualExtraction.evidence.find((e) =>
  /falta de familiaridade/i.test(e.statement)
)
assert.ok(rejectedFamiliarity)
assert.equal(rejectedFamiliarity?.assertionStatus, 'REJECTED_AS_FACTOR')
assert.equal(rejectedFamiliarity?.prohibitedFor.includes('PRECONDITION'), true)

const currentTraining = output.factualExtraction.evidence.find((e) =>
  /treinamentos de qualificação/i.test(e.statement)
)
assert.ok(currentTraining)
assert.equal(currentTraining?.supports.includes('PRECONDITION'), false)

const postLanding = output.factualExtraction.evidence.find((e) =>
  /após concluir o pouso/i.test(e.statement)
)
assert.ok(postLanding)
assert.equal(postLanding?.temporalRelation, 'POST_ESCAPE')
assert.equal(output.axes.perception.supportingEvidence.includes(postLanding?.statement ?? ''), false)
assert.equal(output.axes.objective.supportingEvidence.includes(postLanding?.statement ?? ''), false)
assert.equal(output.axes.action.supportingEvidence.includes(postLanding?.statement ?? ''), false)

const wrongLandingOutcome = output.factualExtraction.evidence.find((e) =>
  /realizou o pouso em PCP-1 erroneamente/i.test(e.statement)
)
assert.ok(wrongLandingOutcome)
assert.equal(wrongLandingOutcome?.temporalRelation, 'POST_ESCAPE')
assert.equal(output.axes.action.supportingEvidence.includes(wrongLandingOutcome?.statement ?? ''), false)

for (const [name, violated] of Object.entries(output.guardrails)) {
  assert.equal(violated, false, `guardrail ${name} should remain clean`)
}

console.log('PASS ps-cdq golden case')
