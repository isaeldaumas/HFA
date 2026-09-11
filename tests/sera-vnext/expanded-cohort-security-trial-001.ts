import assert from 'node:assert/strict'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from './product-beta-real-helpers'

const TRIAL_ID = 'expanded-cohort-security-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = resolveTestTenantPrefix({ fixture: 'B' })

type SecurityResult = {
  check: string
  result: 'PASS' | 'FAIL'
  detail: string
}

async function main(): Promise<void> {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: true })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const results: SecurityResult[] = []

  // 1. Unauthenticated access must be denied
  const unauth = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'GET',
    token: '',
  })
  results.push({
    check: 'unauthenticated_access_denied',
    result: unauth.status === 401 || unauth.status === 403 ? 'PASS' : 'FAIL',
    detail: `status=${unauth.status}`,
  })
  assert.ok(
    unauth.status === 401 || unauth.status === 403,
    `Expected 401 or 403 for unauthenticated, got ${unauth.status}`,
  )

  // 2. Invalid/fake token must be denied
  const fakeToken = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'GET',
    token: 'fake.jwt.token',
  })
  results.push({
    check: 'invalid_token_denied',
    result: fakeToken.status === 401 || fakeToken.status === 403 ? 'PASS' : 'FAIL',
    detail: `status=${fakeToken.status}`,
  })
  assert.ok(
    fakeToken.status === 401 || fakeToken.status === 403,
    `Expected 401 or 403 for fake token, got ${fakeToken.status}`,
  )

  // 3. Trial-plan user must not access sera-vnext
  const blocked = await createMagicLinkSession({
    baseUrl,
    participantId: 'REVIEWER-BLOCKED-01',
    tenantPrefix: BLOCKED_TENANT_PREFIX,
  })
  const crossTenantCreate = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: blocked.accessToken,
    body: {
      title: '[SERA_VNEXT_EXPANDED_COHORT] security probe create',
      narrative: 'Security probe — trial user attempting create.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId: `${TRIAL_ID}-sec-create-${Date.now()}`,
      metadata: { internalUseConfirmed: true },
    },
  })
  results.push({
    check: 'trial_user_create_denied',
    result: crossTenantCreate.status === 403 ? 'PASS' : 'FAIL',
    detail: `status=${crossTenantCreate.status}`,
  })
  assert.equal(crossTenantCreate.status, 403, `Trial user must be denied create, got ${crossTenantCreate.status}`)

  // 4. Trial user must not list analyses
  const crossTenantList = await apiJson<unknown>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'GET',
    token: blocked.accessToken,
  })
  results.push({
    check: 'trial_user_list_denied',
    result: crossTenantList.status === 403 ? 'PASS' : 'FAIL',
    detail: `status=${crossTenantList.status}`,
  })
  assert.equal(crossTenantList.status, 403, `Trial user must be denied list, got ${crossTenantList.status}`)

  // 5. Enterprise admin can create — then verify cross-tenant access is blocked
  const admin = await createMagicLinkSession({
    baseUrl,
    participantId: 'REVIEWER-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })
  const probeCreate = await apiJson<{ analysis: { id: string } }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: admin.accessToken,
    body: {
      title: '[SERA_VNEXT_EXPANDED_COHORT] security probe enterprise create',
      narrative: 'Security probe — enterprise user creates analysis for cross-tenant test.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId: `${TRIAL_ID}-sec-ent-${Date.now()}`,
      metadata: { internalUseConfirmed: true },
    },
  })
  assert.equal(
    probeCreate.status,
    201,
    `Enterprise create must succeed, got ${probeCreate.status} body=${JSON.stringify(probeCreate.json)}`,
  )
  const probeId = probeCreate.json.analysis.id
  results.push({
    check: 'enterprise_user_create_allowed',
    result: 'PASS',
    detail: `status=201 id=sanitized`,
  })

  // 6. Trial user must not access enterprise analysis detail
  const crossDetail = await apiJson<unknown>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${probeId}`,
    method: 'GET',
    token: blocked.accessToken,
  })
  results.push({
    check: 'cross_tenant_detail_denied',
    result: crossDetail.status === 403 || crossDetail.status === 404 ? 'PASS' : 'FAIL',
    detail: `status=${crossDetail.status}`,
  })
  assert.ok(
    crossDetail.status === 403 || crossDetail.status === 404,
    `Cross-tenant detail must be denied, got ${crossDetail.status}`,
  )

  // 7. Trial user must not review enterprise analysis
  const crossReview = await apiJson<unknown>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${probeId}/reviews`,
    method: 'POST',
    token: blocked.accessToken,
    body: {
      decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
      evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
      reviewNotes: 'Cross-tenant security probe review.',
      requiresMoreEvidence: false,
    },
  })
  results.push({
    check: 'cross_tenant_review_denied',
    result: crossReview.status === 403 || crossReview.status === 404 ? 'PASS' : 'FAIL',
    detail: `status=${crossReview.status}`,
  })
  assert.ok(
    crossReview.status === 403 || crossReview.status === 404,
    `Cross-tenant review must be denied, got ${crossReview.status}`,
  )

  // 8. Trial user must not export enterprise analysis
  const crossExport = await apiJson<unknown>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${probeId}/export`,
    method: 'GET',
    token: blocked.accessToken,
  })
  results.push({
    check: 'cross_tenant_export_denied',
    result: crossExport.status === 403 || crossExport.status === 404 ? 'PASS' : 'FAIL',
    detail: `status=${crossExport.status}`,
  })
  assert.ok(
    crossExport.status === 403 || crossExport.status === 404,
    `Cross-tenant export must be denied, got ${crossExport.status}`,
  )

  const failures = results.filter((r) => r.result === 'FAIL')
  assert.equal(failures.length, 0, `Security failures: ${JSON.stringify(failures)}`)

  console.log(JSON.stringify({ trialId: TRIAL_ID, checks: results, securityResult: 'PASS' }, null, 2))
  console.log('EXPANDED_COHORT_SECURITY_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
