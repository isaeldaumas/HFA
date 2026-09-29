import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

const narrative = `
Relato do caso fornecido pelo piloto 1:
Eu estava dando treinamento a comando para um comandante que era do Bell 412 e estava em sua primeira missão no S-76.
A rota estava instrumento. A 5 milhas da unidade marítima, já a 500 pés, pelo radar vimos que estava IMC e, mesmo assim, a gente resolveu continuar o voo e tentar o pouso.
Eu perguntei: "Vamos tentar o pouso? Vamos tentar fazer a missão?" Ele respondeu: "Vamos".
A cerca de 3 ou 4 milhas eu já estava visual com a plataforma. O teto estava baixo, mas dava para ver.
Para não perder o visual da plataforma eu fiquei olhando para fora e deixei a pilotagem por conta dele.
Nesse momento, o piloto 2 desacoplou o automatismo da aeronave, o Diretor de Voo.
Quando percebi que ele havia desacoplado, falei: "Cuidado com a velocidade".
O piloto 2 colocou barra na barra, como faria no outro equipamento, quando o correto no S-76 seria pitch down.
Depois senti G negativo; a velocidade chegou a zero, a razão de descida passou de 1000 ft/min e o torque chegou a 100%.
O piloto 1 assumiu os comandos, reduziu o coletivo, colocou o nariz para baixo, recuperou a aeronave, reacoplou o automatismo e abandonou a missão.

Aprofundamento Progressivo:
O piloto 1 considera que uma barreira de segurança foi ultrapassada quando resolveram manter 500 pés para tentar localizar a plataforma mesmo em condições não visuais.
Segundo o entrevistado, a regra aplicável exigia 700 pés de teto e visual com a plataforma a pelo menos 5 milhas. "Nós passamos do limite de visibilidade e de teto".
Com o objetivo de cumprir a missão e pousar, eles se aproximaram a 3 milhas da plataforma em 500 pés.

Questões "E se?":
Pergunta: se a divisão de tarefas tivesse sido estabelecida mais claramente, teria evitado que os dois pilotos olhassem para fora ao mesmo tempo?
Resposta: Sim. Acredito que faltou uma comunicação maior entre nós.
`

function run(supplementalEvidence: SeraSupplementalEvidenceInput[] = []) {
  return runSeraVNextEngineV0({
    inputId: 'HUMAN-CAL-EVENT1-001', narrative, locale: 'pt-BR', sourceType: 'real_event',
    requestId: 'human-cal-event1', mode: 'CANDIDATE_ONLY', supplementalEvidence,
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
}

const output = run()
assert.equal(output.escapePoint.status, 'CANDIDATE')
assert.match(output.escapePoint.firstDepartureCandidate ?? '', /500 p[eé]s.*IMC.*continuar/i)
assert.match(output.escapePoint.criticalUnsafeActCandidate ?? '', /barra na barra|desacoplou/i)
assert.match(output.escapePoint.statement ?? '', /500 p[eé]s.*IMC.*continuar/i)
assert.doesNotMatch(output.escapePoint.statement ?? '', /barra na barra|desacoplou/i)
assert.equal(output.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(output.directActor.status, 'IDENTIFIED')
assert.match(output.directActor.actor ?? '', /tripula[cç][aã]o.*decis[aã]o conjunta/i)
assert.equal(output.axes.perception.proposedCode, 'P-A')
assert.equal(output.axes.objective.proposedCode, null)
assert.equal(output.axes.action.proposedCode, null)
assert.match(output.canonicalTraversal.paths.find((p) => p.axis === 'P')?.answers[0]?.responseText ?? '', /IMC.*500 p[eé]s/i)
assert.match(output.canonicalTraversal.paths.find((p) => p.axis === 'O')?.answers[0]?.responseText ?? '', /continuar.*tentar o pouso/i)
assert.match(output.canonicalTraversal.paths.find((p) => p.axis === 'A')?.answers[0]?.responseText ?? '', /continuando o voo.*tentando o pouso/i)
assert.deepEqual(new Set(output.evidenceSufficiency.questions.map((q) => q.id)), new Set(['CLARIFY-O-O_RULES', 'CLARIFY-A-A_IMPLEMENTED']))
assert.equal(output.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.ok(output.escapePoint.excludedPostEscapeEvidence.some((item) => /desacoplou/i.test(item)))
assert.ok(output.escapePoint.excludedPostEscapeEvidence.some((item) => /barra na barra/i.test(item)))
assert.equal(output.axes.action.supportingEvidence.some((item) => /barra na barra|desacoplou/i.test(item)), false)
assert.match(output.safeOperationModel.expectedSafeState ?? '', /crit[eé]rios meteorol[oó]gicos|refer[eê]ncias visuais/i)
assert.match(output.safeOperationModel.expectedSafeAction ?? '', /n[aã]o prosseguir|descontinuar/i)
assert.equal(output.preconditions.length, 0, 'preconditions remain gated until an active P/O/A failure code is supported')

const reanalysis = run([
  {
    evidenceId: 'SUP-O-RULES', stage: 'OBJECTIVE', linkedQuestionId: 'CLARIFY-O-O_RULES', temporalRelation: 'AT_ESCAPE',
    statement: 'A tripulação conhecia a regra aplicável de 700 pés de teto e 5 milhas de referência visual, estava ciente de que naquele momento estava abaixo desses critérios e, mesmo assim, decidiu continuar o voo e tentar o pouso.',
  },
  {
    evidenceId: 'SUP-A-IMPLEMENTED', stage: 'ACTION', linkedQuestionId: 'CLARIFY-A-A_IMPLEMENTED', temporalRelation: 'AT_ESCAPE',
    statement: 'A decisão era continuar o voo e tentar o pouso, e essa ação foi implementada como pretendida; a tripulação efetivamente prosseguiu, sem deslize ou lapso na execução dessa decisão.',
  },
])

assert.equal(reanalysis.axes.perception.proposedCode, 'P-A')
assert.equal(reanalysis.axes.objective.proposedCode, 'O-C')
assert.equal(reanalysis.axes.action.proposedCode, null)
assert.equal(reanalysis.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-O-O_RULES'), false)
assert.equal(reanalysis.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-A-A_IMPLEMENTED'), false)
assert.equal(reanalysis.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-A-A_CORRECT'), true)
assert.ok(reanalysis.preconditions.length > 0, 'O-C must activate Hendy Table 1 precondition investigation')
assert.ok(reanalysis.preconditions.every((p) => p.likelyForActiveFailureCodes.includes('O-C')))
assert.ok(reanalysis.preconditions.every((p) => p.methodologyMatch === 'HYPOTHESIS_ONLY'))
assert.ok(reanalysis.preconditions.every((p) => p.confidence === 'LOW' && p.evidence.length === 0))
assert.equal(reanalysis.preconditions.some((p) => p.methodologyMatch === 'MOST_LIKELY_AND_EVIDENCED'), false)
assert.equal(reanalysis.axes.action.supportingEvidence.some((item) => /barra na barra|desacoplou/i.test(item)), false)

console.log('PASS human calibration event 001 — first departure anchors P/O/A; later critical act remains separate')
