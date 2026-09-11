import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  createSupabaseClients,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-real-data-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

type RiskProfileResponse = {
  total_events: number
  included_events: number
  excluded_events: number
  completed_analyses: number
  total_analyses: number
  source_events_included: Array<{ id: string; title: string; source: string; status: string }>
  source_events_excluded: Array<{ id: string; title: string; source: string; status: string }>
  perception_distribution: Array<{ code: string; count: number }>
  objective_distribution: Array<{ code: string; count: number }>
  action_distribution: Array<{ code: string; count: number }>
  generated_at: string
}

function extractVNextPreconditions(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  const raw = (value as { preconditions?: unknown }).preconditions
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => item && typeof item === 'object' && typeof (item as { category?: unknown }).category === 'string'
      ? String((item as { category: string }).category)
      : null)
    .filter((item): item is string => !!item)
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const { admin } = createSupabaseClients()

  const [legacyEventsRes, legacyExclusionsRes, vnextRes, vnextExclusionsRes] = await Promise.all([
    admin
      .from('events')
      .select('id, status, deleted_at, analyses(id)')
      .eq('tenant_id', enterprise.tenantId)
      .is('deleted_at', null),
    admin
      .from('risk_profile_exclusions')
      .select('source_id')
      .eq('tenant_id', enterprise.tenantId)
      .eq('source_type', 'legacy_event')
      .is('restored_at', null),
    admin
      .from('sera_vnext_analyses')
      .select('id, status, deleted_at, perception_candidate_code, objective_candidate_code, action_candidate_code, engine_output')
      .eq('tenant_id', enterprise.tenantId)
      .eq('status', 'HUMAN_REVIEW_COMPLETED_NON_FINAL')
      .is('deleted_at', null),
    admin
      .from('risk_profile_exclusions')
      .select('source_id')
      .eq('tenant_id', enterprise.tenantId)
      .eq('source_type', 'sera_vnext_analysis')
      .is('restored_at', null),
  ])

  if (legacyEventsRes.error) throw legacyEventsRes.error
  if (legacyExclusionsRes.error) throw legacyExclusionsRes.error
  if (vnextRes.error) throw vnextRes.error
  if (vnextExclusionsRes.error) throw vnextExclusionsRes.error

  const legacyExcluded = new Set(
    (legacyExclusionsRes.data ?? []).map((row: { source_id: unknown }) => String(row.source_id)),
  )
  const vnextExcluded = new Set(
    (vnextExclusionsRes.data ?? []).map((row: { source_id: unknown }) => String(row.source_id)),
  )

  const expectedLegacyIncluded = (legacyEventsRes.data ?? []).filter((row: any) => {
    const analysisCount = Array.isArray(row.analyses) ? row.analyses.length : row.analyses ? 1 : 0
    return row.status === 'completed' && analysisCount > 0 && !legacyExcluded.has(String(row.id))
  }).length

  const expectedVNextIncluded = (vnextRes.data ?? []).filter((row: any) => {
    const hasSignal = !!(
      row.perception_candidate_code ||
      row.objective_candidate_code ||
      row.action_candidate_code ||
      extractVNextPreconditions(row.engine_output).length > 0
    )
    return row.status === 'HUMAN_REVIEW_COMPLETED_NON_FINAL' && !row.deleted_at && hasSignal && !vnextExcluded.has(String(row.id))
  }).length

  const response = await apiJson<RiskProfileResponse>({
    baseUrl,
    path: '/api/risk-profile',
    token: enterprise.accessToken,
  })

  assert.equal(response.status, 200)
  assert.equal(response.json.total_analyses, response.json.included_events)
  assert.equal(response.json.completed_analyses, response.json.included_events)
  assert.equal(
    response.json.included_events,
    expectedLegacyIncluded + expectedVNextIncluded,
    'included_events must match canonical legacy+compatible-vNext universe',
  )
  assert.ok(response.json.included_events > 0, 'risk profile must not remain at zero with completed analyses present')
  assert.equal(response.json.source_events_included.length, response.json.included_events)
  assert.ok(response.json.generated_at.length > 10)
  assert.ok(
    response.json.source_events_included.some((item) => ['trial 3', 'Trial set 1 b', 'TRIAL-SET1-001', 'Teste 10'].includes(item.title)),
    'included sources should expose real legacy events shown in the Events page',
  )
  assert.ok(response.json.perception_distribution.length > 0)
  assert.ok(response.json.objective_distribution.length > 0)
  assert.ok(response.json.action_distribution.length > 0)

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    tenantIdSanitized: sanitizeId(enterprise.tenantId),
    expectedLegacyIncluded,
    expectedVNextIncluded,
    includedEvents: response.json.included_events,
    excludedEvents: response.json.excluded_events,
    status: 'PASS',
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
