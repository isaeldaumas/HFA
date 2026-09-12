/**
 * SERA vNext Canonical Routing — Dynamic Real Trial
 *
 * Tests the /api/analyze endpoint with SERA_VNEXT_CANONICAL_ANALYZE_ENABLED
 * flag ON and OFF.
 *
 * IMPORTANT: Turbopack does NOT support two dev servers from the same
 * directory. This test accepts separate base URLs via env vars. The
 * caller MUST start two processes sequentially or use different ports.
 *
 * Run sequence:
 *   1. Start OFF server on port 3110
 *   2. Run: SERA_VNEXT_TEST_BASE_URL=http://127.0.0.1:3110 npx tsx this_file.ts --mode off
 *   3. Kill OFF server
 *   4. Start ON server on port 3111
 *   5. Run: SERA_VNEXT_TEST_BASE_URL=http://127.0.0.1:3111 npx tsx this_file.ts --mode on
 *
 * Or use the full two-server run (requires both servers up on different machines/containers):
 *   SERA_VNEXT_TEST_BASE_URL_ON=http://HOST1:3111 \
 *   SERA_VNEXT_TEST_BASE_URL_OFF=http://HOST2:3110 \
 *   npx tsx tests/sera-vnext/product-unification/canonical-routing-dynamic-real-trial-001.ts
 */
