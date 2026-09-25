import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const narrative = `
5.5 Relatos/Registros
A rota prevista era BASE / UNIT-B / BASE. O copiloto estava como PF e o comandante como PM. A informação do destino estava corretamente programada no GPS. O PF identificou UNIT-A como o destino previsto e iniciou o planejamento da aproximação para UNIT-A.
5.6 Análise do Evento
10. Falta de Familiaridade com a área – Não interferiu
A proximidade entre as unidades contribuiu para o erro de identificação.
Alta Carga de Trabalho – Não interferiu.
Problemas no GPS – Não interferiu.
Os treinamentos estavam em dia e as habilitações estavam válidas.
7 Recomendações
Recomenda-se reforçar treinamento de familiaridade.
`
const out = runSeraVNextEngineV0({
  inputId: 'NEG-POLARITY-001', narrative, locale: 'pt-BR', sourceType: 'real_event',
  requestId: 'NEG-POLARITY-001', mode: 'CANDIDATE_ONLY',
  options: { includeDebugTrace: true, requireHumanReview: true, allowLlm: false },
})

assert.notEqual(out.axes.perception.proposedCode, 'P-C')
assert.equal(out.preconditions.some((item) => item.category === 'KNOWLEDGE_TRAINING'), false)
const proximity = out.factualExtraction.evidence.find((item) => /proximidade entre as unidades contribuiu/i.test(item.statement))
assert.ok(proximity)
assert.equal(proximity?.assertionStatus, 'AFFIRMED')
assert.doesNotMatch(proximity?.statement ?? '', /falta de familiaridade/i)
const rejected = out.factualExtraction.evidence.filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
assert.ok(rejected.some((item) => /familiaridade/i.test(item.statement)))
assert.ok(rejected.every((item) => item.prohibitedFor.includes('PERCEPTION')))
assert.ok(rejected.every((item) => item.prohibitedFor.includes('PRECONDITION')))
const recommendationEvidence = out.factualExtraction.evidence.filter((item) => item.sourceSection === 'RECOMMENDATION')
assert.ok(recommendationEvidence.every((item) => item.prohibitedFor.includes('PERCEPTION')))
assert.ok(recommendationEvidence.every((item) => item.prohibitedFor.includes('PRECONDITION')))
console.log('REPORT_NEGATION_POLARITY_OK')
