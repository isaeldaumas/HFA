import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'

function run(id: string, narrative: string, semanticEvidence: SeraSemanticEvidenceAnnotation[]) {
  return runSeraVNextEngineV0({
    inputId: id,
    narrative,
    locale: 'pt-BR',
    sourceType: 'real_event',
    requestId: id,
    mode: 'CANDIDATE_ONLY',
    semanticEvidence,
    semanticEnrichmentMeta: {
      provider: 'frozen-semantic-probe',
      model: 'semantic-contract',
      requestedAt: 'frozen',
      acceptedAnnotations: semanticEvidence.length,
      rejectedAnnotations: 0,
      schemaVersion: 'SERA_SEMANTIC_AI_V2',
    },
    options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: true },
  })
}

// 1) Meaning, not wording, defines the occurrence sequence. These formulations deliberately
// avoid the lexical phrases introduced during the five-case calibration.
const sequenceNarrative = [
  'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.',
  'A indicação permaneceu disponível.',
  'Minutos depois, o PF confirmou no sistema uma alternativa inadequada para aquela etapa.',
].join(' ')
const sequence = run('SEMANTIC-BOUNDARY-SEQUENCE', sequenceNarrative, [
  {
    id: 'SEQ-FIRST',
    sourceQuote: 'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'],
    concepts: ['slipLapse'],
    actor: 'piloto monitorando (PM)',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Primeira transição observável seguro→inseguro.',
  },
  {
    id: 'SEQ-LATER',
    sourceQuote: 'Minutos depois, o PF confirmou no sistema uma alternativa inadequada para aquela etapa.',
    sourceSentenceIndex: 2,
    roles: ['CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'],
    concepts: ['selectionSubtype'],
    actor: 'piloto voando (PF)',
    temporalRelation: 'POST_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Ato humano posterior distinto.',
  },
])
assert.equal(sequence.escapePoint.firstDepartureCandidate, 'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.')
assert.equal(sequence.escapePoint.criticalUnsafeActCandidate, 'Minutos depois, o PF confirmou no sistema uma alternativa inadequada para aquela etapa.')
assert.equal(sequence.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')
assert.equal(sequence.directActor.actor, 'piloto monitorando (PM)')
assert.equal(sequence.escapePoint.criticalUnsafeActActor, 'piloto voando (PF)')
assert.equal(sequence.axes.action.proposedCode, null, 'a semantic slip/lapse label that merely restates a monitoring departure must not unlock A-B')
for (const axis of [sequence.axes.perception, sequence.axes.objective, sequence.axes.action]) {
  assert.equal(axis.supportingEvidence.some((text) => text.includes('PF confirmou')), false, 'later PF act must never enter first-departure P/O/A')
}

// The same contract must hold when both acts share one grammatical sentence. V2 annotations
// carry minimal verbatim spans so no handwritten temporal-connector regex is needed.
const sameSentenceNarrative = 'Na aproximação, a vigilância do PM saiu do mostrador ainda legível e, instantes depois, o PF confirmou no sistema uma alternativa inadequada.'
const sameSentence = run('SEMANTIC-SAME-SENTENCE-SPANS', sameSentenceNarrative, [
  {
    id: 'SPAN-FIRST',
    sourceQuote: 'a vigilância do PM saiu do mostrador ainda legível',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR'],
    concepts: [],
    actor: 'piloto monitorando (PM)',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Primeiro span operacional da frase.',
  },
  {
    id: 'SPAN-LATER',
    sourceQuote: 'o PF confirmou no sistema uma alternativa inadequada',
    sourceSentenceIndex: 0,
    roles: ['CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'],
    concepts: ['selectionSubtype'],
    actor: 'piloto voando (PF)',
    temporalRelation: 'POST_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Segundo span operacional da mesma frase.',
  },
])
assert.equal(sameSentence.escapePoint.firstDepartureCandidate, 'a vigilância do PM saiu do mostrador ainda legível')
assert.equal(sameSentence.escapePoint.criticalUnsafeActCandidate, 'o PF confirmou no sistema uma alternativa inadequada')
assert.equal(sameSentence.directActor.actor, 'piloto monitorando (PM)')
assert.equal(sameSentence.escapePoint.criticalUnsafeActActor, 'piloto voando (PF)')
assert.equal(sameSentence.escapePoint.anchorBasis, 'FIRST_DEPARTURE_PRIMARY')

// 2) Passive syntax does not require a handwritten phrase pattern. A high-confidence semantic
// coreference to a specific actor may resolve the actor; a generic semantic label may not.
const passiveNarrative = [
  'Na preparação, a última verificação ficou sem execução.',
  'O copiloto informou que aquela verificação estava sob sua responsabilidade e que a ausência ocorreu quando retomou a sequência.',
].join(' ')
const passiveResolved = run('SEMANTIC-PASSIVE-SPECIFIC', passiveNarrative, [
  {
    id: 'PASSIVE-SPECIFIC',
    sourceQuote: 'Na preparação, a última verificação ficou sem execução.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'],
    concepts: ['slipLapse', 'proceduralOmission'],
    actor: 'copiloto',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'O próprio relato resolve a correferência da omissão para o copiloto.',
  },
])
assert.equal(passiveResolved.directActor.status, 'IDENTIFIED')
assert.equal(passiveResolved.directActor.actor, 'copiloto')
assert.equal(passiveResolved.axes.action.proposedCode, 'A-B', 'semantic slip/lapse must drive the deterministic A-B branch without lexical omission parsing')

