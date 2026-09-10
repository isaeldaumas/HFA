import { assertSafeTestEnvironment } from '../../helpers/assert-safe-test-environment'
import assert from 'node:assert/strict'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  eventCountByType,
  fetchProductBetaDbState,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'product-beta-api-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = process.env.SERA_VNEXT_TEST_TENANT_PREFIX?.trim() || '3a68c15d'
const BLOCKED_TENANT_PREFIX = process.env.SERA_VNEXT_TEST_BLOCKED_TENANT_PREFIX?.trim() || '9a52a850'

type TrialReport = {
  trialId: string
  baseUrl: string
  participantId: string
  blockedParticipantId: string | null
  analysisIdSanitized: string
  checks: Array<{ name: string; status: 'PASS' | 'SKIPPED'; detail: string }>
  summary: Record<string, unknown>
}

async function main() {
  // Safety guard: must be called before any mutation
  assertSafeTestEnvironment({ requiresFixtureIds: true })

  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  let blockedParticipantId: string | null = null
  let blockedToken: string | null = null
  try {
    const blocked = await createMagicLinkSession({
      baseUrl,
      participantId: 'PILOT-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })
    blockedParticipantId = blocked.participantId
    blockedToken = blocked.accessToken
  } catch {
    blockedParticipantId = null
    blockedToken = null
  }

  const checks: TrialReport['checks'] = []
  const payload = {
    title: '[SERA_VNEXT_CONTROLLED_PILOT] API real test — clean anchor',
    narrative:
      'Durante a aproximacao estabilizada, o PF prosseguiu abaixo da altitude minima publicada sem referencia visual suficiente e manteve a descida ate o aviso do sistema, momento em que a arremetida foi iniciada.',
    sourceType: 'INTERNAL_PILOT',
    sourceReference: 'product-beta-api-real-trial-001',
    clientRequestId: `${TRIAL_ID}-${Date.now()}`,
    metadata: { internalUseConfirmed: true, source: TRIAL_ID },
  }

  const noAuth = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
  })
  assert.equal(noAuth.status, 401)
  checks.push({ name: 'anon_returns_401', status: 'PASS', detail: String(noAuth.json.detail ?? '401') })

  if (blockedToken) {
    const denied = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: blockedToken,
      body: payload,
    })
    assert.equal(denied.status, 403)
    checks.push({ name: 'cross_tenant_or_non_enterprise_returns_403', status: 'PASS', detail: String(denied.json.detail ?? '403') })
  } else {
    checks.push({ name: 'cross_tenant_or_non_enterprise_returns_403', status: 'SKIPPED', detail: 'blocked admin session unavailable' })
  }

  const created = await apiJson<{
    analysis: { id: string; engine_output: { selectedCode: null; releasedCode: null; finalConclusion: null } }
    revision: { revision_number: number }
    idempotent: boolean
  }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: payload,
  })
  assert.equal(created.status, 201)
  assert.equal(created.json.idempotent, false)
  assert.equal(created.json.analysis.engine_output.selectedCode, null)
  assert.equal(created.json.analysis.engine_output.releasedCode, null)
  assert.equal(created.json.analysis.engine_output.finalConclusion, null)
  checks.push({ name: 'create_returns_201_and_non_final_locks', status: 'PASS', detail: `rev=${created.json.revision.revision_number}` })

  const analysisId = created.json.analysis.id

  const idempotent = await apiJson<{ idempotent: boolean }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: payload,
  })
  assert.equal(idempotent.status, 200)
  assert.equal(idempotent.json.idempotent, true)
  checks.push({ name: 'idempotent_replay_returns_200', status: 'PASS', detail: 'same clientRequestId + same payload' })

  const divergent = await apiJson<{ detail?: string }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterprise.accessToken,
    body: { ...payload, title: `${payload.title} divergent` },
  })
  assert.equal(divergent.status, 409)
  checks.push({ name: 'divergent_duplicate_returns_409', status: 'PASS', detail: String(divergent.json.detail ?? '409') })

  const list = await apiJson<{ items: Array<Record<string, unknown>>; total: number }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses?page=1&pageSize=20',
    token: enterprise.accessToken,
  })
  assert.equal(list.status, 200)
  assert.ok(Array.isArray(list.json.items))
  assert.equal(Object.prototype.hasOwnProperty.call(list.json.items[0] ?? {}, 'narrative'), false)
  checks.push({ name: 'list_returns_summary_without_narrative', status: 'PASS', detail: `items=${list.json.items.length} total=${list.json.total}` })

  const detail = await apiJson<{ analysis: { id: string }; revisions: unknown[]; reviews: unknown[]; events: unknown[] }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}`,
    token: enterprise.accessToken,
  })
  assert.equal(detail.status, 200)
  assert.equal(detail.json.analysis.id, analysisId)
  checks.push({ name: 'detail_returns_full_record', status: 'PASS', detail: `events=${detail.json.events.length}` })

  const review = await apiJson<{ status: string; reviewStatus: string }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/reviews`,
    method: 'POST',
    token: enterprise.accessToken,
    body: {
      decision: 'RETURN_FOR_REANALYSIS',
      evidenceSufficiency: 'INSUFFICIENT',
      reviewNotes: 'API real trial requesting reanalysis.',
      requiresMoreEvidence: true,
    },
  })
  assert.equal(review.status, 201)
  assert.equal(review.json.status, 'RETURNED_FOR_REANALYSIS')
  checks.push({ name: 'review_submitted', status: 'PASS', detail: `${review.json.status}/${review.json.reviewStatus}` })

  const reanalyze = await apiJson<{ analysis: { status: string; current_revision: number }; revision: { revision_number: number } }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/reanalyze`,
    method: 'POST',
    token: enterprise.accessToken,
    body: { reason: 'api-real-trial' },
  })
  assert.equal(reanalyze.status, 200)
  assert.equal(reanalyze.json.revision.revision_number, 2)
  assert.equal(reanalyze.json.analysis.status, 'CANDIDATE_ANALYSIS_CREATED')
  checks.push({ name: 'reanalyze_creates_revision_2', status: 'PASS', detail: `rev=${reanalyze.json.revision.revision_number}` })

  const archive = await apiJson<{ analysis: { status: string } }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/archive`,
    method: 'POST',
    token: enterprise.accessToken,
  })
  assert.equal(archive.status, 200)
  assert.equal(archive.json.analysis.status, 'ARCHIVED')
  checks.push({ name: 'archive_sets_archived_status', status: 'PASS', detail: archive.json.analysis.status })

  const restore = await apiJson<{ analysis: { status: string } }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/restore`,
    method: 'POST',
    token: enterprise.accessToken,
  })
  assert.equal(restore.status, 200)
  assert.equal(restore.json.analysis.status, 'CANDIDATE_ANALYSIS_CREATED')
  checks.push({ name: 'restore_returns_non_archived_status', status: 'PASS', detail: restore.json.analysis.status })

  const exported = await apiJson<{
    markers: string[]
    analysis: { narrative: string }
    candidateOutput: { selectedCode: null; releasedCode: null; finalConclusion: null }
    auditSummary: Array<Record<string, unknown>>
  }>({
    baseUrl,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/export`,
    token: enterprise.accessToken,
  })
  assert.equal(exported.status, 200)
  assert.deepEqual(exported.json.markers, ['INTERNAL', 'NON_FINAL', 'NOT_OPERATIONAL'])
  assert.equal(exported.json.analysis.narrative, '[REDACTED_IN_EXPORT_SUMMARY]')
  assert.equal(exported.json.candidateOutput.selectedCode, null)
  assert.equal(exported.json.candidateOutput.releasedCode, null)
  assert.equal(exported.json.candidateOutput.finalConclusion, null)
  checks.push({ name: 'export_returns_internal_non_final_payload', status: 'PASS', detail: `audit=${exported.json.auditSummary.length}` })

  const dbState = await fetchProductBetaDbState(enterprise.tenantId, analysisId)
  const eventCounts = eventCountByType(dbState.events)
  for (const requiredEvent of ['analysis.created', 'analysis.viewed', 'analysis.review_started', 'analysis.returned', 'analysis.reanalysis_requested', 'analysis.reanalyzed', 'analysis.archived', 'analysis.restored', 'analysis.exported']) {
    assert.ok(eventCounts[requiredEvent] >= 1, `missing ${requiredEvent}`)
  }
  checks.push({ name: 'audit_events_recorded', status: 'PASS', detail: JSON.stringify(eventCounts) })

  const flagOffBaseUrl = process.env.SERA_VNEXT_TEST_FLAG_OFF_BASE_URL?.trim()
  if (flagOffBaseUrl) {
    const disabled = await apiJson<{ detail?: string }>({
      baseUrl: flagOffBaseUrl,
      path: '/api/admin/sera-vnext/analyses',
      token: enterprise.accessToken,
    })
    assert.equal(disabled.status, 404)
    checks.push({ name: 'flag_off_returns_404', status: 'PASS', detail: String(disabled.json.detail ?? '404') })
  } else {
    checks.push({ name: 'flag_off_returns_404', status: 'SKIPPED', detail: 'set SERA_VNEXT_TEST_FLAG_OFF_BASE_URL to validate over HTTP' })
  }

  const report: TrialReport = {
    trialId: TRIAL_ID,
    baseUrl,
    participantId: enterprise.participantId,
    blockedParticipantId,
    analysisIdSanitized: sanitizeId(analysisId),
    checks,
    summary: {
      tenantIdSanitized: sanitizeId(enterprise.tenantId),
      authUserIdSanitized: sanitizeId(enterprise.authUserId),
      publicUserIdSanitized: sanitizeId(enterprise.publicUserId),
      createLatencyMs: created.durationMs,
      reviewLatencyMs: review.durationMs,
      reanalyzeLatencyMs: reanalyze.durationMs,
      exportLatencyMs: exported.durationMs,
      eventCounts,
      revisions: dbState.revisions.length,
      reviews: dbState.reviews.length,
    },
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)

  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('PRODUCT_BETA_API_REAL_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