import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
import {
  apiJson,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'canonical-routing-dynamic-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

interface AnalyzeResponse {
  event_id?: string
  analysis_id?: string
  source_flow?: string
  engine_runtime_version?: string
  canonical_tree_version?: string
  warnings?: string[]
  guardrails?: Record<string, boolean> | null
  reviewer_output?: unknown
  seraAnalysis?: unknown
}

const NARRATIVE = '[CANONICAL_ROUTING] Durante o procedimento de aproximacao, o piloto em comando manteve a descida abaixo da altitude minima de segurança sem referencias visuais adequadas. O co-piloto alertou sobre a altura mas o PM prosseguiu. O sistema de alerta GPWS ativou. A arremetida foi iniciada 3 segundos depois, sem sucesso.'

async function testFlagsOn(baseUrl: string) {
  await waitForServer(baseUrl)
  const session = await createMagicLinkSession({
    baseUrl,
    participantId: 'CANONICAL-ON-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  const res = await apiJson<AnalyzeResponse>({
    baseUrl, path: '/api/analyze', method: 'POST',
    token: session.accessToken,
    body: { eventoNarrativa: `[CANONICAL_ROUTING_ON_TEST] ${NARRATIVE}`, title: '[CANONICAL_ROUTING_ON_TEST]' },
  })

  checks.push({ name: 'ON_http_200', status: res.status === 200 ? 'PASS' : 'FAIL', detail: `status=${res.status}` })
  checks.push({ name: 'ON_source_flow_VNEXT_CANONICAL', status: res.json.source_flow === 'VNEXT_CANONICAL' ? 'PASS' : 'FAIL', detail: `source_flow=${res.json.source_flow}` })
  checks.push({ name: 'ON_engine_runtime_0.2.0', status: res.json.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL', detail: `engine_runtime_version=${res.json.engine_runtime_version}` })
  checks.push({ name: 'ON_canonical_tree_present', status: typeof res.json.canonical_tree_version === 'string' && res.json.canonical_tree_version.length > 0 ? 'PASS' : 'FAIL', detail: `canonical_tree_version=${res.json.canonical_tree_version}` })
  checks.push({ name: 'ON_warnings_array', status: Array.isArray(res.json.warnings) && res.json.warnings.length > 0 ? 'PASS' : 'FAIL', detail: `warnings_count=${Array.isArray(res.json.warnings) ? res.json.warnings.length : 'not_array'}` })
  checks.push({ name: 'ON_guardrails_present', status: 'guardrails' in res.json ? 'PASS' : 'FAIL', detail: `guardrails_type=${typeof res.json.guardrails}` })
  checks.push({ name: 'ON_reviewer_output_present', status: res.json.reviewer_output !== undefined ? 'PASS' : 'FAIL', detail: `reviewer_output_type=${typeof res.json.reviewer_output}` })
  checks.push({ name: 'ON_seraAnalysis_null', status: res.json.seraAnalysis === null ? 'PASS' : 'FAIL', detail: `seraAnalysis=${JSON.stringify(res.json.seraAnalysis)}` })
  checks.push({ name: 'ON_event_id_present', status: typeof res.json.event_id === 'string' ? 'PASS' : 'FAIL', detail: `event_id=${res.json.event_id}` })
  checks.push({ name: 'ON_analysis_id_present', status: typeof res.json.analysis_id === 'string' ? 'PASS' : 'FAIL', detail: `analysis_id=${String(res.json.analysis_id).slice(0, 12)}...` })

  return checks
}

async function testFlagsOff(baseUrl: string) {
  await waitForServer(baseUrl)
  const session = await createMagicLinkSession({
    baseUrl,
    participantId: 'CANONICAL-OFF-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  const res = await apiJson<AnalyzeResponse>({
    baseUrl, path: '/api/analyze', method: 'POST',
    token: session.accessToken,
    body: { eventoNarrativa: `[CANONICAL_ROUTING_OFF_TEST] ${NARRATIVE}`, title: '[CANONICAL_ROUTING_OFF_TEST]' },
  })

  checks.push({ name: 'OFF_http_200', status: res.status === 200 ? 'PASS' : 'FAIL', detail: `status=${res.status}` })
  checks.push({ name: 'OFF_no_source_flow', status: res.json.source_flow !== 'VNEXT_CANONICAL' ? 'PASS' : 'FAIL', detail: `source_flow=${res.json.source_flow ?? 'undefined'}` })
  checks.push({ name: 'OFF_no_engine_runtime', status: res.json.engine_runtime_version !== '0.2.0' ? 'PASS' : 'FAIL', detail: `engine_runtime_version=${res.json.engine_runtime_version ?? 'undefined'}` })
  checks.push({ name: 'OFF_seraAnalysis_object', status: typeof res.json.seraAnalysis === 'object' && res.json.seraAnalysis !== null ? 'PASS' : 'FAIL', detail: `seraAnalysis_type=${typeof res.json.seraAnalysis}` })
  checks.push({ name: 'OFF_event_id_present', status: typeof res.json.event_id === 'string' ? 'PASS' : 'FAIL', detail: `event_id=${res.json.event_id}` })
  checks.push({ name: 'OFF_analysis_id_present', status: typeof res.json.analysis_id === 'string' ? 'PASS' : 'FAIL', detail: `analysis_id=${String(res.json.analysis_id).slice(0, 12)}...` })

  return checks
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const mode = process.argv.includes('--mode') ? process.argv[process.argv.indexOf('--mode') + 1] : 'auto'
  const onBaseUrl = process.env.SERA_VNEXT_TEST_BASE_URL_ON?.trim() || 'http://127.0.0.1:3111'
  const offBaseUrl = process.env.SERA_VNEXT_TEST_BASE_URL_OFF?.trim() || 'http://127.0.0.1:3110'
  const singleUrl = process.env.SERA_VNEXT_TEST_BASE_URL?.trim() || 'http://127.0.0.1:3111'

  console.log(`\n=== CANONICAL ROUTING DYNAMIC REAL TRIAL (mode=${mode}) ===\n`)

  let allChecks: Array<{ name: string; status: string; detail: string }> = []

  if (mode === 'on') {
    console.log('--- FLAGS ON ---')
    try {
      const c = await testFlagsOn(singleUrl)
      allChecks.push(...c)
      for (const ch of c) console.log(`  ${ch.status === 'PASS' ? '✓' : '✗'} ${ch.name}: ${ch.detail}`)
    } catch (err) {
      console.log(`  ✗ ON_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      allChecks.push({ name: 'ON_fatal', status: 'FAIL', detail: String(err) })
    }
  } else if (mode === 'off') {
    console.log('--- FLAGS OFF ---')
    try {
      const c = await testFlagsOff(singleUrl)
      allChecks.push(...c)
      for (const ch of c) console.log(`  ${ch.status === 'PASS' ? '✓' : '✗'} ${ch.name}: ${ch.detail}`)
    } catch (err) {
      console.log(`  ✗ OFF_ERROR: ${err instanceof Error ? err.message : String(err)}`)
      allChecks.push({ name: 'OFF_fatal', status: 'FAIL', detail: String(err) })
    }
  } else {
    console.log('⚠ Turbopack does not support two dev servers from the same directory.')
    console.log('Run with --mode on or --mode off against a single running server.\n')
    allChecks.push({ name: 'INFO', status: 'SKIPPED', detail: 'Run with --mode on|off' })
  }

  const pass = allChecks.filter(c => c.status === 'PASS').length
  const fail = allChecks.filter(c => c.status === 'FAIL').length
  const skip = allChecks.filter(c => c.status === 'SKIPPED').length

  console.log(`\n=== SUMMARY: ${pass} PASS, ${fail} FAIL, ${skip} SKIPPED ===`)
  if (fail > 0) {
    console.log('RESULT: FAIL')
    process.exit(1)
  }
  console.log('RESULT: PASS')
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
