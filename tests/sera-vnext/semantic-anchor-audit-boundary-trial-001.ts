import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyAuditedFirstDeparture, applyPreconditionSemanticAuditRejections, hasAtomicSemanticSourceQuote, mergeFocusedPoaSemanticEvidence } from '../../frontend/src/lib/sera-vnext/ai/semantic-enrichment'
import { enforceSemanticEvidenceIntegrity } from '../../frontend/src/lib/sera-vnext/evidence/semantic-integrity'
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
      provider: 'frozen-semantic-audit',
      model: 'semantic-contract-v2',
      requestedAt: 'frozen',
      acceptedAnnotations: semanticEvidence.length,
      rejectedAnnotations: 0,
      schemaVersion: 'SERA_SEMANTIC_AI_V2',
    },
    options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: false },
  })
}

// The semantic audit, not textual order, is authoritative for FIRST_DEPARTURE. A contextual
// condition may precede the human departure in the narrative, but cannot remain the P/O/A anchor.
const contextNarrative = 'Uma restrição externa tornou a sequência inviável sem compressão. Mais tarde, a tripulação omitiu uma verificação prevista e interrompeu a operação para corrigi-la.'
const contextPrimary: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'CTX-WRONG-FIRST', sourceQuote: 'Uma restrição externa tornou a sequência inviável sem compressão.', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'CONTEXT'], concepts: ['timeManagementPressure'], actor: 'tripulação de voo (coletivo)', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'HIGH', rationale: 'Leitura primária excessiva.'
  },
  {
    id: 'CTX-LATER', sourceQuote: 'a tripulação omitiu uma verificação prevista', sourceSentenceIndex: 1,
    roles: ['CRITICAL_UNSAFE_ACT'], concepts: ['proceduralOmission'], actor: null, temporalRelation: 'POST_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'PROCEDURAL_OMISSION', actionMechanismEvidenceQuote: 'a tripulação omitiu uma verificação prevista', confidence: 'HIGH', rationale: 'Omissão operacional.'
  },
]
const contextAudit: SeraSemanticEvidenceAnnotation = {
  id: 'CTX-AUDIT', sourceQuote: 'a tripulação omitiu uma verificação prevista', sourceSentenceIndex: 1,
  roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT'], concepts: ['proceduralOmission'], actor: null, temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'PROCEDURAL_OMISSION', actionMechanismEvidenceQuote: 'a tripulação omitiu uma verificação prevista', confidence: 'HIGH', rationale: 'Primeira saída humana observável.'
}
const contextAudited = applyAuditedFirstDeparture(contextPrimary, contextAudit)
assert.equal(contextAudited.filter((item) => item.roles.includes('FIRST_DEPARTURE')).length, 1)
assert.equal(contextAudited.find((item) => item.roles.includes('FIRST_DEPARTURE'))?.sourceQuote, 'a tripulação omitiu uma verificação prevista')
const contextOutput = run('SEMANTIC-AUDIT-CONTEXT-NOT-ANCHOR', contextNarrative, contextAudited)
assert.equal(contextOutput.escapePoint.firstDepartureCandidate, 'a tripulação omitiu uma verificação prevista')
assert.equal(contextOutput.directActor.status, 'AMBIGUOUS')
assert.equal(contextOutput.canonicalTraversal.paths.length, 0)

// A perceptual divergence itself may be the first human departure. The audit must be able to
// promote it even when the primary pass failed to create any FIRST_DEPARTURE role.
const perceptualNarrative = 'Sem horizonte natural, o piloto percebeu a aeronave acima e mais distante do que realmente estava. Os instrumentos estavam disponíveis, mas a referência visual era enganosa.'
const perceptualPrimary: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'PER-ENV', sourceQuote: 'a referência visual era enganosa', sourceSentenceIndex: 1,
    roles: ['PRECONDITION'], concepts: [], actor: null, temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'ENVIRONMENT', preconditionCausalStatus: 'PRESENT_CONTEXT', actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'HIGH', rationale: 'Condição ambiental.'
  },
]
const perceptualAudit: SeraSemanticEvidenceAnnotation = {
  id: 'PER-AUDIT', sourceQuote: 'o piloto percebeu a aeronave acima e mais distante do que realmente estava', sourceSentenceIndex: 0,
  roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'PERCEPTION_STATE'], concepts: ['inadequateAssessment', 'perceptionCapabilityPresent', 'informationAmbiguous'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a aeronave acima e mais distante do que realmente estava.', confidence: 'HIGH', rationale: 'Divergência perceptiva contemporânea.'
}
const perceptualOutput = run('SEMANTIC-AUDIT-PERCEPTION-CAN-ANCHOR', perceptualNarrative, applyAuditedFirstDeparture(perceptualPrimary, perceptualAudit))
assert.equal(perceptualOutput.escapePoint.firstDepartureCandidate, 'o piloto percebeu a aeronave acima e mais distante do que realmente estava')
assert.equal(perceptualOutput.directActor.actor, 'piloto')
assert.equal(perceptualOutput.axes.perception.proposedCode, 'P-F')

