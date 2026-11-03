import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { localizeRationale } from '../../frontend/src/lib/sera-vnext/engine-v0/localization'
import type { SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'

const prefix = 'tests/sera-vnext/human-calibration-fixtures/evento-3'
const narrative = readFileSync(prefix + '.txt', 'utf8')
const frozen = JSON.parse(readFileSync(prefix + '.semantic.json', 'utf8')) as {
  annotations: SeraSemanticEvidenceAnnotation[]; safeOperationModel: unknown
}
// A full interview can present a tentative explanation of purpose alongside
// a clearly documented act. A tentative actor objective must not be promoted
// merely because the surrounding text mentions another crew member's intent.
const uncertainIntents = frozen.annotations.map((item) => item.roles.includes('OBJECTIVE_INTENT')
  ? { ...item, assertionStatus: 'UNCERTAIN' as const }
  : item)
const output = runSeraVNextEngineV0({
  inputId: 'DAUMAS-PDF-3-UNCERTAIN-INTENT', requestId: 'audit', sourceType: 'real_event',
  mode: 'CANDIDATE_ONLY', narrative, locale: 'pt-BR',
  semanticEvidence: uncertainIntents,
  semanticSafeOperationModel: frozen.safeOperationModel as never,
  semanticEnrichmentMeta: { provider: 'frozen', model: 'v1', schemaVersion: 'SERA_SEMANTIC_AI_V1',
    requestedAt: 'frozen', acceptedAnnotations: uncertainIntents.length, rejectedAnnotations: 0 },
  options: { allowLlm: true, requireHumanReview: true },
})
assert.equal(output.canonicalTraversal.paths.find((p) => p.axis === 'O')?.answers[0]?.answer, 'INSUFFICIENT_EVIDENCE')
assert.equal(output.axes.objective.proposedCode, null)
assert.equal(output.canonicalTraversal.paths.find((p) => p.axis === 'A')?.answers.find((a) => a.nodeId === 'A_CAPABILITY')?.answer, 'INSUFFICIENT_EVIDENCE')
assert.equal(output.axes.action.proposedCode, null)
assert.match(localizeRationale('Legacy evidence contract uses a specific action subtype as the capability continuation signal; V2 requires independent positive capability evidence.', 'pt-BR'), /evidência positiva independente/i)
const pdf = readFileSync('frontend/src/lib/sera-vnext-product/pdf-report.ts', 'utf8')
assert.ok(pdf.includes('keepTogether(doc, doc.heightOfString(empty'), 'empty bullets must paginate without overwriting footer')
assert.match(pdf, /Outros fatores contribuintes e observações operacionais.{0,150}165\)/, 'section 7 reserves space for its first paragraph and empty state')
console.log('DAUMAS_PDF_PROOF_PASS: uncertainty on O is not converted to intent; V1 action subtype not capability; Portuguese rationale and PDF empty-state keep-together')
