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
assert.notEqual(output.escapePoint.firstDepartureCandidate, output.escapePoint.criticalUnsafeActCandidate)
assert.match(output.escapePoint.statement ?? '', /500 p[eé]s.*IMC.*continuar/i)
assert.doesNotMatch(output.escapePoint.statement ?? '', /barra na barra|desacoplou/i)
assert.equal(output.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(output.escapePoint.poaAnchorBasis, 'CRITICAL_UNSAFE_ACT')
assert.equal(output.escapePoint.poaAnchorCandidate, output.escapePoint.criticalUnsafeActCandidate)
assert.equal(output.directActor.status, 'IDENTIFIED')
assert.match(output.directActor.actor ?? '', /piloto 2|outro piloto|comandante em treinamento/i)
assert.equal(output.evidenceSufficiency.questions.some((q) => ['ESCAPE_POINT', 'DIRECT_ACTOR'].includes(q.stage)), false)
assert.match(output.axes.action.statementAtEscapePoint ?? '', /barra na barra|desacoplou/i)
assert.equal(output.axes.action.supportingEvidence.some((item) => /barra na barra|desacoplou/i.test(item)), true)
assert.equal(output.preconditions.length, 0, 'preconditions remain gated until an active P/O/A failure code is supported')
assert.match(output.safeOperationModel.expectedSafeState ?? '', /crit[eé]rios meteorol[oó]gicos|refer[eê]ncias visuais/i)
assert.match(output.safeOperationModel.expectedSafeAction ?? '', /n[aã]o prosseguir|descontinuar/i)

console.log('PASS human calibration event 001 — first departure delimits trajectory; critical act anchors actor and P/O/A')
