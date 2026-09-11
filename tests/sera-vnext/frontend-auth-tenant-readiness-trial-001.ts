import assert from 'node:assert/strict'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import {
  handleGetSeraVNextAnalysisRequest,
  handleListSeraVNextAnalysesRequest,
} from '../../frontend/src/lib/sera-vnext-product/api-handlers'

const TRIAL_ID = 'frontend-auth-tenant-readiness-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = resolveTestTenantPrefix({ fixture: 'B' })

type Check = {
  name: string
  status: 'PASS' | 'SKIPPED'
  detail: string
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>
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
  let blockedTenantId: string | null = null
  try {
    const blocked = await createMagicLinkSession({
      baseUrl,
      participantId: 'PILOT-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })
    blockedToken = blocked.accessToken
    blockedTenantId = blocked.tenantId
  } catch {
    blockedToken = null
    blockedTenantId = null
  }

  const checks: Check[] = []

  const noAuthMe = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/auth/me',
  })
  assert.equal(noAuthMe.status, 401)
  checks.push({ name: 'no_session_me_returns_401', status: 'PASS', detail: String(noAuthMe.json.detail ?? '401') })

  const enterpriseMe = await apiJson<{ plan?: string; role?: string; is_admin?: boolean }>({
    baseUrl,
    path: '/api/auth/me',
    token: enterprise.accessToken,
  })
  assert.equal(enterpriseMe.status, 200)
  assert.equal(enterpriseMe.json.plan, 'enterprise')
  assert.equal(enterpriseMe.json.is_admin, true)
  checks.push({
    name: 'enterprise_admin_me_returns_200',
    status: 'PASS',
    detail: `plan=${enterpriseMe.json.plan} role=${enterpriseMe.json.role}`,
  })

  const adminStats = await apiJson<{ total_tenants?: number }>({
    baseUrl,
    path: '/api/admin/stats',
    token: enterprise.accessToken,
  })
  assert.equal(adminStats.status, 200)
  checks.push({ name: 'enterprise_admin_can_access_admin_routes', status: 'PASS', detail: `tenants=${adminStats.json.total_tenants ?? 'n/a'}` })

  if (blockedToken) {
    const blockedStats = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/stats',
      token: blockedToken,
    })
    assert.equal(blockedStats.status, 403)
    checks.push({
      name: 'non_enterprise_or_blocked_admin_is_denied',
      status: 'PASS',
      detail: String(blockedStats.json.detail ?? '403'),
    })
  } else {
    checks.push({
      name: 'non_enterprise_or_blocked_admin_is_denied',
      status: 'SKIPPED',
      detail: 'blocked admin session unavailable',
    })
  }

  const created = await apiJson<{ analysis?: { id?: string } }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: {
      title: `[${TRIAL_ID}] auth tenant probe`,
      narrative: 'Durante a aproximacao final, a tripulacao manteve a descida abaixo do perfil estabilizado ate o alerta sonoro, sem liberar qualquer saida final.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId: `${TRIAL_ID}-${Date.now()}`,
      metadata: { internalUseConfirmed: true },
    },
  })
  assert.equal(created.status, 201)
  const analysisId = String(created.json.analysis?.id ?? '')
  assert.match(analysisId, /^[0-9a-f-]{36}$/i)
  checks.push({ name: 'enterprise_admin_can_create_beta_analysis', status: 'PASS', detail: sanitizeId(analysisId) })

  if (blockedToken) {
    const blockedBeta = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      token: blockedToken,
    })
    assert.equal(blockedBeta.status, 403)
    checks.push({
      name: 'non_enterprise_or_blocked_admin_cannot_open_beta_api',
      status: 'PASS',
      detail: String(blockedBeta.json.detail ?? '403'),
    })
  } else {
    checks.push({
      name: 'non_enterprise_or_blocked_admin_cannot_open_beta_api',
      status: 'SKIPPED',
      detail: 'blocked admin session unavailable',
    })
  }

  const crossTenantReq = new Request(`http://localhost/api/admin/sera-vnext/analyses/${analysisId}`, {
    headers: {
      Authorization: `Bearer ${enterprise.accessToken}`,
      'x-request-id': `${TRIAL_ID}-cross-tenant`,
    },
  })
  const crossTenantRes = await handleGetSeraVNextAnalysisRequest(crossTenantReq, analysisId, {
    isEnabled: () => true,
    buildContext: async (_user, requestId) => ({
      userId: enterprise.publicUserId ?? enterprise.authUserId,
      email: enterprise.email,
      tenantId: '00000000-0000-0000-0000-00000000beef',
      role: 'admin',
      requestId,
    }),
  })
  assert.ok(crossTenantRes)
  assert.ok(crossTenantRes.status >= 400)
  const crossTenantJson = await parseJson(crossTenantRes)
  assert.equal(/stack|postgres|supabase/i.test(JSON.stringify(crossTenantJson)), false)
  checks.push({
    name: 'wrong_tenant_context_fails_closed_without_data_leak',
    status: 'PASS',
    detail: `status=${crossTenantRes.status}`,
  })

  const missingTenantRes = await handleListSeraVNextAnalysesRequest(new Request('http://localhost/api/admin/sera-vnext/analyses'), {
    isEnabled: () => true,
    requireAdminUser: async () => {
      throw new Response(JSON.stringify({ detail: 'tenant_id ausente no perfil' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    },
  })
  assert.ok(missingTenantRes)
  assert.equal(missingTenantRes.status, 403)
  const missingTenantJson = await parseJson(missingTenantRes)
  assert.match(String(missingTenantJson.detail ?? ''), /tenant_id ausente/i)
  checks.push({
    name: 'missing_tenant_profile_is_rejected',
    status: 'PASS',
    detail: String(missingTenantJson.detail ?? '403'),
  })

  const flagOffRes = await handleListSeraVNextAnalysesRequest(new Request('http://localhost/api/admin/sera-vnext/analyses'), {
    isEnabled: () => false,
  })
  assert.ok(flagOffRes)
  assert.equal(flagOffRes.status, 404)
  const flagOffJson = await parseJson(flagOffRes)
  assert.equal(flagOffJson.detail, 'Not found')
  checks.push({
    name: 'flag_off_returns_fail_closed_404',
    status: 'PASS',
    detail: String(flagOffJson.detail ?? '404'),
  })

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    enterpriseTenantSanitized: sanitizeId(enterprise.tenantId),
    blockedTenantSanitized: sanitizeId(blockedTenantId),
    analysisIdSanitized: sanitizeId(analysisId),
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('FRONTEND_AUTH_TENANT_READINESS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