const passiveAmbiguous = run('SEMANTIC-PASSIVE-GENERIC', passiveNarrative, [
  {
    id: 'PASSIVE-GENERIC',
    sourceQuote: 'Na preparação, a última verificação ficou sem execução.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'],
    concepts: ['slipLapse'],
    actor: 'tripulação de voo não especificada',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Rótulo coletivo sem individualização.',
  },
])
assert.equal(passiveAmbiguous.directActor.status, 'AMBIGUOUS')
assert.equal(passiveAmbiguous.directActor.actor, null)
assert.equal(passiveAmbiguous.canonicalTraversal.paths.length, 0)

// 3) The AI owns semantic factor recognition. The deterministic engine distinguishes factual
// presence from causal linkage; category words do not need to exist in the narrative.
const contextNarrative = [
  'Na preparação, a última verificação ficou sem execução.',
  'O copiloto informou que aquela verificação estava sob sua responsabilidade.',
  'Antes da tarefa, descreveu vigília fragmentada e episódios de microsono.',
].join(' ')
const contextOnly = run('SEMANTIC-PC-CONTEXT', contextNarrative, [
  {
    id: 'PC-FIRST',
    sourceQuote: 'Na preparação, a última verificação ficou sem execução.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'],
    concepts: ['slipLapse', 'proceduralOmission'],
    actor: 'copiloto',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Falha de implementação no ponto de fuga.',
  },
  {
    id: 'PC-PRESENT',
    sourceQuote: 'Antes da tarefa, descreveu vigília fragmentada e episódios de microsono.',
    sourceSentenceIndex: 2,
    roles: ['PRECONDITION'],
    concepts: [],
    actor: 'copiloto',
    temporalRelation: 'PRE_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'PHYSIOLOGICAL',
    preconditionCausalStatus: 'PRESENT_CONTEXT',
    confidence: 'HIGH',
    rationale: 'Estado fisiológico presente; a fonte não declara nexo causal.',
  },
])
const contextPhysio = contextOnly.preconditions.find((item) => item.canonicalCategory === 'PHYSIOLOGICAL' && !item.basedOnCandidateCode)
assert.ok(contextPhysio, 'semantic PHYSIOLOGICAL factor must remain visible independent of lexical wording')
assert.equal(contextPhysio?.relationship, 'UNRELATED_OR_UNSUPPORTED')
assert.equal(contextPhysio?.methodologyMatch, 'HYPOTHESIS_ONLY')
assert.equal(contextPhysio?.evidence.some((text) => text.includes('vigília fragmentada')), true)

// Even if the semantic model overstates a contextual factor as SOURCE_LINKED, the
// deterministic V2 integrity gate must downgrade it when no target quote anchors the claim
// to the unique FIRST_DEPARTURE. This is the causal equivalent of the actor/temporal lock.
const unanchoredCausal = run('SEMANTIC-PC-UNANCHORED-CAUSAL', contextNarrative, [
  {
    id: 'PCU-FIRST', sourceQuote: 'Na preparação, a última verificação ficou sem execução.', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['proceduralOmission'], actor: 'copiloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, confidence: 'HIGH', rationale: 'Primeira saída.'
  },
  {
    id: 'PCU-OVERCLAIM', sourceQuote: 'Antes da tarefa, descreveu vigília fragmentada e episódios de microsono.', sourceSentenceIndex: 2,
    roles: ['PRECONDITION'], concepts: [], actor: 'copiloto', temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'PHYSIOLOGICAL', preconditionCausalStatus: 'SOURCE_LINKED', confidence: 'HIGH', rationale: 'Modelo superestimou o nexo sem alvo factual.'
  },
])
const unanchoredPhysio = unanchoredCausal.preconditions.find((item) => item.canonicalCategory === 'PHYSIOLOGICAL' && !item.basedOnCandidateCode)
assert.ok(unanchoredPhysio)
assert.equal(unanchoredPhysio?.relationship, 'UNRELATED_OR_UNSUPPORTED', 'SOURCE_LINKED without a verbatim first-departure target must fail closed to context')
assert.equal(unanchoredPhysio?.methodologyMatch, 'HYPOTHESIS_ONLY')

