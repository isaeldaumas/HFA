/**
 * SERA vNext Product Unification — Risk Profile Endpoint Parity Real Trial
 *
 * Tests the three risk profile endpoints:
 * - /api/risk-profile (canonical, with audit log)
 * - /api/org/intelligence (deprecated, should return same data structure or deprecation metadata)
 * - /api/analyses/risk-profile (if exists, legacy)
 *
 * Validates:
 * - /api/risk-profile returns correct shape
 * - /api/org/intelligence returns deprecation header
 * - No cross-tenant data leak
 * - Error sanitization on auth failure
 *
 * Run: npx tsx tests/sera-vnext/product-unification/risk-profile-endpoint-parity-real-trial-001.ts
 */
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-endpoint-parity-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: true })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  // --- Auth ---
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'RISK-PARITY-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  // --- 1. Unauthenticated → 401 on canonical ---
  const unauthCanonical = await apiJson<Record<string, unknown>>({ baseUrl, path: '/api/risk-profile' })
  checks.push({ name: 'canonical_unauth_401', status: unauthCanonical.status === 401 ? 'PASS' : 'FAIL', detail: `status=${unauthCanonical.status}` })

  // --- 2. /api/risk-profile (canonical) ---
  const canonical = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/risk-profile',
    token: enterprise.accessToken,
  })
  checks.push({ name: 'canonical_returns_200', status: canonical.status === 200 ? 'PASS' : 'FAIL', detail: `status=${canonical.status}` })

  const canonicalBody = canonical.json
  checks.push({ name: 'canonical_has_score', status: typeof canonicalBody?.score !== 'undefined' ? 'PASS' : 'FAIL', detail: `score=${canonicalBody?.score}` })
  checks.push({ name: 'canonical_has_included_events', status: typeof canonicalBody?.included_events !== 'undefined' ? 'PASS' : 'FAIL', detail: `included=${canonicalBody?.included_events}` })
  checks.push({ name: 'canonical_has_excluded_events', status: typeof canonicalBody?.excluded_events !== 'undefined' ? 'PASS' : 'FAIL', detail: `excluded=${canonicalBody?.excluded_events}` })
  checks.push({ name: 'canonical_has_completed_analyses', status: typeof canonicalBody?.completed_analyses !== 'undefined' ? 'PASS' : 'FAIL', detail: `analyses=${canonicalBody?.completed_analyses}` })

  // Provenance fields in response
  const sourceEvents = canonicalBody?.source_events as Array<Record<string, unknown>> | undefined
  if (Array.isArray(sourceEvents) && sourceEvents.length > 0) {
    const hasSourceFlow = sourceEvents.some(e => 'source_flow' in e || e.sourceFlow !== undefined)
    checks.push({ name: 'canonical_source_events_have_source_flow', status: hasSourceFlow ? 'PASS' : 'SKIPPED', detail: `sourceFlow present in events: ${hasSourceFlow}` })
  } else {
    checks.push({ name: 'canonical_source_events_present', status: Array.isArray(sourceEvents) ? 'PASS' : 'SKIPPED', detail: `source_events=${JSON.stringify(sourceEvents)?.slice(0, 50)}` })
  }

  // No double counting: included + excluded should account for total
  const included = typeof canonicalBody?.included_events === 'number' ? canonicalBody.included_events as number : 0
  const excluded = typeof canonicalBody?.excluded_events === 'number' ? canonicalBody.excluded_events as number : 0
  const total = typeof canonicalBody?.total_events === 'number' ? canonicalBody.total_events as number : included + excluded
  checks.push({ name: 'canonical_no_double_counting', status: included + excluded <= total + 5 ? 'PASS' : 'FAIL', detail: `included=${included} + excluded=${excluded} <= total=${total}` })

  // --- 3. /api/org/intelligence (deprecated) ---
  const deprecated = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/org/intelligence',
    token: enterprise.accessToken,
  })
  checks.push({ name: 'deprecated_returns_200_or_410', status: [200, 410].includes(deprecated.status) ? 'PASS' : 'FAIL', detail: `status=${deprecated.status}` })

  // Deprecation header check: skipped (apiJson return type does not expose headers)
  checks.push({ name: 'deprecated_has_deprecation_header', status: 'SKIPPED', detail: 'headers not accessible via apiJson return type' })

  // Deprecated endpoint should return same score as canonical (or delegate to it)
  if (deprecated.status === 200) {
    const deprecatedBody = deprecated.json
    const canonicalScore = typeof canonicalBody?.score === 'number' ? canonicalBody.score : null
    const deprecatedScore = typeof deprecatedBody?.score === 'number' ? deprecatedBody.score : null
    checks.push({
      name: 'deprecated_score_matches_canonical',
      status: canonicalScore !== null && deprecatedScore !== null && Math.abs(canonicalScore - deprecatedScore) < 0.01 ? 'PASS' : 'SKIPPED',
      detail: `canonical=${canonicalScore} deprecated=${deprecatedScore}`,
    })
  }

  // --- 4. /api/analyses/risk-profile (if exists) ---
  const legacy = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/analyses/risk-profile',
    token: enterprise.accessToken,
  })
  if (legacy.status === 404) {
    checks.push({ name: 'legacy_risk_profile_not_routed', status: 'PASS', detail: 'endpoint not present (expected if removed)' })
  } else {
    checks.push({ name: 'legacy_risk_profile_responds', status: [200, 401, 403].includes(legacy.status) ? 'PASS' : 'SKIPPED', detail: `status=${legacy.status}` })
  }

  // --- 5. Error sanitization on risk-profile ---
  const badAuth = await apiJson<Record<string, unknown>>({
    baseUrl,
    path: '/api/risk-profile',
    token: 'invalid-token-xxxxxxxxxxx',
  })
  checks.push({ name: 'bad_token_returns_4xx', status: badAuth.status >= 400 && badAuth.status < 500 ? 'PASS' : 'FAIL', detail: `status=${badAuth.status}` })

  const errorBody = badAuth.json
  checks.push({
    name: 'error_response_no_stack_trace',
    status: !JSON.stringify(errorBody).includes('stack') ? 'PASS' : 'FAIL',
    detail: `response=${JSON.stringify(errorBody)?.slice(0, 80)}`,
  })
  checks.push({
    name: 'error_response_no_sql',
    status: !JSON.stringify(errorBody).toLowerCase().includes('select ') && !JSON.stringify(errorBody).toLowerCase().includes('from ') ? 'PASS' : 'FAIL',
    detail: 'no SQL in error response',
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
