import assert from 'node:assert/strict'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  createMagicLinkSession,
  pwConsoleWarnings,
  pwExec,
  pwWaitForText,
  pwWaitForUrlMatch,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'
import { handleListSeraVNextAnalysesRequest } from '../../frontend/src/lib/sera-vnext-product/api-handlers'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'

const TRIAL_ID = 'frontend-error-observability-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = resolveTestTenantPrefix({ fixture: 'B' })
const SESSION_ID = 'obsv1'

type Check = {
  name: string
  status: 'PASS' | 'SKIPPED'
  detail: string
}

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

  const checks: Check[] = []

  const noAuth = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
  })
  assert.equal(noAuth.status, 401)
  assert.match(String(noAuth.json.detail ?? ''), /Nao autorizado|Não autorizado/i)
  checks.push({ name: 'unauthorized_api_error_is_sanitized', status: 'PASS', detail: String(noAuth.json.detail ?? '401') })

  const invalidBody = await apiJson<{ detail?: string; errorCode?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: { title: '', narrative: 'curto' },
  })
  assert.ok([400, 422].includes(invalidBody.status))
  assert.equal(/stack|postgres|supabase/i.test(JSON.stringify(invalidBody.json)), false)
  checks.push({
    name: 'invalid_create_payload_returns_sanitized_validation_error',
    status: 'PASS',
    detail: `${invalidBody.status}:${String(invalidBody.json.errorCode ?? invalidBody.json.detail ?? 'validation')}`,
  })

  if (blockedToken) {
    const blocked = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      token: blockedToken,
    })
    assert.equal(blocked.status, 403)
    assert.match(String(blocked.json.detail ?? ''), /restrito|enterprise/i)
    checks.push({ name: 'forbidden_admin_error_is_sanitized', status: 'PASS', detail: String(blocked.json.detail ?? '403') })
  } else {
    checks.push({ name: 'forbidden_admin_error_is_sanitized', status: 'SKIPPED', detail: 'blocked admin session unavailable' })
  }

  const disabledRes = await handleListSeraVNextAnalysesRequest(new Request('http://localhost/api/admin/sera-vnext/analyses'), {
    isEnabled: () => false,
  })
  assert.ok(disabledRes)
  assert.equal(disabledRes.status, 404)
  const disabledJson = await disabledRes.json().catch(() => ({})) as Record<string, unknown>
  assert.equal(disabledJson.detail, 'Not found')
  checks.push({ name: 'flag_off_beta_surface_fails_closed_without_stack', status: 'PASS', detail: String(disabledJson.detail ?? '404') })

  const browserSession = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  try {
    pwExec(SESSION_ID, ['open', browserSession.actionLink, '--browser', 'chromium'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 20_000)
    await sleep(2_000)
    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/new`])
    await pwWaitForText(SESSION_ID, 'Executar motor vNext v0.1 e persistir', 20_000)
    const consoleWarnings = pwConsoleWarnings(SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(consoleWarnings), false)
    assert.equal(/access_token|authorization|bearer|cookie|service_role|jwt/i.test(consoleWarnings), false)
    checks.push({
      name: 'browser_console_does_not_leak_tokens_or_secrets',
      status: 'PASS',
      detail: consoleWarnings.replace(/\s+/g, ' ').trim(),
    })
  } finally {
    try {
      pwExec(SESSION_ID, ['close'])
    } catch {
      // ignore cleanup failures
    }
  }

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('FRONTEND_ERROR_OBSERVABILITY_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
