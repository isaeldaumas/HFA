import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'

function annotation(id: string, quote: string, roles: SeraSemanticEvidenceAnnotation['roles'], concepts: SeraSemanticEvidenceAnnotation['concepts'], actor: string | null, index: number, time: SeraSemanticEvidenceAnnotation['temporalRelation'] = 'AT_ESCAPE'): SeraSemanticEvidenceAnnotation {
  return {
    id, sourceQuote: quote, sourceSentenceIndex: index, roles, concepts, actor,
    temporalRelation: time, assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null,
    actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null,
    displayInterpretation: roles.includes('PERCEPTION_STATE') ? 'O operador percebia incorretamente a altura da aeronave em relação à instalação.' : null,
    confidence: 'HIGH', rationale: 'Evidência CAL-20A fiel à interpretação semântica registrada em produção.',
  }
}

const narrative = 'Durante uma aproximação noturna, sem horizonte natural, o piloto foi induzido por uma referência visual enganosa e julgou incorretamente a altura da aeronave em relação à instalação. Os instrumentos estavam disponíveis. O desvio de trajetória foi corrigido antes do pouso.'
const perception = annotation('C20A-P', 'julgou incorretamente a altura da aeronave em relação à instalação', ['PERCEPTION_STATE'], [], 'piloto', 0)
const ambiguous = annotation('C20A-AMBIGUOUS', 'foi induzido por uma referência visual enganosa', ['CONTEXT'], ['informationAmbiguous'], 'piloto', 0)
const firstDeparture = annotation('C20A-FIRST', 'julgou incorretamente a altura da aeronave em relação à instalação', ['FIRST_DEPARTURE','DIRECT_ACTOR'], [], 'piloto', 0)
const later = annotation('C20A-LATER', 'desvio de trajetória', ['CRITICAL_UNSAFE_ACT'], [], null, 2, 'POST_ESCAPE')
const run = (narr: string, evidence: SeraSemanticEvidenceAnnotation[]) => runSeraVNextEngineV0({
  inputId: 'CAL20A-REAL-PRODUCTION-SHAPE', narrative: narr, sourceType: 'real_event', locale: 'pt-BR', requestId: 'cal20a', mode: 'CANDIDATE_ONLY',
  semanticEvidence: evidence, semanticEnrichmentMeta: {provider:'frozen-calibration-semantics',model:'semantic-contract-v2',requestedAt:'frozen',acceptedAnnotations:evidence.length,rejectedAnnotations:0,schemaVersion:'SERA_SEMANTIC_AI_V2'},
  options: {allowLlm:true, requireHumanReview:true, includeDebugTrace:true},
})

const actual = run(narrative, [firstDeparture, later, perception, ambiguous])
assert.equal(actual.directActor.actor, 'piloto')
assert.equal(actual.axes.perception.proposedCode, 'P-F', 'explicit wrong altitude judgement and misleading visual cue should satisfy canonical P-F')
assert.equal(actual.axes.perception.canonicalPath.includes('P_ASSESSMENT'), true)
assert.equal(actual.axes.objective.proposedCode, null)
assert.equal(actual.axes.action.proposedCode, null)
assert.equal(actual.selectedCode, null)
assert.equal(actual.readyPromotion, false)
assert.equal(actual.finalConclusion, null)

// A visual cue alone without an actor's explicit mistaken perception is not a P-F verdict.
const ambiguousAlone = run('Durante a aproximação havia uma referência visual enganosa. O piloto continuou a manobra.', [
  annotation('C20A-NEG-FIRST', 'continuou a manobra', ['FIRST_DEPARTURE','DIRECT_ACTOR'], [], 'piloto', 1),
  annotation('C20A-NEG-CUE', 'referência visual enganosa', ['CONTEXT'], ['informationAmbiguous'], 'piloto', 0, 'PRE_ESCAPE'),
])
assert.equal(ambiguousAlone.axes.perception.proposedCode, null)

// Perception state alone is insufficient without evidence it was inaccurate.
const normal = run('O piloto julgou a altura da aeronave em relação à instalação. Os instrumentos estavam disponíveis.', [
  annotation('C20A-NEU-FIRST', 'julgou a altura da aeronave em relação à instalação', ['FIRST_DEPARTURE','DIRECT_ACTOR'], [], 'piloto', 0),
  annotation('C20A-NEU-P', 'julgou a altura da aeronave em relação à instalação', ['PERCEPTION_STATE'], [], 'piloto', 0),
  annotation('C20A-NEU-CUE', 'Os instrumentos estavam disponíveis.', ['CONTEXT'], ['informationAvailableCorrect'], 'piloto', 1),
])
assert.equal(normal.axes.perception.proposedCode, null)

// Do not transfer another crewmember's inaccurate perception to the anchored pilot.
const otherActor = run(narrative, [firstDeparture, later, annotation('C20A-OTHER-P', 'julgou incorretamente a altura da aeronave em relação à instalação', ['PERCEPTION_STATE'], [], 'copiloto', 0), ambiguous])
assert.equal(otherActor.axes.perception.proposedCode, null)

console.log('CAL20A_VISUAL_PERCEPTION_PASS', {P:actual.axes.perception.proposedCode,O:actual.axes.objective.proposedCode,A:actual.axes.action.proposedCode})
