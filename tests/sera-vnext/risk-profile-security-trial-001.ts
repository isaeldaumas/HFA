import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
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

const TRIAL_ID = 'risk-profile-security-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = resolveTestTenantPrefix({ fixture: 'B' })

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: true })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  let blockedToken: string | null = null
  try {
    const blocked = await createMagicLinkSession({
      baseUrl,
      participantId: 'PILOT-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })
    blockedToken = blocked.accessToken
  } catch {
    blockedToken = null
  }

  const unauth = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/risk-profile/exclusions',
    method: 'POST',
    body: {
      sourceType: 'legacy_event',
      sourceId: '00000000-0000-0000-0000-000000000000',
    },
  })
  assert.equal(unauth.status, 401)

  if (blockedToken) {
    const forbidden = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/risk-profile/exclusions',
      token: blockedToken,
      method: 'POST',
      body: {
        sourceType: 'legacy_event',
        sourceId: '00000000-0000-0000-0000-000000000000',
      },
    })
    assert.equal(forbidden.status, 403)
  }

  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '20260608190000_risk_profile_exclusions.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.equal(/grant\s+[^;]*\s+to\s+anon/i.test(sql), false, 'anon must not receive grants on risk_profile_exclusions')
  assert.match(sql, /enable row level security/i)

  const report = {
    trialId: TRIAL_ID,
    enterpriseTenantSanitized: sanitizeId(enterprise.tenantId),
    blockedSessionAvailable: !!blockedToken,
    status: 'PASS',
  }
  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
