import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  buildBaseUrl,
  createMagicLinkBrowserSession,
  pwExec,
  pwRequests,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-dashboard-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'riskprofiledash1'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  try {
    pwExec(SESSION_ID, ['open', enterprise.actionLink, '--browser', 'firefox'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)
    pwExec(SESSION_ID, ['goto', `${baseUrl}/dashboard`])
    const bodyText = await pwWaitForText(SESSION_ID, 'Primeiros passos no HFA/SERA', 20_000)
    assert.match(bodyText, /universo canônico/i)
    assert.match(bodyText, /considerados no perfil/i)
    assert.match(bodyText, /erc predominante/i)
    const requests = pwRequests(SESSION_ID)
    assert.match(requests, /\/api\/risk-profile/)
    assert.doesNotMatch(requests, /\/api\/org\/intelligence/)

    const report = {
      trialId: TRIAL_ID,
      tenantIdSanitized: sanitizeId(enterprise.tenantId),
      requests,
      status: 'PASS',
    }
    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ ...report, reportPath }, null, 2))
  } finally {
    try {
      pwExec(SESSION_ID, ['close'])
    } catch {
      // ignore cleanup failures
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
