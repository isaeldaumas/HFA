import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { inferOccurrenceDateFromNarrative } from '../../frontend/src/lib/sera-vnext/occurrence-date'

const narrative = `5.1 - Data/hora da Ocorrência – 22/07/2025 – 07:52P.
6.8 Relato/Entrevistas com os Mecânicos envolvidos.
6.8.1 Inspeção Pré voo antes do evento – 22 de Julho de 2025.
A equipe do turno diurno era formada pelo Inspetor e por quatro mecânicos que se dividiam para atendimento às tarefas de pré-voo e entre-voos das aeronaves programadas, e declarou que na Inspeção visual nada de anormal fora detectado.
i) Os Certificados de Habilitação Técnica dos Pilotos estavam válidos.
iii) Os Treinamentos para a Qualificação no Equipamento e para o IFR estavam em dia.
6.9 Atos ou Condições Inseguras.
6.9.1 Pilotos. Não evidenciado.
6.9.2 Manutenção. Como hipótese, uma suposta falha na Inspeção do pré-voo, não sendo realizado o completo travamento dos latches.
6.9.3 Supervisão. Foi identificada supervisão inadequada no processo de manutenção.
No primeiro pouso em PPG1 o HLO alertou que havia uma carenagem aberta. O copiloto confirmou que a portinhola de inspeção do módulo hidráulico 1 estava aberta, o que motivou o corte dos motores.
O comandante subiu no helicóptero, verificou que a portinhola estava íntegra e com os fechos e dobradiças em bom estado, fechou-a e se assegurou que estava travada.
Em seguida procedeu ao reembarque dos passageiros, acionou os motores e deu prosseguimento ao voo, sem qualquer evento superveniente.`

const output = runSeraVNextEngineV0({ inputId: 'MAINT-PREFLIGHT-LATCH-001', narrative, locale: 'pt-BR', sourceType: 'real_event', requestId: 'MAINT-PREFLIGHT-LATCH-001', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true } })

assert.equal(output.escapePoint.status, 'CANDIDATE')
assert.match(output.escapePoint.statement ?? '', /inspe[cç][aã]o pr[eé]-voo.*sem detectar anormalidade/i)
assert.match(output.directActor.actor ?? '', /maintenance.*collective|manuten[cç][aã]o.*coletiv/i)
assert.doesNotMatch(output.directActor.actor ?? '', /flight crew|tripula[cç][aã]o|pilot|piloto/i)
assert.equal(output.axes.perception.proposedCode, null)
assert.equal(output.axes.objective.proposedCode, 'O-A')
assert.equal(output.axes.action.proposedCode, null)
assert.ok(output.axes.perception.alternativesConsidered.includes('P-F'))
assert.ok(output.axes.perception.alternativesConsidered.includes('P-G'))
assert.ok(output.axes.action.alternativesConsidered.includes('A-B'))
assert.ok(output.axes.action.alternativesConsidered.includes('A-C'))
assert.ok(output.axes.action.alternativesConsidered.includes('A-G'))
assert.equal(output.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')
assert.doesNotMatch(output.axes.perception.statementAtEscapePoint ?? '', /Certificados de Habilitação|Treinamentos para a Qualificação/i)
assert.doesNotMatch(output.axes.objective.statementAtEscapePoint ?? '', /O comandante subiu|fechou-a|travada/i)
assert.doesNotMatch(output.axes.action.statementAtEscapePoint ?? '', /O comandante subiu|reembarque|acionou os motores/i)
const actionPath = output.canonicalTraversal.paths.find((path) => path.axis === 'A')
assert.equal(actionPath?.answers.at(-1)?.nodeId, 'A_IMPLEMENTED')
assert.equal(actionPath?.answers.at(-1)?.answer, 'INSUFFICIENT_EVIDENCE')
assert.ok(output.preconditions.some((pc) => pc.category === 'ORGANIZATIONAL_CONTEXT' && pc.relationship === 'UNRELATED_OR_UNSUPPORTED' && pc.confidence === 'LOW'))
assert.ok(output.evidenceSufficiency.questions.some((q) => q.stage === 'PERCEPTION' && /visual|f[ií]sica|t[aá]til/i.test(q.question)))
assert.ok(output.evidenceSufficiency.questions.some((q) => q.stage === 'ACTION' && /quem executou|omiss[aã]o|segunda checagem/i.test(q.question)))
assert.equal(output.downstreamAllowed, false)
assert.equal(inferOccurrenceDateFromNarrative(narrative), '2025-07-22T12:00:00.000Z')

const clarified = runSeraVNextEngineV0({
  inputId: 'MAINT-PREFLIGHT-CLARIFIED-001', narrative: 'A portinhola foi encontrada aberta após o pouso. A tripulação realizou a recuperação.', locale: 'pt-BR', sourceType: 'real_event', requestId: 'MAINT-PREFLIGHT-CLARIFIED-001', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  supplementalEvidence: [{ evidenceId: 'SUP-ESCAPE-1', linkedQuestionId: 'CLARIFY-ESCAPE-POINT', stage: 'ESCAPE_POINT', temporalRelation: 'AT_ESCAPE', statement: 'Ponto de fuga: Quando a aeronave foi considerada apta/liberada após o pré-voo com a portinhola de inspeção do módulo hidráulico 1 sem o travamento efetivo dos latches.' }],
})
assert.equal(clarified.escapePoint.status, 'CANDIDATE')
assert.match(clarified.escapePoint.statement ?? '', /^Quando a aeronave foi considerada apta\/liberada após o pré-voo/i)
assert.notEqual(clarified.directActor.actor, 'flight crew (collective)')

const clarifiedOverridesNarrativeCandidate = runSeraVNextEngineV0({
  inputId: 'CLARIFIED-OVERRIDE-001', narrative: 'A tripulação decidiu continuar a aproximação apesar de uma condição insegura.', locale: 'pt-BR', sourceType: 'real_event', requestId: 'CLARIFIED-OVERRIDE-001', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  supplementalEvidence: [{ evidenceId: 'SUP-ESCAPE-2', linkedQuestionId: 'CLARIFY-ESCAPE-POINT', stage: 'ESCAPE_POINT', temporalRelation: 'AT_ESCAPE', statement: 'Ponto de fuga: Quando a inspeção pré-voo foi concluída e a aeronave foi liberada com o acesso sem travamento efetivo.' }],
})
assert.match(clarifiedOverridesNarrativeCandidate.escapePoint.statement ?? '', /^Quando a inspeção pré-voo foi concluída/i)

console.log('PASS maintenance preflight latch regression')
