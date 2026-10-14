import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SERA_ENGINE_REFRESH_EPOCH, canReprocessCurrentEngine } from '../../frontend/src/lib/sera-vnext-product/engine-refresh'
import { classifyCanonicalReanalysisEvidence, mergeCanonicalReanalysisNarrative } from '../../frontend/src/lib/sera-vnext-product/canonical-event-analysis'

const original = 'O desvio ocorreu quando referências luminosas geraram impressão visual enganosa. A tripulação confirmou os instrumentos e corrigiu o desvio.'
const narrative = mergeCanonicalReanalysisNarrative({ baseNarrative: original, originalNarrative: original })
assert.equal(narrative, original, 'Engine-only refresh may not alter original evidence')
assert.equal(classifyCanonicalReanalysisEvidence({ previousNarrative: original, updatedNarrative: narrative, suppliedNewInformation: false }), 'NO_NEW_EVIDENCE')
assert.equal(canReprocessCurrentEngine({ requested: true, hasNewEvidence: false, lastEngineRefreshEpoch: null }), true)
assert.equal(canReprocessCurrentEngine({ requested: true, hasNewEvidence: false, lastEngineRefreshEpoch: 'EARLIER_ENGINE' }), true)
assert.equal(canReprocessCurrentEngine({ requested: true, hasNewEvidence: false, lastEngineRefreshEpoch: SERA_ENGINE_REFRESH_EPOCH }), false, 'must prevent repeated reprocessing with unchanged motor')
assert.equal(canReprocessCurrentEngine({ requested: true, hasNewEvidence: true, lastEngineRefreshEpoch: null }), false, 'engine-refresh mode must not mix factual evidence')
assert.equal(canReprocessCurrentEngine({ requested: false, hasNewEvidence: false, lastEngineRefreshEpoch: null }), false, 'must be explicit analyst action')
const root = 'frontend/src/'
const route = readFileSync(root + 'app/api/events/[eventId]/reanalyze-vnext/route.ts', 'utf8')
for (const required of [
  'requireBearerUser(req)', "eq('tenant_id', user.tenantId)", "eq('source_reference', eventId)",
  "is('deleted_at', null)", "['admin', 'analyst']", 'requestedEngineRefresh',
  'SERA_ENGINE_REFRESH_EPOCH', 'VNEXT_REPROCESS_ALREADY_CURRENT',
  'VNEXT_REPROCESS_REQUIRES_UNCHANGED_EVIDENCE', 'VNEXT_REPROCESS_ROLE_FORBIDDEN',
  "!requestedEngineRefresh", 'reprocessCurrentEngine: requestedEngineRefresh',
]) assert.ok(route.includes(required), `Engine-refresh route missing ${required}`)
const service = readFileSync(root + 'lib/sera-vnext-product/persistence/reanalyze-analysis.ts', 'utf8')
for (const required of [
  "analysis.status === 'ARCHIVED'", "narrative.startsWith(analysis.narrative)",
  '&& !args.reprocessCurrentEngine', 'engineRefreshEpoch: SERA_ENGINE_REFRESH_EPOCH',
  'reprocessCurrentEngine: args.reprocessCurrentEngine === true', 'repository.insertRevision',
  'repository.updateAnalysis', 'analysis.current_revision + 1',
]) assert.ok(service.includes(required), `Engine-refresh persistence missing ${required}`)
const canonical = readFileSync(root + 'lib/sera-vnext-product/canonical-event-analysis.ts', 'utf8')
assert.ok(canonical.includes("'canonical_event_engine_refresh'"))
assert.ok(canonical.includes('analysisId: args.existingAnalysisId'))
assert.ok(canonical.includes('reprocessCurrentEngine: args.reprocessCurrentEngine === true'))
const ui = readFileSync(root + 'app/(dashboard)/events/[id]/page.tsx', 'utf8')
assert.ok(ui.includes('Reprocessar com motor corrigido (sem novos fatos)'))
assert.ok(ui.includes('onClick={() => void reanalyzeWithVNext(true)}'))
assert.ok(ui.includes('reprocessCurrentEngine: engineRefresh'))
assert.ok(ui.includes('if (engineRefresh && vnextAdditionalInformation.trim()) return'))
const reviews = readFileSync(root + 'components/sera-vnext/EventHumanReviewPanel.tsx', 'utf8')
assert.ok(reviews.includes('Há evidência insuficiente em pelo menos uma etapa da análise.'))
assert.ok(!reviews.includes('O ponto de fuga/ator não está comprovado.'))
console.log('CALIBRATION_ENGINE_REFRESH_PASS: explicit role-gated engine-only revision, no new evidence, epoch-idempotency, historical preservation and accurate review notice')
