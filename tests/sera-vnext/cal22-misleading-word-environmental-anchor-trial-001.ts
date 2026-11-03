import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { buildBlockingDiagnostic, buildExecutiveSummary } from '../../frontend/src/lib/sera-vnext/presentation'
import type { SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'

const narrative = 'Na discussão inicial do evento, um dos participantes usou a palavra “complacência” para descrever informalmente o que aconteceu. Entretanto, os registros mostram que a tripulação estava monitorando os instrumentos e realizou as verificações previstas. O desvio ocorreu em uma aproximação noturna sobre o mar quando as referências luminosas da instalação criaram uma impressão visual convincente, porém incorreta, da posição da aeronave. Assim que a tripulação comparou a impressão visual com a informação instrumental, reconheceu a discrepância e corrigiu a trajetória. Não há evidência de que um parâmetro disponível tenha sido deliberadamente deixado sem monitoramento.'

function annotation(id: string, quote: string, roles: SeraSemanticEvidenceAnnotation['roles'], concepts: SeraSemanticEvidenceAnnotation['concepts'], actor: string | null, index: number, time: SeraSemanticEvidenceAnnotation['temporalRelation'] = 'AT_ESCAPE'): SeraSemanticEvidenceAnnotation {
  return { id, sourceQuote: quote, sourceSentenceIndex: index, roles, concepts, actor,
    temporalRelation: time, assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN',
    actionMechanismEvidenceQuote: null,
    displayInterpretation: roles.includes('PERCEPTION_STATE') ? 'O operador percebia incorretamente a posição da aeronave.' : null,
    confidence: 'HIGH', rationale: 'Anotação semântica congelada da execução CAL-22 em produção.',
  }
}

function run(inputNarrative: string, evidence: SeraSemanticEvidenceAnnotation[]) {
  return runSeraVNextEngineV0({
    inputId: 'CAL22-REAL-PRODUCTION-SHAPE', narrative: inputNarrative, sourceType: 'real_event', locale: 'pt-BR',
    requestId: 'cal22-regression', mode: 'CANDIDATE_ONLY', semanticEvidence: evidence,
    semanticEnrichmentMeta: { provider:'frozen-calibration-semantics', model:'semantic-contract-v2', requestedAt:'frozen',
      acceptedAnnotations:evidence.length, rejectedAnnotations:0, schemaVersion:'SERA_SEMANTIC_AI_V2', humanEscapeDisposition:'HUMAN_DEPARTURE' },
    options: { allowLlm:true, requireHumanReview:true, includeDebugTrace:true },
  })
}
const illusion = annotation('C22-MISLABELLED-FIRST', 'criaram uma impressão visual convincente, porém incorreta, da posição da aeronave', ['PERCEPTION_STATE','FIRST_DEPARTURE'], ['inadequateAssessment','informationAmbiguous'], null, 2)
const downstream = annotation('C22-DOWNSTREAM', 'O desvio ocorreu', ['CRITICAL_UNSAFE_ACT'], [], null, 2)
const correctMonitoring = annotation('C22-BARRIER', 'Entretanto, os registros mostram que a tripulação estava monitorando os instrumentos e realizou as verificações previstas.', ['BARRIER'], [], 'tripulação', 1)
const recovery = annotation('C22-RECOVERY', 'Assim que a tripulação comparou a impressão visual com a informação instrumental, reconheceu a discrepância e corrigiu a trajetória.', ['BARRIER'], [], 'tripulação', 3, 'POST_ESCAPE')
const environment = annotation('C22-CUE', 'as referências luminosas da instalação criaram uma impressão visual convincente, porém incorreta', ['PRECONDITION'], [], null, 2)
const informalLabel = annotation('C22-LABEL', 'Na discussão inicial do evento, um dos participantes usou a palavra “complacência” para descrever informalmente o que aconteceu.', ['CONTEXT'], [], null, 0, 'UNKNOWN')
const noDeliberateOmission = annotation('C22-NEGATION', 'Não há evidência de que um parâmetro disponível tenha sido deliberadamente deixado sem monitoramento.', ['BARRIER'], [], null, 4, 'UNKNOWN')
const actual = run(narrative, [informalLabel, correctMonitoring, illusion, downstream, recovery, environment, noDeliberateOmission])
assert.equal(actual.escapePoint.status, 'INSUFFICIENT_EVIDENCE', 'Environmental illusion creation cannot become human escape point')
assert.equal(actual.escapePoint.firstDepartureCandidate, null)
assert.equal(actual.escapePoint.poaAnchorCandidate, null)
assert.equal(actual.escapePoint.humanFactorGate.status, 'BLOCKED')
assert.equal(actual.directActor.actor, null)
assert.equal(actual.directActor.status, 'AMBIGUOUS')
assert.equal(actual.axes.perception.proposedCode, null)
assert.equal(actual.axes.objective.proposedCode, null)
assert.equal(actual.axes.action.proposedCode, null)
assert.equal(actual.selectedCode, null)
assert.equal(actual.readyPromotion, false)
assert.equal(actual.finalConclusion, null)
const diagnostic = buildBlockingDiagnostic({narrative,output:actual,pt:true})
assert.equal(diagnostic?.kind, 'ENVIRONMENTAL_CUE_WITHOUT_HUMAN_ANCHOR')
assert.equal(diagnostic?.evidenceHeading, 'Condição visual documentada')
assert.ok(diagnostic?.evidence.some((item) => item.includes('referências luminosas')))
assert.match(diagnostic?.reason ?? '', /condi[cç][aã]o externa/i)
assert.doesNotMatch(diagnostic?.evidence.join(' ') ?? '', /Independent semantic|Hendy gate|human safe/i)
const summary = buildExecutiveSummary({title:'CAL-22',output:actual,pt:true})
assert.match(summary,/primeira saída não estabelecida/i)
assert.doesNotMatch(summary,/flight crew|Hendy gate|semantic human-factor gate/i)

// Control: a human operator explicitly judging the same misleading cue incorrectly
// is a human landmark. Do not block valid misleading-visual perception cases.
const humanNarrative = 'Durante a aproximação o piloto julgou incorretamente a altura da aeronave em relação à instalação. As referências visuais eram enganosas.'
const humanDeparture = annotation('C22-HUMAN-FIRST', 'o piloto julgou incorretamente a altura da aeronave em relação à instalação', ['FIRST_DEPARTURE','DIRECT_ACTOR','PERCEPTION_STATE'], ['inadequateAssessment'], 'piloto', 0)
const legitimate = run(humanNarrative,[humanDeparture])
assert.notEqual(legitimate.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(legitimate.directActor.actor, 'piloto')

// The report executive summary must localize group labels, even for old reports.
const localized = buildExecutiveSummary({title:'CAL-22-histórico', output:{
  ...legitimate,
  escapePoint:{...legitimate.escapePoint, firstDepartureActor: 'flight crew (collective)'},
  directActor:{...legitimate.directActor,actor:'flight crew (collective)'},
},pt:true})
assert.doesNotMatch(localized,/flight crew \(collective\)/i)
assert.match(localized,/tripulação de voo \(coletivo\)/)
console.log('CAL22_MISLEADING_WORD_PASS: environmental cue blocked, no invented PF/PM, no complacency inference, summary localized')