// The semantic audit may reject a PRECONDITION category while preserving any other roles on
// the same source annotation. Presence of an object is not automatically an equipment defect.
const objectNarrative = 'Uma caixa permanecia no convés. O copiloto deixou de confirmar uma mensagem.'
const objectAnnotations: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'OBJ-EQUIPMENT-OVERCLAIM', sourceQuote: 'Uma caixa permanecia no convés.', sourceSentenceIndex: 0,
    roles: ['PRECONDITION', 'CONTEXT'], concepts: [], actor: null, temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: 'EQUIPMENT', preconditionCausalStatus: 'PRESENT_CONTEXT', actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, confidence: 'HIGH', rationale: 'Sobreclassificação semântica proposital.'
  },
]
const objectAudited = applyPreconditionSemanticAuditRejections(objectAnnotations, ['OBJ-EQUIPMENT-OVERCLAIM'])
assert.equal(objectAudited[0]?.roles.includes('PRECONDITION'), false)
assert.equal(objectAudited[0]?.roles.includes('CONTEXT'), true)
assert.equal(objectAudited[0]?.preconditionCategory, null)


// Perception-support facts may live in separate source spans. A deceptive visual reference
// is information-quality evidence, while functioning instruments show a usable alternative
// information source. The engine must be able to reach P-F without forcing every concept
// onto the PERCEPTION_STATE span itself.
const visualNarrative = 'O piloto percebeu a posição acima da posição real. As indicações instrumentais estavam disponíveis e funcionais. A iluminação externa produzia uma referência visual enganosa.'
const visualOutput = run('SEMANTIC-VISUAL-REFERENCE-SUPPORT-SEPARATE', visualNarrative, [
  {
    id: 'VIS-FIRST', sourceQuote: 'O piloto percebeu a posição acima da posição real.', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'PERCEPTION_STATE'], concepts: ['inadequateAssessment'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a posição acima da posição real.', confidence: 'HIGH', rationale: 'Percepção contemporânea divergente.'
  },
  {
    id: 'VIS-INSTR', sourceQuote: 'As indicações instrumentais estavam disponíveis e funcionais.', sourceSentenceIndex: 1,
    roles: ['CONTEXT'], concepts: ['informationAvailableCorrect'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: null, confidence: 'HIGH', rationale: 'Fonte instrumental disponível.'
  },
  {
    id: 'VIS-ILLUSION', sourceQuote: 'A iluminação externa produzia uma referência visual enganosa.', sourceSentenceIndex: 2,
    roles: ['CONTEXT'], concepts: ['informationAmbiguous'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: null, confidence: 'HIGH', rationale: 'Referência visual ilusória.'
  },
])
assert.equal(visualOutput.axes.perception.proposedCode, 'P-F')

// Presentation wording is not a semantic validator. If the semantic layer returns
// contradictory PERCEPTION_STATE claims, the deterministic engine must fail closed until
// the focused semantic adjudication resolves the conflict; it may not decide from prose grammar.
const roleNarrative = 'O comandante reconheceu corretamente o aviso e descreveu o estado do sistema. Em seguida, escolheu uma resposta inadequada.'
const roleOutput = run('SEMANTIC-ROLE-DISPLAY-CROSSCHECK', roleNarrative, [
  {
    id: 'ROLE-FIRST', sourceQuote: 'escolheu uma resposta inadequada.', sourceSentenceIndex: 1,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'escolheu uma resposta inadequada.', displayInterpretation: 'O operador tentava responder por meio da alternativa escolhida.', confidence: 'HIGH', rationale: 'Ação escolhida.'
  },
  {
    id: 'ROLE-WRONG-P', sourceQuote: 'escolheu uma resposta inadequada.', sourceSentenceIndex: 1,
    roles: ['PERCEPTION_STATE'], concepts: ['inadequateAssessment'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador tentava aplicar a resposta escolhida.', confidence: 'HIGH', rationale: 'Sobreposição semântica proposital.'
  },
  {
    id: 'ROLE-CORRECT-P', sourceQuote: 'O comandante reconheceu corretamente o aviso e descreveu o estado do sistema.', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['adequateAssessment', 'perceptionCapabilityPresent'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia corretamente o aviso e o estado do sistema.', confidence: 'HIGH', rationale: 'Percepção correta anterior à escolha de ação.'
  },
])
assert.equal(roleOutput.axes.perception.proposedCode, null)

const semanticPromptSource = fs.readFileSync('frontend/src/lib/sera-vnext/ai/semantic-enrichment.ts', 'utf8')
assert.match(semanticPromptSource, /referência visual\/ambiental explicitamente enganosa\/ilusória/)
assert.match(semanticPromptSource, /falha genérica de confirmar, comunicar, monitorar, perguntar ou checar NÃO é PROCEDURAL_OMISSION/)


// Product integration must request the focused semantic pass whenever any P/O/A node stalls,
// not only when the descriptive root is missing. Otherwise a partially understood axis can
// never recover concepts needed at deeper canonical nodes (e.g. assessment or risk management).
for (const file of [
  'frontend/src/lib/sera-vnext-product/persistence/create-analysis.ts',
  'frontend/src/lib/sera-vnext-product/persistence/reanalyze-analysis.ts',
]) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /\['PERCEPTION', 'OBJECTIVE', 'ACTION'\]\.includes\(question\.stage\)/)
  assert.doesNotMatch(source, /\-\(P\|O\|A\)_ROOT/)
  assert.match(source, /mergeFocusedPoaSemanticEvidence/, 'focused P/O/A adjudication must replace stale broad-pass semantics instead of union-merging them')
}

// Focused P adjudication is authoritative for the direct actor. A stale broad-pass
// informationAmbiguous/inadequateAssessment claim must not survive to outvote a focused
// unavailable/adequate claim in the deterministic tree.
const mergePrimary: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'MERGE-PRIMARY-P', sourceQuote: 'O piloto recebeu apenas parte da mensagem.', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['inadequateAssessment', 'informationAmbiguous'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a mensagem parcial como definitiva.', confidence: 'HIGH', rationale: 'Broad pass.'
  },
]
const mergeFocused: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'MERGE-FOCUSED-P', sourceQuote: 'O piloto recebeu apenas parte da mensagem.', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['inadequateAssessment'], actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a mensagem parcial como definitiva.', confidence: 'HIGH', rationale: 'Focused pass.'
  },
  {
    id: 'MERGE-FOCUSED-INFO', sourceQuote: 'A parte crítica não chegou ao piloto.', sourceSentenceIndex: 1,
    roles: ['CONTEXT'], concepts: ['informationUnavailable'], actor: 'piloto', temporalRelation: 'PRE_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: null, confidence: 'HIGH', rationale: 'Information audit.'
  },
]
const mergeResult = mergeFocusedPoaSemanticEvidence({ primary: mergePrimary, focused: mergeFocused, directActor: 'piloto' })
assert.equal(mergeResult.some((item) => item.concepts?.includes('informationAmbiguous')), false)
assert.equal(mergeResult.some((item) => item.concepts?.includes('informationUnavailable')), true)


