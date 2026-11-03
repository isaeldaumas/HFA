import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraSemanticEvidenceAnnotation, SeraSemanticSafeOperationModel } from '../../frontend/src/lib/sera-vnext/engine-contract'

type Frozen = { annotations: SeraSemanticEvidenceAnnotation[]; safeOperationModel: SeraSemanticSafeOperationModel }
function run(no: 3 | 4, extra: SeraSemanticEvidenceAnnotation[]) {
  const narrative = readFileSync(`tests/sera-vnext/human-calibration-fixtures/evento-${no}.txt`, 'utf8')
  const frozen = JSON.parse(readFileSync(`tests/sera-vnext/human-calibration-fixtures/evento-${no}.semantic.json`, 'utf8')) as Frozen
  for (const item of extra) assert.ok(narrative.includes(item.sourceQuote), 'test quote must exist verbatim in its source')
  return runSeraVNextEngineV0({
    inputId: `CROSS_EPISODE_${no}`, requestId: `CROSS_EPISODE_${no}`, narrative, sourceType: 'real_event',
    locale: 'pt-BR', mode: 'CANDIDATE_ONLY', semanticEvidence: [...frozen.annotations, ...extra],
    semanticSafeOperationModel: frozen.safeOperationModel,
    semanticEnrichmentMeta: { provider: 'frozen', model: 'legacy-v1', requestedAt: '2026-10-15',
      schemaVersion: 'SERA_SEMANTIC_AI_V1', acceptedAnnotations: frozen.annotations.length + extra.length, rejectedAnnotations: 0 },
    options: { allowLlm: true, requireHumanReview: true },
  })
}
const e3H = 'h)\tEle afirma que o acidente anterior o deixou inseguro a ponto de entender que o pouso era dele quando não deveria.'
const e3 = run(3, [{
  id: 'AI-SEM-SUSPECT-CROSS-EPISODE', actor: 'piloto entrevistado', roles: ['PRECONDITION'],
  sourceSentenceIndex: 58, sourceQuote: e3H, concepts: [], rationale: 'Insegurança sobre quem deve pousar',
  confidence: 'HIGH', assertionStatus: 'AFFIRMED', occurrenceScope: 'PRE_EVENT_CAUSAL_HISTORY',
  temporalRelation: 'PRE_ESCAPE', preconditionCategory: 'PSYCHOLOGICAL',
}])
assert.match(e3.escapePoint.firstDepartureCandidate ?? '', /coletivo|mão/i)
assert.equal(e3.preconditions.some((pc) => pc.evidence.some((line) => line.includes('o pouso era dele'))), false,
  'a landing-decision sentence in a ground-service/collective event must not become a precondition, even if annotated PRECONDITION')
assert.equal(e3.preconditions.some((pc) => pc.canonicalCategory === 'PHYSIOLOGICAL'), true,
  'actual flight-duty fatigue context must survive the phase provenance gate')
assert.equal(e3.preconditions.some((pc) => pc.canonicalCategory === 'EQUIPMENT'), true,
  'documented defective component remains technical context, not converted to human cause')

const e4Quote = 'b)\tO piloto relata uma preocupação maior do que o normal durante o circuito de tráfego para pouso, e afirma que tinha consciência da importância de ter essa preocupação devido às condições para o pouso que eram bem delicadas, e também em função do acidente anterior com outra aeronave nessa mesma plataforma.'
const e4 = run(4, [{
  id: 'AI-SEM-MISLABELED-TRAINING', actor: 'piloto entrevistado', roles: ['PRECONDITION'],
  sourceSentenceIndex: 19, sourceQuote: e4Quote, concepts: ['attentionPressure'],
  rationale: 'Preocupação não demonstra lacuna de treinamento', confidence: 'HIGH', assertionStatus: 'AFFIRMED',
  occurrenceScope: 'CURRENT_EVENT', temporalRelation: 'AT_ESCAPE', preconditionCategory: 'TRAINING_SELECTION',
}])
assert.equal(e4.preconditions.some((pc) => pc.canonicalCategory === 'TRAINING_SELECTION'), false,
  'AI cannot create training/selection from concern and awareness without training facts')
assert.equal(e4.preconditions.some((pc) => pc.canonicalCategory === 'PSYCHOLOGICAL'), true,
  'source-supported psychological context in the landing-side event must remain available')
assert.equal(e3.humanReviewRequired, true)
assert.equal(e4.humanReviewRequired, true)
console.log('CROSS_EPISODE_PROVENANCE_PASS: no event-3/4 hypothesis migration or unsupported training category; evidence and review gates preserved')
