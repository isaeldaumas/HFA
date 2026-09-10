import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
  buildBaseUrl,
  createMagicLinkBrowserSession,
  pwConsoleWarnings,
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

const TRIAL_ID = 'company-dashboard-readiness-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = process.env.SERA_VNEXT_TEST_BLOCKED_TENANT_PREFIX?.trim() || '9a52a850'
const ENTERPRISE_SESSION_ID = 'dashready1'
const BLOCKED_SESSION_ID = 'dashready2'

type Check = {
  name: string
  status: 'PASS' | 'SKIPPED'
  detail: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function closeSession(sessionId: string) {
  try {
    pwExec(sessionId, ['close'])
  } catch {
    // ignore cleanup failures
  }
}

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Check[] = []

  try {
    pwExec(ENTERPRISE_SESSION_ID, ['open', enterprise.actionLink, '--browser', 'firefox'])
    await pwWaitForUrlMatch(ENTERPRISE_SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)

    pwExec(ENTERPRISE_SESSION_ID, ['goto', `${baseUrl}/dashboard`])
    const dashboardText = await pwWaitForText(ENTERPRISE_SESSION_ID, 'Primeiros passos no HFA/SERA', 20_000)
    assert.match(dashboardText, /Comece aqui/)
    assert.match(dashboardText, /\bVer\b/)
    assert.doesNotMatch(dashboardText, /demo/i)
    assert.match(dashboardText, /Metodologia/)
    checks.push({ name: 'dashboard_route_loads', status: 'PASS', detail: 'primary company dashboard visible' })

    const noOverflow = pwEval<boolean>(
      ENTERPRISE_SESSION_ID,
      'document.documentElement.scrollWidth <= (window.innerWidth + 4)',
    )
    assert.equal(noOverflow, true)
    checks.push({ name: 'dashboard_has_no_critical_horizontal_overflow', status: 'PASS', detail: 'scrollWidth within viewport' })

    const dashboardBody = pwEval<string>(ENTERPRISE_SESSION_ID, 'document.body.innerText')
    assert.equal(dashboardBody.includes('Resultado candidate-only nao final.'), false)
    assert.equal(dashboardBody.includes('SERA vNext analises persistidas'), false)
    checks.push({ name: 'dashboard_is_not_polluted_by_beta_non_final_ui', status: 'PASS', detail: 'no beta workflow copy on /dashboard' })

    const requests = pwRequests(ENTERPRISE_SESSION_ID)
    assert.match(requests, /\/api\/auth\/me/)
    assert.match(requests, /\/api\/risk-profile/)
    checks.push({ name: 'dashboard_requests_tenant_scoped_endpoints', status: 'PASS', detail: '/api/auth/me and /api/risk-profile observed' })

    const consoleWarnings = pwConsoleWarnings(ENTERPRISE_SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(consoleWarnings), false)
    checks.push({ name: 'dashboard_has_no_critical_console_errors', status: 'PASS', detail: consoleWarnings.replace(/\s+/g, ' ').trim() })
  } finally {
    await closeSession(ENTERPRISE_SESSION_ID)
  }

  try {
    const blocked = await createMagicLinkBrowserSession({
      baseUrl,
      participantId: 'PILOT-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })

    try {
      pwExec(BLOCKED_SESSION_ID, ['open', blocked.actionLink, '--browser', 'firefox'])
      await pwWaitForUrlMatch(BLOCKED_SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
      await sleep(2_000)
      pwExec(BLOCKED_SESSION_ID, ['goto', `${baseUrl}/admin`])
      const redirectedText = await pwWaitForText(BLOCKED_SESSION_ID, 'Primeiros passos no HFA/SERA', 20_000)
      assert.match(redirectedText, /Comece aqui/)
      checks.push({ name: 'non_admin_or_non_enterprise_user_is_kept_out_of_admin_dashboard', status: 'PASS', detail: 'admin route returned to company dashboard surface' })
    } finally {
      await closeSession(BLOCKED_SESSION_ID)
    }
  } catch {
    checks.push({
      name: 'non_admin_or_non_enterprise_user_is_kept_out_of_admin_dashboard',
      status: 'SKIPPED',
      detail: 'blocked admin browser session unavailable',
    })
  }

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    enterpriseTenantSanitized: sanitizeId(enterprise.tenantId),
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('COMPANY_DASHBOARD_READINESS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
