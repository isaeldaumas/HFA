import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-api-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

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

  const unauth = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/risk-profile',
  })
  assert.equal(unauth.status, 401)

  const profile = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/risk-profile',
    token: enterprise.accessToken,
  })
  assert.equal(profile.status, 200)

  for (const field of [
    'score',
    'total_events',
    'included_events',
    'excluded_events',
    'completed_analyses',
    'error_analyses',
    'erc_distribution',
    'perception_distribution',
    'objective_distribution',
    'action_distribution',
    'source_events_included',
    'source_events_excluded',
    'limitations',
    'generated_at',
  ]) {
    assert.ok(field in profile.json, `missing field ${field}`)
  }

  const included = Array.isArray(profile.json.source_events_included)
    ? profile.json.source_events_included as Array<Record<string, unknown>>
    : []
  if (included.length > 0) {
    for (const forbiddenField of ['raw_input', 'narrative', 'engine_output', 'selectedCode', 'releasedCode', 'finalConclusion']) {
      assert.equal(forbiddenField in included[0], false, `forbidden response field present: ${forbiddenField}`)
    }
  }

  const notFound = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/risk-profile/exclusions',
    token: enterprise.accessToken,
    method: 'POST',
    body: {
      sourceType: 'legacy_event',
      sourceId: '00000000-0000-0000-0000-000000000000',
      reason: 'not found probe',
    },
  })
  assert.equal(notFound.status, 404)

  const report = {
    trialId: TRIAL_ID,
    tenantIdSanitized: sanitizeId(enterprise.tenantId),
    includedCount: included.length,
    status: 'PASS',
  }
  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