// Objective recovery is authoritative when the broad pass loses a contemporaneous purpose.
// The merge must preserve the FIRST_DEPARTURE while allowing a focused OBJECTIVE_INTENT to
// drive the canonical objective tree.
const objectiveNarrative = 'O comandante decidiu abreviar a pausa prevista para recuperar tempo.'
const objectivePrimary: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'OBJ-FIRST', sourceQuote: 'O comandante decidiu abreviar a pausa prevista', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'O comandante decidiu abreviar a pausa prevista', displayInterpretation: 'O operador tentava abreviar a pausa prevista.', confidence: 'HIGH', rationale: 'Broad pass missed the purpose.'
  },
]
const objectiveFocused: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'OBJ-FOCUSED', sourceQuote: 'para recuperar tempo', sourceSentenceIndex: 0,
    roles: ['OBJECTIVE_INTENT'], concepts: ['efficiencyObjective', 'unmanagedRisk'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador pretendia recuperar tempo.', confidence: 'HIGH', rationale: 'Finalidade contemporânea.'
  },
]
const objectiveMerged = mergeFocusedPoaSemanticEvidence({ primary: objectivePrimary, focused: objectiveFocused, directActor: 'comandante' })
const objectiveOutput = run('SEMANTIC-FOCUSED-OBJECTIVE-AUTHORITY', objectiveNarrative, objectiveMerged)
assert.equal(objectiveOutput.escapePoint.firstDepartureCandidate, 'O comandante decidiu abreviar a pausa prevista')
assert.equal(objectiveOutput.axes.objective.proposedCode, 'O-D')

