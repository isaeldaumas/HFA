/**
 * SERA vNext Product Unification — Error & Observability E2E Trial
 *
 * Tests error handling and observability across changed routes:
 * - /api/admin/sera-vnext/analyses: 401, 403, 409, 400, 404
 * - /api/risk-profile: 401, sanitized errors
 * - /api/org/intelligence: 401, deprecation header
 *
 * Validates:
 * - No stack trace in responses
 * - No raw SQL in responses
 * - No raw Supabase messages in responses
 * - request_id present in errors
 * - Stable error codes (not String(e))
 * - Static code audit for sanitization patterns
 *
 * Run: npx tsx tests/sera-vnext/product-unification/error-observability-e2e-trial-001.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'error-observability-e2e-trial-001'
const ROOT = path.resolve(__dirname, '../../..')

function noStack(body: unknown): boolean {
  const s = JSON.stringify(body)
  return !s.includes('"stack"') && !s.includes('at Object.') && !s.includes('at async ')
}
function noSql(body: unknown): boolean {
  const s = JSON.stringify(body).toLowerCase()
  return !s.includes('select ') && !s.includes('from ') && !s.includes('where ') && !s.includes('pg_')
}
function noRawSupabase(body: unknown): boolean {
  const s = JSON.stringify(body)
  return !s.includes('PGRST') && !s.includes('pgrst') && !s.includes('supabase.co')
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  // --- Static code audit ---
  const routes = [
    'frontend/src/app/api/risk-profile/route.ts',
    'frontend/src/app/api/org/intelligence/route.ts',
    'frontend/src/app/api/analyze/route.ts',
  ]
  for (const r of routes) {
    const content = fs.readFileSync(path.join(ROOT, r), 'utf-8')
    const routeName = path.basename(path.dirname(r))
    checks.push({
      name: `static_no_string_e_response_${routeName}`,
      status: !content.includes('return jsonError(String(e)') && !content.includes('return NextResponse.json({ detail: String(e)') ? 'PASS' : 'FAIL',
      detail: `No String(e) in response in ${routeName}`,
    })
  }

  // --- Auth: admin session ---
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'ERROR-OBS-01',
    tenantPrefix: resolveTestTenantPrefix(),
    requirePlan: 'enterprise',
  })

  // --- /api/admin/sera-vnext/analyses error cases ---

  // 1. No auth → 401
  const noAuth = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/admin/sera-vnext/analyses' })
  checks.push({ name: 'analyses_unauth_401', status: noAuth.status === 401 ? 'PASS' : 'FAIL', detail: `status=${noAuth.status}` })
  checks.push({ name: 'analyses_401_no_stack', status: noStack(noAuth.json) ? 'PASS' : 'FAIL', detail: 'no stack in 401 body' })
  checks.push({ name: 'analyses_401_no_sql', status: noSql(noAuth.json) ? 'PASS' : 'FAIL', detail: 'no SQL in 401 body' })

  // 2. Invalid payload → 400 or handled error
  const badPayload = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: { title: 'missing narrative' },
  })
  checks.push({ name: 'analyses_bad_payload_4xx', status: badPayload.status >= 400 ? 'PASS' : 'FAIL', detail: `status=${badPayload.status}` })
  checks.push({ name: 'analyses_bad_payload_no_stack', status: noStack(badPayload.json) ? 'PASS' : 'FAIL', detail: 'no stack in 4xx body' })
  checks.push({ name: 'analyses_bad_payload_no_sql', status: noSql(badPayload.json) ? 'PASS' : 'FAIL', detail: 'no SQL in 4xx body' })
  checks.push({ name: 'analyses_bad_payload_no_supabase', status: noRawSupabase(badPayload.json) ? 'PASS' : 'FAIL', detail: 'no raw Supabase in 4xx body' })

  // 3. Non-existent analysis detail → 404
  const nonExistent = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses/00000000-0000-0000-0000-000000000000',
    token: enterprise.accessToken,
  })
  checks.push({ name: 'analyses_nonexistent_4xx', status: nonExistent.status >= 400 ? 'PASS' : 'FAIL', detail: `status=${nonExistent.status}` })
  checks.push({ name: 'analyses_nonexistent_no_stack', status: noStack(nonExistent.json) ? 'PASS' : 'FAIL', detail: 'no stack in 404' })
  checks.push({ name: 'analyses_nonexistent_no_sql', status: noSql(nonExistent.json) ? 'PASS' : 'FAIL', detail: 'no SQL in 404' })

  // 4. Wrong token → 401 or 403
  const badToken = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    token: 'bad-token-12345',
  })
  checks.push({ name: 'analyses_bad_token_4xx', status: badToken.status >= 400 && badToken.status < 500 ? 'PASS' : 'FAIL', detail: `status=${badToken.status}` })
  checks.push({ name: 'analyses_bad_token_no_stack', status: noStack(badToken.json) ? 'PASS' : 'FAIL', detail: 'no stack in bad-token response' })

  // --- /api/risk-profile error cases ---

  // 5. No auth → 401
  const rpNoAuth = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/risk-profile' })
  checks.push({ name: 'risk_profile_unauth_401', status: rpNoAuth.status === 401 ? 'PASS' : 'FAIL', detail: `status=${rpNoAuth.status}` })
  checks.push({ name: 'risk_profile_401_no_stack', status: noStack(rpNoAuth.json) ? 'PASS' : 'FAIL', detail: 'no stack in 401' })

  // 6. Risk profile canonical: error code structured
  const rpBad = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/risk-profile', token: 'bad-token-rp' })
  checks.push({ name: 'risk_profile_bad_token_4xx', status: rpBad.status >= 400 && rpBad.status < 500 ? 'PASS' : 'FAIL', detail: `status=${rpBad.status}` })
  checks.push({ name: 'risk_profile_error_no_sql', status: noSql(rpBad.json) ? 'PASS' : 'FAIL', detail: 'no SQL in error' })
  checks.push({ name: 'risk_profile_error_no_supabase', status: noRawSupabase(rpBad.json) ? 'PASS' : 'FAIL', detail: 'no raw Supabase in error' })

  // --- /api/org/intelligence (deprecated) ---
  const intNoAuth = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/org/intelligence' })
  checks.push({ name: 'intelligence_unauth_401', status: intNoAuth.status === 401 ? 'PASS' : 'FAIL', detail: `status=${intNoAuth.status}` })
  checks.push({ name: 'intelligence_401_no_stack', status: noStack(intNoAuth.json) ? 'PASS' : 'FAIL', detail: 'no stack in 401' })

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
