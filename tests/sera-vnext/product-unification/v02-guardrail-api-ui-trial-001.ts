/**
 * SERA vNext Product Unification — v02 Guardrail API/UI Trial
 *
 * Validates that guardrails v02 are:
 * - Present in engine output (always computed by step10-assurance)
 * - Reflected in analysis warnings stored in DB
 * - Present in API response (analysis.engine_output.guardrails)
 * - Correct keys and types
 *
 * Run: npx tsx tests/sera-vnext/product-unification/v02-guardrail-api-ui-trial-001.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'v02-guardrail-api-ui-trial-001'
const ROOT = path.resolve(__dirname, '../../..')

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  // --- 1. Static: guardrail integration in create-analysis.ts ---
  const createAnalysis = fs.readFileSync(path.join(ROOT, 'frontend/src/lib/sera-vnext-product/persistence/create-analysis.ts'), 'utf-8')
  checks.push({
    name: 'create_analysis_has_guardrail_warnings',
    status: createAnalysis.includes('GUARDRAIL_VIOLATED_') ? 'PASS' : 'FAIL',
    detail: 'GUARDRAIL_VIOLATED_ pattern in collectWarnings',
  })
  checks.push({
    name: 'create_analysis_audit_has_guardrail_violations',
    status: createAnalysis.includes('guardrailViolations') ? 'PASS' : 'FAIL',
    detail: 'guardrailViolations in audit payload',
  })

  // --- 2. Static: compute-guardrails.ts exists and exports the function ---
  const guardrailsFile = fs.readFileSync(
    path.join(ROOT, 'frontend/src/lib/sera-vnext/engine-v02/guardrails/compute-guardrails.ts'),
    'utf-8'
  )
  const expectedGuardrails = [
    'consequenceUsedAsCause',
    'postEscapeHuntingDetected',
    'postEscapeEvidenceUsed',
    'oeUsed',
    'inventedQuestionDetected',
    'actorMigrationDetected',
    'preconditionUsedAsEscapePoint',
    'codeFirstPathDetected',
    'awarenessMissingForViolation',
  ]
  for (const g of expectedGuardrails) {
    checks.push({
      name: `guardrail_key_${g}`,
      status: guardrailsFile.includes(g) ? 'PASS' : 'FAIL',
      detail: `key ${g} in compute-guardrails.ts`,
    })
  }

  // --- 3. Static: step10-assurance.ts calls computeSeraVNextGuardrails ---
  const assurance = fs.readFileSync(
    path.join(ROOT, 'frontend/src/lib/sera-vnext/engine-v0/steps/10-assurance.ts'),
    'utf-8'
  )
  checks.push({
    name: 'step10_calls_compute_guardrails',
    status: assurance.includes('computeSeraVNextGuardrails') ? 'PASS' : 'FAIL',
    detail: 'computeSeraVNextGuardrails called in step10',
  })

  // --- 4. Runtime: API response includes guardrails object ---
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'GUARDRAIL-API-01',
    tenantPrefix: resolveTestTenantPrefix(),
    requirePlan: 'enterprise',
  })

  const clientRequestId = `${TRIAL_ID}-${Date.now()}`
  const created = await apiJson<{
    analysis: Record<string, unknown>
    revision: { revision_number: number }
  }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: {
      title: '[PRODUCT_UNIFICATION_E2E] v02-guardrail-api-ui-trial-001',
      narrative:
        'O piloto prosseguiu com a aproximacao abaixo dos minimos meteorologicos sem contato com a torre. O resultado foi a colisao com obstaculo durante a fase final da aproximacao. O evento ocorreu apos a aeronave ter ultrapassado o ponto de decisao sem referencia visual.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId,
      metadata: { internalUseConfirmed: true, source: TRIAL_ID },
    },
  })

  checks.push({ name: 'api_create_returns_201', status: created.status === 201 ? 'PASS' : 'FAIL', detail: `status=${created.status}` })

  const analysis = created.json.analysis as Record<string, unknown> | undefined
  const engineOutput = analysis?.engine_output as Record<string, unknown> | undefined
  const guardrails = engineOutput?.guardrails as Record<string, boolean> | undefined

  checks.push({
    name: 'api_engine_output_has_guardrails',
    status: typeof guardrails === 'object' && guardrails !== null ? 'PASS' : 'FAIL',
    detail: `guardrails type=${typeof guardrails}`,
  })

  if (guardrails) {
    // All expected guardrail keys present in API response
    for (const g of expectedGuardrails) {
      checks.push({
        name: `api_guardrail_key_${g}_present`,
        status: g in guardrails ? 'PASS' : 'FAIL',
        detail: `${g}=${guardrails[g]}`,
      })
    }

    // All values are boolean
    const allBoolean = Object.values(guardrails).every(v => typeof v === 'boolean')
    checks.push({
      name: 'api_guardrail_values_all_boolean',
      status: allBoolean ? 'PASS' : 'FAIL',
      detail: `all values boolean: ${allBoolean}`,
    })

    // At least some guardrails are false (for a normal narrative, no violations expected)
    const falseCount = Object.values(guardrails).filter(v => v === false).length
    checks.push({
      name: 'api_guardrail_has_non_violated_entries',
      status: falseCount > 0 ? 'PASS' : 'FAIL',
      detail: `${falseCount} non-violated guardrails`,
    })
  }

  // Warnings: check structure
  const warnings = analysis?.warnings as string[] | undefined
  checks.push({
    name: 'api_warnings_array',
    status: Array.isArray(warnings) ? 'PASS' : 'FAIL',
    detail: `warnings count=${warnings?.length}`,
  })
  checks.push({
    name: 'api_warnings_include_human_review_required',
    status: Array.isArray(warnings) && warnings.includes('HUMAN_REVIEW_REQUIRED') ? 'PASS' : 'FAIL',
    detail: `HUMAN_REVIEW_REQUIRED in warnings`,
  })

  // Cleanup
  const analysisId = analysis?.id as string | undefined
  if (analysisId) {
    await apiJson({
      baseUrl,
      path: `/api/admin/sera-vnext/analyses/${analysisId}/archive`,
      method: 'POST',
      token: enterprise.accessToken,
    })
  }

  // --- Summary ---
  const pass = checks.filter(c => c.status === 'PASS').length
  const failCount = checks.filter(c => c.status === 'FAIL').length
  const skip = checks.filter(c => c.status === 'SKIPPED').length

  console.log(`\n[${TRIAL_ID}]`)
  for (const c of checks) {
    console.log(`  ${c.status === 'PASS' ? '✓' : c.status === 'SKIPPED' ? '-' : '✗'} [${c.status}] ${c.name} — ${c.detail}`)
  }
  console.log(`\nPASS=${pass} SKIPPED=${skip} FAIL=${failCount}`)
  if (failCount > 0) process.exit(1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
