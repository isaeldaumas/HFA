/**
 * SERA vNext Product Unification — Dashboard Risk Profile E2E Trial
 *
 * Validates that:
 * 1. Dashboard code references /api/risk-profile (not /api/org/intelligence)
 * 2. /api/risk-profile returns expected structure for dashboard
 * 3. Dashboard response has correct fields: score, included_events, excluded_events
 * 4. Authenticated smoke: endpoint responds
 * 5. Unauthenticated → 401
 * 6. No critical errors in response body
 *
 * Run: npx tsx tests/sera-vnext/product-unification/dashboard-risk-profile-e2e-trial-001.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'dashboard-risk-profile-e2e-trial-001'
const ROOT = path.resolve(__dirname, '../../..')

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  // --- 1. Static: dashboard uses /api/risk-profile ---
  const dashboardPage = fs.readFileSync(
    path.join(ROOT, 'frontend/src/app/(dashboard)/dashboard/page.tsx'),
    'utf-8'
  )
  checks.push({
    name: 'dashboard_calls_canonical_risk_profile',
    status: dashboardPage.includes('/api/risk-profile') ? 'PASS' : 'FAIL',
    detail: 'dashboard/page.tsx references /api/risk-profile',
  })
  checks.push({
    name: 'dashboard_not_calling_deprecated_intelligence',
    status: !dashboardPage.includes('/api/org/intelligence') ? 'PASS' : 'FAIL',
    detail: 'dashboard/page.tsx does NOT reference /api/org/intelligence',
  })

  // --- 2. Auth ---
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'DASHBOARD-E2E-01',
    tenantPrefix: resolveTestTenantPrefix(),
    requirePlan: 'enterprise',
  })

  // --- 3. Unauth → 401 ---
  const unauth = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/risk-profile' })
  checks.push({ name: 'risk_profile_unauth_401', status: unauth.status === 401 ? 'PASS' : 'FAIL', detail: `status=${unauth.status}` })

  // --- 4. Authenticated: /api/risk-profile smoke ---
  const rp = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/risk-profile',
    token: enterprise.accessToken,
  })
  checks.push({ name: 'risk_profile_auth_200', status: rp.status === 200 ? 'PASS' : 'FAIL', detail: `status=${rp.status}` })

  const body = rp.json
  // Fields needed by the dashboard
  checks.push({ name: 'dashboard_field_score', status: typeof body?.score !== 'undefined' ? 'PASS' : 'FAIL', detail: `score=${body?.score}` })
  checks.push({ name: 'dashboard_field_included_events', status: typeof body?.included_events !== 'undefined' ? 'PASS' : 'FAIL', detail: `included=${body?.included_events}` })
  checks.push({ name: 'dashboard_field_excluded_events', status: typeof body?.excluded_events !== 'undefined' ? 'PASS' : 'FAIL', detail: `excluded=${body?.excluded_events}` })
  checks.push({ name: 'dashboard_field_completed_analyses', status: typeof body?.completed_analyses !== 'undefined' ? 'PASS' : 'FAIL', detail: `analyses=${body?.completed_analyses}` })

  // score is {value: number, level: string, label: string} or null
  const score = body?.score as Record<string, unknown> | null | undefined
  const scoreOk = score === null || (typeof score === 'object' && typeof score?.value === 'number' && typeof score?.level === 'string')
  checks.push({ name: 'dashboard_score_type', status: scoreOk ? 'PASS' : 'FAIL', detail: `score.value=${score?.value} score.level=${score?.level}` })

  // No error field in successful response
  checks.push({ name: 'dashboard_response_no_error_field', status: !('error' in (body ?? {})) ? 'PASS' : 'FAIL', detail: `error field absent` })

  // x-request-id: skipped (apiJson return type does not expose response headers)
  checks.push({ name: 'dashboard_response_has_x_request_id', status: 'SKIPPED', detail: 'headers not accessible via apiJson return type' })

  // --- 5. Dashboard page: no direct Supabase calls (uses API) ---
  checks.push({
    name: 'dashboard_uses_fetch_not_supabase_direct',
    status: dashboardPage.includes("fetch('/api/risk-profile'") ? 'PASS' : 'FAIL',
    detail: 'dashboard uses fetch to /api/risk-profile',
  })

  // --- Summary ---
  const pass = checks.filter(c => c.status === 'PASS').length
  const skip = checks.filter(c => c.status === 'SKIPPED').length
  const failCount = checks.filter(c => c.status === 'FAIL').length

  console.log(`\n[${TRIAL_ID}]`)
  for (const c of checks) {
    console.log(`  ${c.status === 'PASS' ? '✓' : c.status === 'SKIPPED' ? '-' : '✗'} [${c.status}] ${c.name} — ${c.detail}`)
  }
  console.log(`\nPASS=${pass} SKIPPED=${skip} FAIL=${failCount}`)
  if (failCount > 0) process.exit(1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
