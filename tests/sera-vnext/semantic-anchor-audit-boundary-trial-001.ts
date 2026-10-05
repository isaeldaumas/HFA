import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyAuditedFirstDeparture, applyPreconditionSemanticAuditRejections } from '../../frontend/src/lib/sera-vnext/ai/semantic-enrichment'
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

// A P/O/A display sentence is also a schema-level role cross-check. If a model labels an
// action sentence as PERCEPTION_STATE but its own presentation says "tentava", that P role
// must fail closed; a separate source-grounded correct perception remains authoritative.
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
assert.equal(roleOutput.axes.perception.proposedCode, 'P-A')

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
  assert.match(source, /item\.concepts\?\.join\(','\)/, 'focused semantic concepts must participate in the merge key so a richer second pass is not discarded')
}

console.log('PASS semantic anchor audit boundary — contextual conditions cannot seize P/O/A anchor, perception may anchor, and precondition overclaims can be rejected')
