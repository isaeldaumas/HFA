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
assert.equal(output.axes.objective.proposedCode, null)
const objectivePath = output.canonicalTraversal.paths.find((path) => path.axis === 'O')
assert.deepEqual(objectivePath?.nodeIds, ['O_ROOT'])
assert.equal(objectivePath?.answers[0]?.answer, 'INSUFFICIENT_EVIDENCE')
assert.match(objectivePath?.answers[0]?.responseText ?? '', /n[aã]o [eé] poss[ií]vel determinar.*objetivo/i)
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
assert.ok(output.evidenceSufficiency.questions.some((q) => q.stage === 'PERCEPTION' && /acreditava|condi[cç][aã]o de fechamento|travamento/i.test(q.question)))
assert.ok(output.evidenceSufficiency.questions.some((q) => q.stage === 'ACTION' && /quem executou|omiss[aã]o|segunda checagem/i.test(q.question)))
assert.equal(output.downstreamAllowed, false)
assert.equal(inferOccurrenceDateFromNarrative(narrative), '2025-07-22T12:00:00.000Z')

// Regression: short factual answers entered in the product clarification form must
// be consumed as answers to the exact canonical descriptive roots that requested
// them. The investigator should not be sent back to the same P_ROOT/O_ROOT form
// merely because the response does not repeat engine keywords such as "objective".
const clarifiedRoots = runSeraVNextEngineV0({
  inputId: 'MAINT-PREFLIGHT-ROOT-CLARIFICATIONS-001',
  narrative,
  locale: 'pt-BR',
  sourceType: 'real_event',
  requestId: 'MAINT-PREFLIGHT-ROOT-CLARIFICATIONS-001',
  mode: 'CANDIDATE_ONLY',
  options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  supplementalEvidence: [
    { evidenceId: 'SUP-P-ROOT', linkedQuestionId: 'CLARIFY-P-P_ROOT', stage: 'PERCEPTION', temporalRelation: 'AT_ESCAPE', statement: 'Sim. A confirmacao foi apenas visual' },
    { evidenceId: 'SUP-O-ROOT', linkedQuestionId: 'CLARIFY-O-O_ROOT', stage: 'OBJECTIVE', temporalRelation: 'AT_ESCAPE', statement: 'Liberar a aeronave pela manutenção' },
  ],
})
const clarifiedPPath = clarifiedRoots.canonicalTraversal.paths.find((path) => path.axis === 'P')
const clarifiedOPath = clarifiedRoots.canonicalTraversal.paths.find((path) => path.axis === 'O')
assert.equal(clarifiedPPath?.answers[0]?.nodeId, 'P_ROOT')
assert.equal(clarifiedPPath?.answers[0]?.answer, 'START')
assert.equal(clarifiedPPath?.answers[0]?.responseText, 'Sim. A confirmacao foi apenas visual')
assert.equal(clarifiedOPath?.answers[0]?.nodeId, 'O_ROOT')
assert.equal(clarifiedOPath?.answers[0]?.answer, 'START')
assert.equal(clarifiedOPath?.answers[0]?.responseText, 'Liberar a aeronave pela manutenção')
assert.ok(!clarifiedRoots.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-P-P_ROOT'))
assert.ok(!clarifiedRoots.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-O-O_ROOT'))
const clarifiedPerceptionFollowUp = clarifiedRoots.evidenceSufficiency.questions.find((q) => q.id === 'CLARIFY-P-P_ASSESSMENT')
assert.ok(clarifiedPerceptionFollowUp)
assert.match(clarifiedPerceptionFollowUp!.question, /Voc[eê] j[aá] informou|condi[cç][aã]o real/i)
assert.ok(clarifiedRoots.evidenceSufficiency.questions.some((q) => q.id === 'CLARIFY-A-A_IMPLEMENTED'))
const objectiveClarificationEvidence = clarifiedRoots.factualExtraction.evidence.find((item) => item.evidenceId === 'SUP-O-ROOT')
assert.ok(objectiveClarificationEvidence?.supports.includes('OBJECTIVE'))
assert.equal(clarifiedRoots.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')

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
