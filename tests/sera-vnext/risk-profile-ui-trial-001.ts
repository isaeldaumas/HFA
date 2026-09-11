import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  buildBaseUrl,
  createMagicLinkBrowserSession,
  pwEval,
  pwExec,
  pwRequests,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-ui-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'riskprofileui1'

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
    pwExec(SESSION_ID, ['goto', `${baseUrl}/risk-profile`])
    const bodyText = await pwWaitForText(SESSION_ID, 'Perfil Organizacional', 20_000)
    assert.match(bodyText, /Eventos considerados no perfil/)
    assert.match(bodyText, /Eventos desconsiderados/)
    assert.equal(/baseado em 0 análise/i.test(bodyText), false, 'risk profile header must not claim zero analyses when real events exist')
    const requests = pwRequests(SESSION_ID)
    assert.match(requests, /\/api\/risk-profile/)
    const exportDisabled = pwEval<boolean>(
      SESSION_ID,
      `(() => {
        const button = Array.from(document.querySelectorAll('button')).find((item) => (item.textContent || '').includes('Exportar Relatório PDF'));
        return button instanceof HTMLButtonElement ? button.disabled : true;
      })()`,
    )
    assert.equal(exportDisabled, false)

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
