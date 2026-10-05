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
    actionFailureMechanism: 'MONITORING_ATTENTION_LAPSE',
    actionMechanismEvidenceQuote: 'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.',
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
    id: 'SEQ-CONFLICTING-ACTION-LABEL',
    sourceQuote: 'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.',
    sourceSentenceIndex: 0,
    roles: ['ACTION_STRATEGY'],
    concepts: ['proceduralOmission'],
    actor: 'piloto monitorando (PM)',
    temporalRelation: 'AT_ESCAPE',
    assertionStatus: 'AFFIRMED',
    occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null,
    preconditionCausalStatus: null,
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na aproximação, o PM desviou sua vigilância do mostrador que seguia legível.',
    confidence: 'HIGH',
    rationale: 'Simula uma segunda leitura semântica conflitante; o motor deve falhar fechado em vez de escolher A-B.',
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
assert.match(sequence.canonicalTraversal.paths.find((path) => path.axis === 'A')?.answers.at(-1)?.rationale ?? '', /conflicting source-anchored semantic action mechanisms|monitoring\/attention lapse/i)
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
    actionFailureMechanism: 'MONITORING_ATTENTION_LAPSE',
    actionMechanismEvidenceQuote: 'a vigilância do PM saiu do mostrador ainda legível',
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
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na preparação, a última verificação ficou sem execução.',
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
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na preparação, a última verificação ficou sem execução.',
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
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na preparação, a última verificação ficou sem execução.',
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
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na preparação, a última verificação ficou sem execução.',
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
    actionFailureMechanism: 'PROCEDURAL_OMISSION',
    actionMechanismEvidenceQuote: 'Na preparação, a última verificação ficou sem execução.',
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
    actionFailureMechanism: 'IMPLEMENTATION_MISMATCH',
    actionMechanismEvidenceQuote: 'o piloto aplicou uma seleção diferente da pretendida',
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['slipLapse', 'implementationMismatch', 'implementedAction'], actor: 'piloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null,
    displayInterpretation: 'O operador tentava aplicar a seleção pretendida.', confidence: 'HIGH', rationale: 'Primeiro marco.'
  },
  {
    id: 'ACTOR-FIRST-B', sourceQuote: 'o piloto aplicou uma seleção diferente da pretendida', sourceSentenceIndex: 0,
    actionFailureMechanism: 'IMPLEMENTATION_MISMATCH',
    actionMechanismEvidenceQuote: 'o piloto aplicou uma seleção diferente da pretendida',
    roles: ['CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'], concepts: [], actor: 'o piloto',
    temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, confidence: 'HIGH', rationale: 'Mesma identidade com artigo.'
  },
  {
    id: 'ACTOR-FALSE-O', sourceQuote: 'o piloto aplicou uma seleção diferente da pretendida', sourceSentenceIndex: 0,
    actionFailureMechanism: 'IMPLEMENTATION_MISMATCH',
    actionMechanismEvidenceQuote: 'o piloto aplicou uma seleção diferente da pretendida',
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



// An implementation failure is not itself the answer to Hendy's descriptive strategy
// question. When no independent ACTION_STRATEGY is available, keep A-B evidence but present
// the strategy gap transparently instead of echoing the failure as a strategy.
const mismatchOnlyNarrative = 'Durante o ajuste do sistema, o operador selecionou a alternativa B embora pretendesse selecionar a alternativa A.'
const mismatchOnly = run('SEMANTIC-MECHANISM-IS-NOT-STRATEGY', mismatchOnlyNarrative, [
  {
    id: 'MM-FIRST', sourceQuote: 'o operador selecionou a alternativa B embora pretendesse selecionar a alternativa A', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementationMismatch', 'implementedAction'], actor: 'operador', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'IMPLEMENTATION_MISMATCH', actionMechanismEvidenceQuote: 'o operador selecionou a alternativa B embora pretendesse selecionar a alternativa A', displayInterpretation: null, confidence: 'HIGH', rationale: 'Implementação diferente da intenção.'
  },
  {
    id: 'MM-AUDIT', sourceQuote: 'o operador selecionou a alternativa B embora pretendesse selecionar a alternativa A', sourceSentenceIndex: 0,
    roles: ['ACTION_MECHANISM'], concepts: [], actor: 'operador', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'IMPLEMENTATION_MISMATCH', actionMechanismEvidenceQuote: 'o operador selecionou a alternativa B embora pretendesse selecionar a alternativa A', displayInterpretation: null, confidence: 'HIGH', rationale: 'Auditoria independente do mecanismo.'
  },
])
assert.equal(mismatchOnly.axes.action.proposedCode, 'A-B')
const mismatchRootText = mismatchOnly.canonicalTraversal.paths.find((path) => path.axis === 'A')?.answers[0]?.responseText ?? ''
assert.match(mismatchRootText, /estrat[eé]gia n[aã]o est[aá] descrita.*implementada.*pretendida/i)
assert.doesNotMatch(mismatchRootText, /^o operador selecionou a alternativa b/i)

// A chronology label such as "late" is not, by itself, operational time pressure. The AI
// must provide the dedicated timeManagementPressure semantic signal; otherwise V2 fails
// closed and does not surface a TIME_PRESSURE precondition.
const lateOnlyNarrative = 'A tripulação recebeu uma alteração de rumo tarde na aproximação. O relato não descreve urgência, janela insuficiente ou pressão de horário. O PM deixou de acompanhar uma indicação disponível.'
const lateOnly = run('SEMANTIC-LATE-IS-NOT-TIME-PRESSURE', lateOnlyNarrative, [
  {
    id: 'LATE-FIRST', sourceQuote: 'O PM deixou de acompanhar uma indicação disponível.', sourceSentenceIndex: 2,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR'], concepts: [], actor: 'piloto monitorando (PM)', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'MONITORING_ATTENTION_LAPSE', actionMechanismEvidenceQuote: 'O PM deixou de acompanhar uma indicação disponível.', confidence: 'HIGH', rationale: 'Primeira saída.'
  },
  {
    id: 'LATE-OVERCLAIM', sourceQuote: 'A tripulação recebeu uma alteração de rumo tarde na aproximação.', sourceSentenceIndex: 0,
    roles: ['PRECONDITION'], concepts: [], actor: null, temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'TIME_PRESSURE', preconditionCausalStatus: 'PRESENT_CONTEXT', actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'MEDIUM', rationale: 'Sobreclassificação proposital sem sinal semântico de pressão temporal.'
  },
])
assert.equal(lateOnly.preconditions.some((item) => !item.basedOnCandidateCode && item.canonicalCategory === 'TIME_PRESSURE'), false)


// Communication loss is different from ambiguous content. When the source says a material
// part of the message never reached the actor and the actor treated the partial message as
// definitive, the canonical P tree may reach the communication leaf without inventing a
// different mental state.
const commLossNarrative = 'O segundo piloto recebeu apenas parte do recado porque o final ficou inaudível. Sem confirmar o trecho ausente, ele informou ao comandante que a área estava liberada como se a mensagem fosse definitiva.'
const commLoss = run('SEMANTIC-COMMUNICATION-LOSS', commLossNarrative, [
  { id: 'CL-FIRST', sourceQuote: 'Sem confirmar o trecho ausente', sourceSentenceIndex: 1, roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR'], concepts: [], actor: 'segundo piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'Sem confirmar o trecho ausente', confidence: 'HIGH', rationale: 'Primeira saída.' },
  { id: 'CL-P', sourceQuote: 'como se a mensagem fosse definitiva', sourceSentenceIndex: 1, roles: ['PERCEPTION_STATE'], concepts: ['inadequateAssessment'], actor: 'segundo piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a mensagem parcial como definitiva.', confidence: 'HIGH', rationale: 'Avaliação contemporânea.' },
  { id: 'CL-INFO', sourceQuote: 'o final ficou inaudível', sourceSentenceIndex: 0, roles: ['PRECONDITION'], concepts: ['informationUnavailable'], actor: 'segundo piloto', temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: 'PRESENT_CONTEXT', actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'HIGH', rationale: 'Conteúdo necessário não chegou.' },
])
assert.equal(commLoss.axes.perception.proposedCode, 'P-H')

// A purpose clause can occur textually after a coordinated action while still describing the
// objective contemporaneous with the first departure. Text order must not be mistaken for
// event time.
const purposeNarrative = 'O comandante encurtou a etapa de preparação e seguiu adiante para preservar a janela de horário, aumentando deliberadamente a carga simultânea de tarefas.'
const purpose = run('SEMANTIC-PURPOSE-AT-ESCAPE', purposeNarrative, [
  { id: 'PU-FIRST', sourceQuote: 'encurtou a etapa de preparação', sourceSentenceIndex: 0, roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'], concepts: [], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'encurtou a etapa de preparação', confidence: 'HIGH', rationale: 'Primeiro desvio.' },
  { id: 'PU-GOAL', sourceQuote: 'para preservar a janela de horário', sourceSentenceIndex: 0, roles: ['OBJECTIVE_INTENT'], concepts: ['efficiencyObjective', 'unmanagedRisk'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador pretendia preservar a janela de horário.', confidence: 'HIGH', rationale: 'Finalidade contemporânea à decisão.' },
])
assert.equal(purpose.axes.objective.proposedCode, 'O-D')

// A known action subtype never proves knowledge/capability. Explicit procedural knowledge
// limitation must take precedence and reach A-E before the selection branch.
const knowledgeNarrative = 'O piloto escolheu a resposta B e a executou como escolhida, mas não conhecia a ressalva do procedimento necessária para selecionar a resposta correta.'
const knowledge = run('SEMANTIC-ACTION-KNOWLEDGE-PRECEDENCE', knowledgeNarrative, [
  { id: 'AK-FIRST', sourceQuote: 'escolheu a resposta B e a executou como escolhida', sourceSentenceIndex: 0, roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction', 'selectionSubtype'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'escolheu a resposta B e a executou como escolhida', displayInterpretation: 'O operador tentava responder por meio da alternativa B.', confidence: 'HIGH', rationale: 'Seleção deliberadamente implementada.' },
  { id: 'AK-KNOW', sourceQuote: 'não conhecia a ressalva do procedimento necessária para selecionar a resposta correta', sourceSentenceIndex: 0, roles: ['PRECONDITION'], concepts: ['actionKnowledgeLimitation'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: 'TRAINING_SELECTION', preconditionCausalStatus: 'SOURCE_LINKED', preconditionCausalTargetQuote: 'escolheu a resposta B e a executou como escolhida', actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'HIGH', rationale: 'Conhecimento procedimental insuficiente.' },
])
assert.equal(knowledge.axes.action.proposedCode, 'A-E')

// Conversely, if the semantic layer reports only a selection subtype and no independent
// evidence of knowledge/capability, the deterministic engine must abstain at capability;
// it may not assume SIM merely to continue toward A-F.
const subtypeOnlyNarrative = 'O operador escolheu a opção Y e executou a opção escolhida, que se mostrou inadequada.'
const subtypeOnly = run('SEMANTIC-SUBTYPE-DOES-NOT-PROVE-CAPABILITY', subtypeOnlyNarrative, [
  { id: 'SO-FIRST', sourceQuote: 'escolheu a opção Y e executou a opção escolhida', sourceSentenceIndex: 0, roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction', 'selectionSubtype'], actor: 'operador', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'escolheu a opção Y e executou a opção escolhida', displayInterpretation: 'O operador tentava responder por meio da opção Y.', confidence: 'HIGH', rationale: 'Subtipo de seleção sem evidência de capacidade.' },
])
assert.equal(subtypeOnly.axes.action.proposedCode, null)
assert.equal(subtypeOnly.canonicalTraversal.paths.find((path) => path.axis === 'A')?.answers.some((answer) => answer.nodeId === 'A_CAPABILITY' && answer.answer === 'INSUFFICIENT_EVIDENCE'), true)

console.log('PASS semantic-method boundary — AI interprets language; deterministic engine enforces anchor, actor, evidence and causal locks')
