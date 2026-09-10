/**
 * SERA vNext Product Unification — Provenance API Real Trial
 *
 * Creates a real analysis via the admin API and validates provenance fields
 * in both the HTTP response and the database record.
 *
 * Run: npx tsx tests/sera-vnext/product-unification/provenance-api-real-trial-001.ts
 */
import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'provenance-api-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PROVENANCE-API-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  const clientRequestId = `${TRIAL_ID}-${Date.now()}`
  const payload = {
    title: '[PRODUCT_UNIFICATION_E2E] provenance-api-real-trial-001',
    narrative:
      'Durante o procedimento de aproximacao, o piloto em comando manteve a descida abaixo da altitude minima de segurança sem referencias visuais adequadas. O co-piloto alertou sobre a altura mas o PM prosseguiu. O sistema de alerta GPWS ativou. A arremetida foi iniciada 3 segundos depois, sem sucesso.',
    sourceType: 'INTERNAL_PILOT',
    sourceReference: TRIAL_ID,
    clientRequestId,
    metadata: { internalUseConfirmed: true, source: TRIAL_ID },
  }

  // --- 1. Unauthenticated request → 401 ---
  {
    const res = await apiJson<{ detail?: string }>({ baseUrl, path: '/api/admin/sera-vnext/analyses' })
    checks.push({ name: 'unauth_returns_401', status: res.status === 401 ? 'PASS' : 'FAIL', detail: `status=${res.status}` })
  }

  // --- 2. Create analysis → 201 with provenance fields ---
  const created = await apiJson<{
    analysis: Record<string, unknown>
    revision: { revision_number: number; engine_runtime_version?: string; source_flow?: string }
    idempotent: boolean
  }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: payload,
  })

  checks.push({
    name: 'create_returns_201',
    status: created.status === 201 ? 'PASS' : 'FAIL',
    detail: `status=${created.status}`,
  })

  const analysis = created.json.analysis as Record<string, unknown>
  const analysisId = analysis?.id as string | undefined

  // Provenance in analysis response
  checks.push({
    name: 'response_engine_version_0_1_0',
    status: analysis?.engine_version === '0.1.0' ? 'PASS' : 'FAIL',
    detail: `engine_version=${analysis?.engine_version}`,
  })
  checks.push({
    name: 'response_engine_runtime_version_0_2_0',
    status: analysis?.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL',
    detail: `engine_runtime_version=${analysis?.engine_runtime_version}`,
  })
  checks.push({
    name: 'response_source_flow_vnext_product_beta',
    status: analysis?.source_flow === 'VNEXT_PRODUCT_BETA' ? 'PASS' : 'FAIL',
    detail: `source_flow=${analysis?.source_flow}`,
  })
  checks.push({
    name: 'response_canonical_tree_version_sera_pt_v1',
    status: analysis?.canonical_tree_version === 'SERA_PT_V1' ? 'PASS' : 'FAIL',
    detail: `canonical_tree_version=${analysis?.canonical_tree_version}`,
  })
  checks.push({
    name: 'response_methodology_version_frozen',
    status: analysis?.methodology_version === 'SERA_PT_V1_FROZEN' ? 'PASS' : 'FAIL',
    detail: `methodology_version=${analysis?.methodology_version}`,
  })

  // Final outputs locked
  const engineOutput = analysis?.engine_output as Record<string, unknown> | undefined
  checks.push({
    name: 'final_outputs_locked_selectedCode',
    status: engineOutput?.selectedCode === null ? 'PASS' : 'FAIL',
    detail: `selectedCode=${engineOutput?.selectedCode}`,
  })
  checks.push({
    name: 'final_outputs_locked_releasedCode',
    status: engineOutput?.releasedCode === null ? 'PASS' : 'FAIL',
    detail: `releasedCode=${engineOutput?.releasedCode}`,
  })
  checks.push({
    name: 'final_outputs_locked_classifiedOutput',
    status: engineOutput?.classifiedOutput === false ? 'PASS' : 'FAIL',
    detail: `classifiedOutput=${engineOutput?.classifiedOutput}`,
  })
  checks.push({
    name: 'final_outputs_locked_downstreamAllowed',
    status: engineOutput?.downstreamAllowed === false ? 'PASS' : 'FAIL',
    detail: `downstreamAllowed=${engineOutput?.downstreamAllowed}`,
  })

  // Guardrails in engine output
  checks.push({
    name: 'engine_output_has_guardrails',
    status: typeof engineOutput?.guardrails === 'object' && engineOutput?.guardrails !== null ? 'PASS' : 'FAIL',
    detail: `guardrails=${JSON.stringify(engineOutput?.guardrails)?.slice(0, 80)}`,
  })

  // Warnings include NON_FINAL_OUTPUT_ONLY
  const warnings = analysis?.warnings as string[] | undefined
  checks.push({
    name: 'warnings_include_non_final_output',
    status: Array.isArray(warnings) && warnings.includes('NON_FINAL_OUTPUT_ONLY') ? 'PASS' : 'FAIL',
    detail: `warnings=${JSON.stringify(warnings)?.slice(0, 80)}`,
  })

  checks.push({
    name: 'revision_number_1',
    status: created.json.revision?.revision_number === 1 ? 'PASS' : 'FAIL',
    detail: `revision_number=${created.json.revision?.revision_number}`,
  })
  checks.push({
    name: 'not_idempotent_first_call',
    status: created.json.idempotent === false ? 'PASS' : 'FAIL',
    detail: `idempotent=${created.json.idempotent}`,
  })

  // --- 3. Idempotency: same payload → 200 idempotent ---
  if (analysisId) {
    const idempotent = await apiJson<{ idempotent: boolean }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: enterprise.accessToken,
      body: payload,
    })
    checks.push({
      name: 'idempotent_same_payload_returns_200',
      status: idempotent.status === 200 && idempotent.json.idempotent === true ? 'PASS' : 'FAIL',
      detail: `status=${idempotent.status} idempotent=${idempotent.json.idempotent}`,
    })

    // Conflict: same key + different payload → 409
    const conflict = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: enterprise.accessToken,
      body: { ...payload, title: '[CONFLICT] Different title for same clientRequestId' },
    })
    checks.push({
      name: 'conflict_divergent_payload_returns_409',
      status: conflict.status === 409 ? 'PASS' : 'FAIL',
      detail: `status=${conflict.status}`,
    })

    // Detail endpoint: provenance in DB record
    const detail = await apiJson<{ analysis: Record<string, unknown> }>({
      baseUrl,
      path: `/api/admin/sera-vnext/analyses/${analysisId}`,
      token: enterprise.accessToken,
    })
    checks.push({ name: 'detail_returns_200', status: detail.status === 200 ? 'PASS' : 'FAIL', detail: `status=${detail.status}` })

    const detailAnalysis = detail.json.analysis as Record<string, unknown> | undefined
    checks.push({
      name: 'detail_engine_runtime_version_0_2_0',
      status: detailAnalysis?.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL',
      detail: `engine_runtime_version=${detailAnalysis?.engine_runtime_version}`,
    })
    checks.push({
      name: 'detail_source_flow_vnext_product_beta',
      status: detailAnalysis?.source_flow === 'VNEXT_PRODUCT_BETA' ? 'PASS' : 'FAIL',
      detail: `source_flow=${detailAnalysis?.source_flow}`,
    })
    checks.push({
      name: 'detail_canonical_tree_version',
      status: detailAnalysis?.canonical_tree_version === 'SERA_PT_V1' ? 'PASS' : 'FAIL',
      detail: `canonical_tree_version=${detailAnalysis?.canonical_tree_version}`,
    })

    // Archive to cleanup
    await apiJson({
      baseUrl,
      path: `/api/admin/sera-vnext/analyses/${analysisId}/archive`,
      method: 'POST',
      token: enterprise.accessToken,
    })
  }

  // --- Summary ---
  const pass = checks.filter(c => c.status === 'PASS').length
  const fail = checks.filter(c => c.status === 'FAIL').length

  console.log(`\n[${TRIAL_ID}]`)
  for (const c of checks) {
    console.log(`  ${c.status === 'PASS' ? '✓' : c.status === 'SKIPPED' ? '-' : '✗'} [${c.status}] ${c.name} — ${c.detail}`)
  }
  console.log(`\nPASS=${pass} FAIL=${fail}`)
  if (fail > 0) process.exit(1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
