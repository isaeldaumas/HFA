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
const SYNTHETIC_TITLE = `[${TRIAL_ID}] synthetic legacy universe`

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
    .map((item) =>
      item && typeof item === 'object' && typeof (item as { category?: unknown }).category === 'string'
        ? String((item as { category: string }).category)
        : null,
    )
    .filter((item): item is string => !!item)
}

function isCompatibleVNextRow(row: {
  perception_candidate_code?: string | null
  objective_candidate_code?: string | null
  action_candidate_code?: string | null
  engine_output?: unknown
}): boolean {
  return !!(
    row.perception_candidate_code ||
    row.objective_candidate_code ||
    row.action_candidate_code ||
    extractVNextPreconditions(row.engine_output).length > 0
  )
}

/**
 * Mirror frontend/src/lib/risk-profile/server.ts loadRiskProfileUniverse + included filter:
 * legacy completed-with-analysis, vNext HUMAN_REVIEW_COMPLETED_NON_FINAL compatible,
 * deduped by source_reference, excluding active risk_profile_exclusions.
 */
function expectedIncludedCount(args: {
  legacyEvents: Array<{ id: string; status: string; analyses: unknown }>
  legacyExcluded: Set<string>
  vnextRows: Array<{
    id: string
    status: string
    deleted_at: string | null
    source_reference: string | null
    created_at: string
    perception_candidate_code?: string | null
    objective_candidate_code?: string | null
    action_candidate_code?: string | null
    engine_output?: unknown
  }>
  vnextExcluded: Set<string>
}): { legacy: number; vnext: number; total: number } {
  const legacy = args.legacyEvents.filter((row) => {
    const analysisCount = Array.isArray(row.analyses) ? row.analyses.length : row.analyses ? 1 : 0
    return row.status === 'completed' && analysisCount > 0 && !args.legacyExcluded.has(String(row.id))
  }).length

  const compatible = args.vnextRows.filter(
    (row) =>
      row.status === 'HUMAN_REVIEW_COMPLETED_NON_FINAL' &&
      !row.deleted_at &&
      isCompatibleVNextRow(row) &&
      !args.vnextExcluded.has(String(row.id)),
  )
  const seen = new Set<string>()
  let vnext = 0
  for (const row of [...compatible].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const key = row.source_reference || row.id
    if (seen.has(key)) continue
    seen.add(key)
    vnext += 1
  }
  return { legacy, vnext, total: legacy + vnext }
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
  assert.ok(enterprise.publicUserId, 'enterprise public user required')

  const { admin } = createSupabaseClients()
  let seededEventId: string | null = null

  const seedLegacy = await admin
    .from('events')
    .insert({
      tenant_id: enterprise.tenantId,
      submitted_by: enterprise.publicUserId,
      title: SYNTHETIC_TITLE,
      raw_input: 'Synthetic risk-profile universe fixture. No human or production data.',
      input_type: 'text',
      status: 'completed',
    })
    .select('id')
    .single()
  if (seedLegacy.error) throw seedLegacy.error
  seededEventId = String(seedLegacy.data.id)

  const seedAnalysis = await admin.from('analyses').insert({
    event_id: seededEventId,
    tenant_id: enterprise.tenantId,
    event_summary: 'Synthetic risk-profile fixture',
    perception_code: 'P-A',
    objective_code: 'O-A',
    action_code: 'A-A',
  })
  if (seedAnalysis.error) throw seedAnalysis.error

  try {
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
        .select(
          'id, status, deleted_at, source_reference, created_at, perception_candidate_code, objective_candidate_code, action_candidate_code, engine_output',
        )
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

    const expected = expectedIncludedCount({
      legacyEvents: (legacyEventsRes.data ?? []) as Array<{ id: string; status: string; analyses: unknown }>,
      legacyExcluded,
      vnextRows: (vnextRes.data ?? []) as Array<{
        id: string
        status: string
        deleted_at: string | null
        source_reference: string | null
        created_at: string
        perception_candidate_code?: string | null
        objective_candidate_code?: string | null
        action_candidate_code?: string | null
        engine_output?: unknown
      }>,
      vnextExcluded,
    })

    const response = await apiJson<RiskProfileResponse>({
      baseUrl,
      path: '/api/risk-profile',
      token: enterprise.accessToken,
    })

    assert.equal(response.status, 200, `risk-profile status=${response.status} body=${JSON.stringify(response.json).slice(0, 400)}`)
    assert.equal(
      response.json.included_events,
      expected.total,
      `included_events must match canonical legacy+deduped-vNext universe (api=${response.json.included_events} expected=${expected.total} legacy=${expected.legacy} vnextDeduped=${expected.vnext})`,
    )
    assert.equal(response.json.total_analyses, response.json.included_events)
    assert.equal(response.json.completed_analyses, response.json.included_events)
    assert.ok(response.json.included_events > 0, 'risk profile must include at least the synthetic seeded event')
    assert.equal(response.json.source_events_included.length, response.json.included_events)
    assert.ok(response.json.generated_at.length > 10)
    assert.ok(
      response.json.source_events_included.some((item) => item.title === SYNTHETIC_TITLE),
      'seeded synthetic legacy event must appear in included sources',
    )
    assert.ok(response.json.perception_distribution.length > 0)
    assert.ok(response.json.objective_distribution.length > 0)
    assert.ok(response.json.action_distribution.length > 0)

    const report = {
      trialId: TRIAL_ID,
      baseUrl,
      tenantIdSanitized: sanitizeId(enterprise.tenantId),
      seededEventIdSanitized: sanitizeId(seededEventId),
      expectedLegacyIncluded: expected.legacy,
      expectedVNextIncludedDeduped: expected.vnext,
      includedEvents: response.json.included_events,
      excludedEvents: response.json.excluded_events,
      status: 'PASS',
    }

    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ ...report, reportPath }, null, 2))
  } finally {
    if (seededEventId) {
      try {
        await admin
          .from('events')
          .update({
            deleted_at: new Date().toISOString(),
            deletion_status: 'SOFT_DELETED',
            deletion_reason: `${TRIAL_ID} cleanup`,
          })
          .eq('id', seededEventId)
      } catch (cleanupError) {
        console.error('risk-profile-real-data cleanup failed', cleanupError)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