const linkedNarrative = `${contextNarrative} O copiloto declarou que esse estado reduziu seu alerta durante a retomada e contribuiu para perder a verificação.`
const sourceLinked = run('SEMANTIC-PC-LINKED', linkedNarrative, [
  {
    id: 'PCL-FIRST',
    sourceQuote: 'Na preparação, a última verificação ficou sem execução.',
    sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'],
    concepts: ['slipLapse', 'proceduralOmission'],
    actor: 'copiloto',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    confidence: 'HIGH',
    rationale: 'Falha de implementação no ponto de fuga.',
  },
  {
    id: 'PCL-PRESENT',
    sourceQuote: 'Antes da tarefa, descreveu vigília fragmentada e episódios de microsono.',
    sourceSentenceIndex: 2,
    roles: ['PRECONDITION'],
    concepts: [],
    actor: 'copiloto',
    temporalRelation: 'PRE_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'PHYSIOLOGICAL',
    preconditionCausalStatus: 'PRESENT_CONTEXT',
    confidence: 'HIGH',
    rationale: 'Fator factual presente.',
  },
  {
    id: 'PCL-LINK',
    sourceQuote: 'O copiloto declarou que esse estado reduziu seu alerta durante a retomada e contribuiu para perder a verificação.',
    sourceSentenceIndex: 3,
    roles: ['PRECONDITION'],
    concepts: [],
    actor: 'copiloto',
    temporalRelation: 'PRE_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'PHYSIOLOGICAL',
    preconditionCausalStatus: 'SOURCE_LINKED',
    preconditionCausalTargetQuote: 'Na preparação, a última verificação ficou sem execução.',
    confidence: 'HIGH',
    rationale: 'A própria fonte declara contribuição e ancora o alvo na primeira saída.',
  },
])
const linkedPhysio = sourceLinked.preconditions.find((item) => item.canonicalCategory === 'PHYSIOLOGICAL' && !item.basedOnCandidateCode)
assert.ok(linkedPhysio)
assert.notEqual(linkedPhysio?.relationship, 'UNRELATED_OR_UNSUPPORTED', 'SOURCE_LINKED may open causal-precondition handling, still subject to human review')
assert.equal(linkedPhysio?.methodologyMatch, 'EVIDENCED_OUTSIDE_MOST_LIKELY_SET')


// 4) Surface-form variation in one semantic actor does not create false ambiguity, and
// duplicate later FIRST_DEPARTURE labels cannot create a second SERA anchor.
const actorSurfaceNarrative = 'Na descida, o piloto aplicou uma seleção diferente da pretendida. Mais tarde, um item da checklist ficou sem execução.'
const actorSurface = run('SEMANTIC-ACTOR-SURFACE-AND-UNIQUE-FIRST', actorSurfaceNarrative, [
  {
    id: 'ACTOR-FIRST-A', sourceQuote: 'o piloto aplicou uma seleção diferente da pretendida', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['slipLapse', 'implementationMismatch', 'implementedAction'], actor: 'piloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null,
    displayInterpretation: 'O operador tentava aplicar a seleção pretendida.', confidence: 'HIGH', rationale: 'Primeiro marco.'
  },
  {
    id: 'ACTOR-FIRST-B', sourceQuote: 'o piloto aplicou uma seleção diferente da pretendida', sourceSentenceIndex: 0,
    roles: ['CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'], concepts: [], actor: 'o piloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, confidence: 'HIGH', rationale: 'Mesma identidade com artigo.'
  },
  {
    id: 'ACTOR-FALSE-O', sourceQuote: 'o piloto aplicou uma seleção diferente da pretendida', sourceSentenceIndex: 0,
    roles: ['OBJECTIVE_INTENT'], concepts: [], actor: 'piloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null,
    displayInterpretation: 'O operador pretendia aplicar uma seleção diferente.', confidence: 'HIGH', rationale: 'Overclassification probe: intended implementation is not an operational objective.'
  },
  {
    id: 'ACTOR-LATER', sourceQuote: 'um item da checklist ficou sem execução', sourceSentenceIndex: 1,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT'], concepts: ['slipLapse', 'proceduralOmission'], actor: null,
    temporalRelation: 'POST_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, confidence: 'HIGH', rationale: 'Modelo marcou FIRST_DEPARTURE em excesso; o motor deve manter singleton.'
  },
])
assert.equal(actorSurface.escapePoint.firstDepartureCandidate, 'o piloto aplicou uma seleção diferente da pretendida')
assert.equal(actorSurface.escapePoint.criticalUnsafeActCandidate, 'um item da checklist ficou sem execução')
assert.equal(actorSurface.directActor.status, 'IDENTIFIED')
assert.match(actorSurface.directActor.actor ?? '', /piloto/i)
assert.equal(actorSurface.axes.action.proposedCode, 'A-B')
assert.equal(actorSurface.axes.objective.proposedCode, null)
assert.equal(actorSurface.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]?.answer, 'INSUFFICIENT_EVIDENCE', 'intended control/action implementation must not be promoted to an operational objective even if the semantic model overlabels it')
assert.equal(actorSurface.canonicalTraversal.paths.find((path) => path.axis === 'A')?.answers[0]?.responseText, 'O operador tentava aplicar a seleção pretendida.', 'display interpretation may improve grammar but must remain presentation-only')

console.log('PASS semantic-method boundary — AI interprets language; deterministic engine enforces anchor, actor, evidence and causal locks')
