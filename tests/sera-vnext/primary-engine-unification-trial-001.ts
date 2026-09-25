import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path: string): string { return readFileSync(path, 'utf8') }

const analyze = read('frontend/src/app/api/analyze/route.ts')
const events = read('frontend/src/app/api/events/route.ts')
const eventDetail = read('frontend/src/app/api/events/[eventId]/route.ts')
const reanalyze = read('frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts')
const riskProfile = read('frontend/src/lib/risk-profile/server.ts')
const eventPage = read('frontend/src/app/(dashboard)/events/[id]/page.tsx')
const actions = read('frontend/src/app/api/actions/route.ts')
const migration = read('supabase/migrations/20260925163712_corrective_actions_primary_sera_analysis.sql')
const legacyRecalcRoutes = [
  'frontend/src/app/api/recalculate/route.ts',
  'frontend/src/app/api/analyses/[analysisId]/recalculate/route.ts',
  'frontend/src/app/api/analyses/[analysisId]/edits/[editId]/route.ts',
].map(read)

for (const source of [analyze, events]) {
  assert.ok(source.includes('createCanonicalEventAnalysis'), 'new analyses must use SERA 0.3 canonical engine')
  assert.equal(source.includes('completeSeraAnalysisAfterEventCreated'), false, 'legacy engine must not be reachable')
  assert.equal(source.includes('applyUserAiSettingsToEnv'), false, 'primary deterministic engine must not require AI provider config')
  assert.equal(source.includes('isSeraVNextCanonicalAnalyzeEnabled'), false, 'primary engine must not be selected by rollout flag')
}
assert.equal(analyze.includes("toLowerCase() === 'admin'"), false, 'primary engine must not be admin-only')
assert.equal(eventDetail.includes('isSeraVNextCanonicalAnalyzeUiEnabled'), false, 'current SERA analysis must be visible without rollout UI flag')
assert.equal(reanalyze.includes("toLowerCase() !== 'admin'"), false, 'historical migration must not be admin-only')
assert.ok(events.includes("perception_code: (current?.perception_candidate_code"), 'event list must source P/O/A from current SERA')
assert.equal(events.includes('legacy?.perception_code'), false, 'legacy P/O/A must not be presented as current classification')
assert.ok(riskProfile.includes('sources: sortSourcesNewestFirst(vnextSources)'), 'risk profile must use only current SERA sources')
assert.ok(riskProfile.includes('motor anterior foram preservadas para auditoria'), 'risk profile must disclose excluded legacy history')
assert.ok(eventPage.includes('Registro histórico — motor anterior'), 'historical legacy record must be clearly labelled')
assert.ok(eventPage.includes('Reprocessar com SERA 0.3'), 'historical events must offer current-engine reprocessing')
assert.ok(eventPage.includes('Somente leitura — motor anterior'), 'legacy classification must be read-only')
assert.ok(actions.includes('sera_vnext_analysis_id'), 'corrective actions must support current SERA analyses')
assert.ok(migration.includes('num_nonnulls(analysis_id, sera_vnext_analysis_id) = 1'), 'corrective action source must be exclusive')
for (const route of legacyRecalcRoutes) {
  assert.ok(route.includes('status: 410'), 'legacy recalculation endpoint must be disabled')
  assert.equal(route.includes('@/lib/sera/recalculate'), false, 'legacy recalculation runtime import must be absent')
}

console.log('PASS primary SERA engine unification: 0.3 is the only active analysis engine; legacy is read-only history')