// Focused perception adjudication must remove a stale contradictory broad-pass assessment
// for the same actor. Correctly perceived state + later knowledge-based wrong action remains
// P-A on Perception rather than being pulled into a false perceptual failure.
const correctPPerceptionNarrative = 'O comandante identificou corretamente o alerta e o estado da aeronave, mas escolheu uma resposta inadequada porque não conhecia um detalhe do procedimento.'
const correctPPrimary: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'CP-FIRST', sourceQuote: 'escolheu uma resposta inadequada', sourceSentenceIndex: 0,
    roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction', 'selectionSubtype', 'actionKnowledgeLimitation'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'escolheu uma resposta inadequada', displayInterpretation: 'O operador tentava responder por meio da alternativa escolhida.', confidence: 'HIGH', rationale: 'Unsafe action.'
  },
  {
    id: 'CP-STALE-P', sourceQuote: 'escolheu uma resposta inadequada', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['inadequateAssessment'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia a resposta escolhida como adequada.', confidence: 'HIGH', rationale: 'Stale broad-pass cross-axis drift.'
  },
]
const correctPFocused: SeraSemanticEvidenceAnnotation[] = [
  {
    id: 'CP-FOCUSED-P', sourceQuote: 'O comandante identificou corretamente o alerta e o estado da aeronave', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['adequateAssessment', 'perceptionCapabilityPresent'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O operador percebia corretamente o alerta e o estado da aeronave.', confidence: 'HIGH', rationale: 'Focused P adjudication.'
  },
]
const correctPMerged = mergeFocusedPoaSemanticEvidence({ primary: correctPPrimary, focused: correctPFocused, directActor: 'comandante' })
const correctPOutput = run('SEMANTIC-FOCUSED-P-AUTHORITY', correctPPerceptionNarrative, correctPMerged)
assert.equal(correctPOutput.axes.perception.proposedCode, 'P-A')


// Presentation prose is not evidence. A semantically valid role must survive even when
// displayInterpretation uses a natural actor-specific verb rather than a hard-coded template.
const presentationNarrative = 'O comandante identificou corretamente o alerta e o estado da aeronave.'
const presentationEvidence = enforceSemanticEvidenceIntegrity({
  narrative: presentationNarrative,
  schemaVersion: 'SERA_SEMANTIC_AI_V2',
  annotations: [{
    id: 'PRESENTATION-P', sourceQuote: 'O comandante identificou corretamente o alerta e o estado da aeronave.', sourceSentenceIndex: 0,
    roles: ['PERCEPTION_STATE'], concepts: ['adequateAssessment'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
    preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null, displayInterpretation: 'O comandante identificou corretamente o alerta e o estado da aeronave.', confidence: 'HIGH', rationale: 'Percepção correta.'
  }],
})
assert.equal(presentationEvidence.some((item) => item.roles.includes('PERCEPTION_STATE')), true, 'presentation grammar must never delete semantic evidence')

// Source provenance is atomic: an annotation may quote a fragment of one source record but
// may not concatenate two sentences and then be attached to whichever one happens to match.
assert.equal(hasAtomicSemanticSourceQuote('Primeira frase factual. Segunda frase factual.', 'Primeira frase factual.'), true)
assert.equal(hasAtomicSemanticSourceQuote('Primeira frase factual. Segunda frase factual.', 'Primeira frase factual. Segunda frase factual.'), false)

// ACTION_MECHANISM and ACTION_STRATEGY are independent. The mandatory mechanism audit must
// not erase a valid strategy when it did not itself return a replacement strategy.
const strategyPrimary: SeraSemanticEvidenceAnnotation[] = [{
  id: 'STRATEGY-PRIMARY', sourceQuote: 'O comandante escolheu a resposta B', sourceSentenceIndex: 0,
  roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: ['implementedAction', 'incorrectAction'], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'O comandante escolheu a resposta B', displayInterpretation: 'O comandante aplicou a resposta B.', confidence: 'HIGH', rationale: 'Estratégia primária.'
}]
const mechanismOnlyFocused: SeraSemanticEvidenceAnnotation[] = [{
  id: 'MECHANISM-FOCUSED', sourceQuote: 'O comandante escolheu a resposta B', sourceSentenceIndex: 0,
  roles: ['ACTION_MECHANISM'], concepts: [], actor: 'comandante', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null, preconditionCausalStatus: null, actionFailureMechanism: 'OTHER_ACTION_FAILURE', actionMechanismEvidenceQuote: 'O comandante escolheu a resposta B', displayInterpretation: null, confidence: 'HIGH', rationale: 'Auditoria do mecanismo.'
}]
const strategyMerged = mergeFocusedPoaSemanticEvidence({ primary: strategyPrimary, focused: mechanismOnlyFocused, directActor: 'comandante' })
assert.equal(strategyMerged.some((item) => item.roles.includes('ACTION_STRATEGY')), true, 'mechanism-only audit must preserve an independent action strategy')

assert.match(semanticPromptSource, /crença sobre a CORREÇÃO, ADEQUAÇÃO ou PRESCRIÇÃO da própria ação escolhida/)
assert.match(semanticPromptSource, /informationUnavailable: informação OPERACIONAL necessária naquele momento NÃO CHEGOU ao ator/)
assert.match(semanticPromptSource, /SLOTS AUSENTES/)

console.log('PASS semantic anchor audit boundary — contextual conditions cannot seize P/O/A anchor, focused semantics adjudicate P/O/A, and precondition overclaims can be rejected')
