/**
 * SERA vNext Product Unification — Reanalysis API Real Trial
 *
 * Creates an analysis, submits a review requesting reanalysis, then reanalyzes.
 * Validates that revision 2 carries correct provenance and that revision 1 is preserved.
 *
 * Run: npx tsx tests/sera-vnext/product-unification/provenance-reanalysis-api-real-trial-001.ts
 */
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  waitForServer,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'provenance-reanalysis-api-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

async function main() {
  // Safety guard: must be called before any mutation
  assertSafeTestEnvironment({ requiresFixtureIds: true })

  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'REANALYSIS-API-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Array<{ name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }> = []

  const clientRequestId = `${TRIAL_ID}-${Date.now()}`
  const payload = {
    title: '[PRODUCT_UNIFICATION_E2E] reanalysis-api-real-trial-001',
    narrative:
      'O piloto em comando iniciou a descida prematuramente, fora do procedimento publicado, enquanto o co-piloto operava o sistema de gerenciamento de voo. A equipe de controle de trafego aereo emitiu instrucao de altitude mas a tripulacao nao respondeu. O ativador do evento foi a descida nao autorizada.',
    sourceType: 'INTERNAL_PILOT',
    sourceReference: TRIAL_ID,
    clientRequestId,
    metadata: { internalUseConfirmed: true, source: TRIAL_ID },
  }

  // --- 1. Create analysis (revision 1) ---
  const created = await apiJson<{
    analysis: Record<string, unknown>
    revision: { id: string; revision_number: number; engine_runtime_version?: string; source_flow?: string }
    idempotent: boolean
  }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: payload,
  })

  checks.push({ name: 'create_returns_201', status: created.status === 201 ? 'PASS' : 'FAIL', detail: `status=${created.status}` })
  checks.push({ name: 'revision_1_created', status: created.json.revision?.revision_number === 1 ? 'PASS' : 'FAIL', detail: `rev=${created.json.revision?.revision_number}` })

  const analysisId = (created.json.analysis as Record<string, unknown>)?.id as string | undefined
  if (!analysisId) {
    console.error('Cannot continue: analysisId not returned')
    process.exit(1)
  }

  // --- 2. Validate revision 1 provenance via detail ---
  const detailBefore = await apiJson<{
    analysis: Record<string, unknown>
    revisions: Array<Record<string, unknown>>
    events: Array<Record<string, unknown>>
  }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}`,
    token: enterprise.accessToken,
  })
  checks.push({ name: 'detail_before_reanalysis_200', status: detailBefore.status === 200 ? 'PASS' : 'FAIL', detail: `status=${detailBefore.status}` })

  const rev1 = detailBefore.json.revisions?.[0] as Record<string, unknown> | undefined
  checks.push({ name: 'rev1_engine_runtime_version', status: rev1?.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL', detail: `engine_runtime_version=${rev1?.engine_runtime_version}` })
  checks.push({ name: 'rev1_source_flow', status: rev1?.source_flow === 'VNEXT_PRODUCT_BETA' ? 'PASS' : 'FAIL', detail: `source_flow=${rev1?.source_flow}` })
  checks.push({ name: 'rev1_revision_number', status: rev1?.revision_number === 1 ? 'PASS' : 'FAIL', detail: `revision_number=${rev1?.revision_number}` })

  const analysisBeforeReanalysis = detailBefore.json.analysis as Record<string, unknown>
  checks.push({
    name: 'analysis_current_revision_is_1',
    status: analysisBeforeReanalysis?.current_revision === 1 ? 'PASS' : 'FAIL',
    detail: `current_revision=${analysisBeforeReanalysis?.current_revision}`,
  })

  // Audit: analysis.created event present
  const createdEvents = (detailBefore.json.events ?? []).filter((e: Record<string, unknown>) => e.event_type === 'analysis.created')
  checks.push({ name: 'audit_analysis_created_event', status: createdEvents.length >= 1 ? 'PASS' : 'FAIL', detail: `count=${createdEvents.length}` })

  // --- 3. Submit review: RETURN_FOR_REANALYSIS ---
  const review = await apiJson<{ status: string; reviewStatus: string }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/reviews`,
    method: 'POST',
    token: enterprise.accessToken,
    body: {
      decision: 'RETURN_FOR_REANALYSIS',
      evidenceSufficiency: 'INSUFFICIENT',
      reviewNotes: 'Reanalysis API trial — requesting reanalysis to validate revision provenance.',
      requiresMoreEvidence: false,
    },
  })
  checks.push({ name: 'review_returns_201', status: review.status === 201 ? 'PASS' : 'FAIL', detail: `status=${review.status}` })
  checks.push({ name: 'analysis_status_returned_for_reanalysis', status: review.json.status === 'RETURNED_FOR_REANALYSIS' ? 'PASS' : 'FAIL', detail: `status=${review.json.status}` })

  // --- 4. Reanalyze ---
  const reanalyze = await apiJson<{
    analysis: Record<string, unknown>
    revision: Record<string, unknown>
  }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/reanalyze`,
    method: 'POST',
    token: enterprise.accessToken,
    body: { reason: TRIAL_ID },
  })
  checks.push({ name: 'reanalyze_returns_200', status: reanalyze.status === 200 ? 'PASS' : 'FAIL', detail: `status=${reanalyze.status}` })

  const rev2 = reanalyze.json.revision as Record<string, unknown> | undefined
  checks.push({ name: 'revision_2_created', status: rev2?.revision_number === 2 ? 'PASS' : 'FAIL', detail: `revision_number=${rev2?.revision_number}` })
  checks.push({ name: 'rev2_engine_runtime_version', status: rev2?.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL', detail: `engine_runtime_version=${rev2?.engine_runtime_version}` })
  checks.push({ name: 'rev2_source_flow', status: rev2?.source_flow === 'VNEXT_PRODUCT_BETA' ? 'PASS' : 'FAIL', detail: `source_flow=${rev2?.source_flow}` })

  const analysisAfterReanalysis = reanalyze.json.analysis as Record<string, unknown>
  checks.push({ name: 'analysis_status_candidate_after_reanalysis', status: analysisAfterReanalysis?.status === 'CANDIDATE_ANALYSIS_CREATED' ? 'PASS' : 'FAIL', detail: `status=${analysisAfterReanalysis?.status}` })
  checks.push({ name: 'analysis_current_revision_is_2', status: analysisAfterReanalysis?.current_revision === 2 ? 'PASS' : 'FAIL', detail: `current_revision=${analysisAfterReanalysis?.current_revision}` })

  // Final outputs still locked
  const engineOutput2 = analysisAfterReanalysis?.engine_output as Record<string, unknown> | undefined
  checks.push({ name: 'rev2_final_outputs_locked', status: engineOutput2?.selectedCode === null && engineOutput2?.downstreamAllowed === false ? 'PASS' : 'FAIL', detail: `selectedCode=${engineOutput2?.selectedCode} downstream=${engineOutput2?.downstreamAllowed}` })

  // --- 5. Validate revision history preservation ---
  const detailAfter = await apiJson<{
    revisions: Array<Record<string, unknown>>
    events: Array<Record<string, unknown>>
  }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}`,
    token: enterprise.accessToken,
  })
  const revisions = detailAfter.json.revisions ?? []
  checks.push({ name: 'both_revisions_present', status: revisions.length >= 2 ? 'PASS' : 'FAIL', detail: `revisions=${revisions.length}` })

  const rev1Preserved = revisions.find((r: Record<string, unknown>) => r.revision_number === 1)
  checks.push({ name: 'revision_1_preserved', status: !!rev1Preserved ? 'PASS' : 'FAIL', detail: `rev1_found=${!!rev1Preserved}` })
  checks.push({ name: 'rev1_provenance_preserved', status: rev1Preserved?.engine_runtime_version === '0.2.0' ? 'PASS' : 'FAIL', detail: `engine_runtime_version=${rev1Preserved?.engine_runtime_version}` })

  // Audit: reanalysis event present
  const reanalysisEvents = (detailAfter.json.events ?? []).filter((e: Record<string, unknown>) => e.event_type === 'analysis.reanalysis_requested' || e.event_type === 'analysis.reanalyzed')
  checks.push({ name: 'audit_reanalysis_event', status: reanalysisEvents.length >= 1 ? 'PASS' : 'FAIL', detail: `count=${reanalysisEvents.length}` })

  // --- Cleanup: archive ---
  await apiJson({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/archive`,
    method: 'POST',
    token: enterprise.accessToken,
  })

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
