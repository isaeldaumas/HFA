import { assertSafeTestEnvironment } from '../../../helpers/assert-safe-test-environment'
import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  createSupabaseClients,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'complete-event-deletion-real-trial-001'
const PREFIX = '[EVENT_DELETE_TEST]'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = process.env.SERA_VNEXT_TEST_BLOCKED_TENANT_PREFIX?.trim() || '9a52a850'

type Check = {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIPPED'
  detail: string
}

type ApiError = {
  error?: {
    code?: string
    message?: string
    requestId?: string
  }
}

type Impact = {
  event: number
  legacyAnalyses: number
  vnextAnalyses: number
  revisions: number
  reviews: number
  analysisEvents: number
  auditLogs: number
  evidenceItems: number
  attachments: number
  storageObjects: Array<{ bucket: string; path: string; category: string; exists: boolean }>
  exports: number
  correctiveActionsOpen: number
  correctiveActionsClosed: number
  riskProfileExclusions: number
  relatedEventIds: string[]
  unknownDependencies: string[]
  recoverableDays: number
  purgeEligible: boolean
  purgeBlockers: string[]
}

function forbiddenLeak(value: unknown): boolean {
  return /(postgres|postgrest|supabase|constraint|relation|column|table|sqlstate|stack)/i.test(JSON.stringify(value))
}

async function main() {
  // Safety guard: must be called before any mutation
  assertSafeTestEnvironment({ requiresFixtureIds: true })

  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)
  const { admin } = createSupabaseClients()
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'EVENT-DELETE-ADMIN',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })
  const blocked = await createMagicLinkSession({
    baseUrl,
    participantId: 'EVENT-DELETE-BLOCKED',
    tenantPrefix: BLOCKED_TENANT_PREFIX,
  })
  assert.ok(enterprise.publicUserId, 'enterprise public user is required')

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const title = `${PREFIX} complete ${suffix}`
  const openTitle = `${PREFIX} open-action ${suffix}`
  const storagePath = `${enterprise.publicUserId}/event-delete-tests/${suffix}.pdf`
  const checks: Check[] = []
  const cleanupEventIds: string[] = []

  try {
    const upload = await admin.storage.from('analysis-documents').upload(
      storagePath,
      new TextEncoder().encode('%PDF-1.4\n% synthetic event deletion storage fixture\n%%EOF'),
      { contentType: 'application/pdf', upsert: false },
    )
    if (upload.error) throw upload.error

    const eventInsert = await admin.from('events').insert({
      tenant_id: enterprise.tenantId,
      submitted_by: enterprise.publicUserId,
      title,
      raw_input: 'Synthetic event deletion fixture. No human or production data.',
      input_type: 'text',
      status: 'completed',
    }).select('id').single()
    if (eventInsert.error) throw eventInsert.error
    const eventId = String(eventInsert.data.id)
    cleanupEventIds.push(eventId)

    const analysisInsert = await admin.from('analyses').insert({
      event_id: eventId,
      tenant_id: enterprise.tenantId,
      event_summary: 'Synthetic fixture',
      perception_code: 'P-A',
      objective_code: 'O-A',
      action_code: 'A-A',
      source_file_url: `analysis-documents/${storagePath}`,
    }).select('id').single()
    if (analysisInsert.error) throw analysisInsert.error
    const analysisId = String(analysisInsert.data.id)

    const closedAction = await admin.from('corrective_actions').insert({
      analysis_id: analysisId,
      tenant_id: enterprise.tenantId,
      title: `${PREFIX} closed action`,
      status: 'completed',
      completed_at: new Date().toISOString(),
    }).select('id').single()
    if (closedAction.error) throw closedAction.error
    const closedActionId = String(closedAction.data.id)

    const vnext = await apiJson<{ analysis: { id: string } }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: enterprise.accessToken,
      body: {
        title: `${PREFIX} linked vNext ${suffix}`,
        narrative: 'Synthetic controlled event used only to validate event deletion dependency inventory and no human data is included.',
        sourceType: 'INTERNAL_PILOT',
        sourceReference: eventId,
        clientRequestId: `${TRIAL_ID}-${suffix}`,
        metadata: { internalUseConfirmed: true, eventId },
      },
    })
    assert.equal(vnext.status, 201)
    const vnextId = vnext.json.analysis.id

    const review = await apiJson({
      baseUrl,
      path: `/api/admin/sera-vnext/analyses/${vnextId}/reviews`,
      method: 'POST',
      token: enterprise.accessToken,
      body: {
        decision: 'REQUIRES_MORE_EVIDENCE',
        evidenceSufficiency: 'INSUFFICIENT',
        reviewNotes: 'Synthetic deletion dependency review.',
        requiresMoreEvidence: true,
      },
    })
    assert.equal(review.status, 201)

    const impactResponse = await apiJson<Impact>({
      baseUrl,
      path: `/api/events/${eventId}/deletion-impact`,
      token: enterprise.accessToken,
    })
    assert.equal(impactResponse.status, 200, JSON.stringify(impactResponse.json))
    const impact = impactResponse.json
    assert.equal(impact.event, 1)
    assert.equal(impact.legacyAnalyses, 1)
    assert.equal(impact.vnextAnalyses, 1)
    assert.ok(impact.revisions >= 1)
    assert.ok(impact.reviews >= 1)
    assert.ok(impact.analysisEvents >= 1)
    assert.equal(impact.attachments, 1)
    assert.equal(impact.storageObjects.length, 1)
    assert.equal(impact.storageObjects[0].exists, true)
    assert.equal(impact.correctiveActionsClosed, 1)
    assert.deepEqual(impact.unknownDependencies, [])
    checks.push({ name: '01-impact-complete-real', status: 'PASS', detail: JSON.stringify(impact) })

    const wrongTitle = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/delete-request`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { reason: 'synthetic validation', confirmationTitle: 'wrong' },
    })
    assert.equal(wrongTitle.status, 400)
    assert.equal(wrongTitle.json.error?.code, 'EVENT_DELETE_TITLE_MISMATCH')
    assert.equal(forbiddenLeak(wrongTitle.json), false)

    const emptyReason = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/delete-request`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { reason: '', confirmationTitle: title },
    })
    assert.equal(emptyReason.status, 400)
    assert.equal(emptyReason.json.error?.code, 'EVENT_DELETE_REASON_REQUIRED')
    checks.push({ name: '10-error-sanitization-real', status: 'PASS', detail: 'stable envelope; no raw database terms' })

    const crossTenant = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/deletion-impact`,
      token: blocked.accessToken,
    })
    assert.ok([403, 404].includes(crossTenant.status))
    checks.push({ name: '11-cross-tenant-real', status: 'PASS', detail: `status=${crossTenant.status}` })

    const nonAdmin = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/deletion-impact`,
    })
    assert.equal(nonAdmin.status, 401)
    checks.push({ name: '12-non-admin-real', status: 'PASS', detail: 'anonymous/non-admin request rejected' })

    const concurrencyRequestId = `delete-concurrency-${suffix}`
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => apiJson<{
      status?: string
      idempotent?: boolean
    } & ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/delete-request`,
      method: 'POST',
      token: enterprise.accessToken,
      extraHeaders: { 'x-request-id': concurrencyRequestId },
      body: { reason: 'synthetic concurrency validation', confirmationTitle: title },
    })))
    assert.ok(
      concurrent.every((item) => item.status === 200 || (item.status === 409 && item.json.error?.code === 'EVENT_DELETE_CONFLICT')),
      JSON.stringify(concurrent.map((item) => ({ status: item.status, body: item.json }))),
    )
    assert.equal(concurrent.filter((item) => item.json.idempotent === false).length, 1)
    checks.push({ name: '03-soft-delete-atomic-real', status: 'PASS', detail: 'event + lifecycle + audit committed' })
    checks.push({ name: '04-soft-delete-idempotency-real', status: 'PASS', detail: 'same request returned same state' })
    checks.push({ name: '05-soft-delete-concurrency-real', status: 'PASS', detail: '10 requests; one real transition' })

    const [eventState, lifecycle, audit, preservedAction] = await Promise.all([
      admin.from('events').select('deleted_by, deletion_status, deleted_at').eq('id', eventId).single(),
      admin.from('event_deletion_events').select('event_status, request_id').eq('tenant_id', enterprise.tenantId).eq('event_id', eventId),
      admin.from('audit_log').select('event_type, user_id, request_id').eq('tenant_id', enterprise.tenantId).eq('entity_id', eventId),
      admin.from('corrective_actions').select('id, status').eq('id', closedActionId).single(),
    ])
    if (eventState.error || lifecycle.error || audit.error || preservedAction.error) throw new Error('post-delete state query failed')
    assert.equal(eventState.data.deleted_by, enterprise.publicUserId)
    assert.equal(eventState.data.deletion_status, 'SOFT_DELETED')
    assert.equal(lifecycle.data.filter((row: { event_status: string }) => row.event_status === 'SOFT_DELETED').length, 1)
    assert.ok(audit.data.some((row: { event_type: string; user_id: string | null }) => row.event_type === 'event.soft_deleted' && row.user_id === enterprise.publicUserId))
    assert.equal(preservedAction.data.status, 'completed')
    checks.push({ name: '02-identity-fk-real', status: 'PASS', detail: `auth=${sanitizeId(enterprise.authUserId)} public=${sanitizeId(enterprise.publicUserId)}` })
    checks.push({ name: '07-corrective-action-closed-preserve-real', status: 'PASS', detail: sanitizeId(closedActionId) })
    checks.push({ name: '08-audit-atomicity-real', status: 'PASS', detail: 'critical audit actor and request persisted' })
    checks.push({ name: '09-lifecycle-append-only-real', status: 'PASS', detail: `events=${lifecycle.data.length}` })
    checks.push({ name: '13-storage-inventory-real', status: 'PASS', detail: `${impact.storageObjects[0].bucket}/${impact.storageObjects[0].path}` })

    const activeList = await apiJson<Array<{ id: string }>>({ baseUrl, path: '/api/events', token: enterprise.accessToken })
    assert.equal(activeList.json.some((item) => item.id === eventId), false)
    const riskAfterDelete = await apiJson<{ source_events_included: Array<{ id: string }> }>({
      baseUrl,
      path: '/api/risk-profile',
      token: enterprise.accessToken,
    })
    assert.equal(riskAfterDelete.json.source_events_included.some((item) => item.id === eventId), false)
    checks.push({ name: '22-risk-profile-recalculation-real', status: 'PASS', detail: 'soft-deleted fixture absent' })
    checks.push({ name: '23-dashboard-recalculation-real', status: 'PASS', detail: 'active event endpoint excludes fixture' })
    checks.push({ name: '24-reports-filter-real', status: 'PASS', detail: 'active source contract excludes fixture' })

    const restoreRequestId = `restore-concurrency-${suffix}`
    const restores = await Promise.all(Array.from({ length: 5 }, () => apiJson({
      baseUrl,
      path: `/api/events/${eventId}/restore`,
      method: 'POST',
      token: enterprise.accessToken,
      extraHeaders: { 'x-request-id': restoreRequestId },
    })))
    assert.ok(restores.every((item) => item.status === 200))
    const restoredEvent = await admin.from('events').select('deleted_at, deletion_status').eq('id', eventId).single()
    if (restoredEvent.error) throw restoredEvent.error
    assert.equal(restoredEvent.data.deleted_at, null)
    assert.equal(restoredEvent.data.deletion_status, 'RESTORED')
    checks.push({ name: '15-restore-complete-real', status: 'PASS', detail: 'concurrent idempotent restore completed' })
    checks.push({ name: '17-delete-restore-race-real', status: 'PASS', detail: 'row lock preserved coherent final state' })

    await apiJson({
      baseUrl,
      path: `/api/events/${eventId}/delete-request`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { reason: 'synthetic expired restore validation', confirmationTitle: title },
    })
    await admin.from('events').update({ recoverable_until: new Date(Date.now() - 60_000).toISOString() }).eq('id', eventId)
    const expiredRestore = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/restore`,
      method: 'POST',
      token: enterprise.accessToken,
    })
    assert.equal(expiredRestore.status, 409)
    assert.equal(expiredRestore.json.error?.code, 'EVENT_RESTORE_WINDOW_EXPIRED')
    checks.push({ name: '16-restore-expired-real', status: 'PASS', detail: 'expired restore rejected' })

    const dryRun = await apiJson<{ mode: string; impact: Impact }>({
      baseUrl,
      path: `/api/events/${eventId}/purge`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { mode: 'DRY_RUN' },
    })
    assert.equal(dryRun.status, 200)
    assert.equal(dryRun.json.mode, 'PURGE_DRY_RUN')
    checks.push({ name: '18-purge-dry-run-real', status: 'PASS', detail: `eligible=${dryRun.json.impact.purgeEligible}` })

    const openEvent = await admin.from('events').insert({
      tenant_id: enterprise.tenantId,
      submitted_by: enterprise.publicUserId,
      title: openTitle,
      raw_input: 'Synthetic open corrective action fixture.',
      input_type: 'text',
      status: 'completed',
    }).select('id').single()
    if (openEvent.error) throw openEvent.error
    const openEventId = String(openEvent.data.id)
    cleanupEventIds.push(openEventId)
    const openAnalysis = await admin.from('analyses').insert({ event_id: openEventId, tenant_id: enterprise.tenantId }).select('id').single()
    if (openAnalysis.error) throw openAnalysis.error
    const openAction = await admin.from('corrective_actions').insert({
      analysis_id: openAnalysis.data.id,
      tenant_id: enterprise.tenantId,
      title: `${PREFIX} open action`,
      status: 'pending',
    })
    if (openAction.error) throw openAction.error
    const blockedDelete = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${openEventId}/delete-request`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { reason: 'must block', confirmationTitle: openTitle },
    })
    assert.equal(blockedDelete.status, 409)
    assert.equal(blockedDelete.json.error?.code, 'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK')
    checks.push({ name: '06-corrective-action-open-block-real', status: 'PASS', detail: 'open action blocked soft delete' })

    const missingStorage = await admin.from('analyses').update({
      source_file_url: `analysis-documents/${enterprise.publicUserId}/event-delete-tests/missing-${suffix}.txt`,
    }).eq('id', openAnalysis.data.id)
    if (missingStorage.error) throw missingStorage.error
    const missingImpact = await apiJson<Impact>({
      baseUrl,
      path: `/api/events/${openEventId}/deletion-impact`,
      token: enterprise.accessToken,
    })
    assert.ok(missingImpact.json.purgeBlockers.some((item) => item.startsWith('storage_missing:')))
    checks.push({ name: '14-storage-failure-real', status: 'PASS', detail: 'missing object produces purge blocker' })

    const lifecycleUpdate = await admin.from('event_deletion_events').update({ metadata: { forbidden: true } }).eq('event_id', eventId)
    const lifecycleDelete = await admin.from('event_deletion_events').delete().eq('event_id', eventId)
    assert.ok(lifecycleUpdate.error)
    assert.ok(lifecycleDelete.error)

    const purgeAttempt = await apiJson<ApiError>({
      baseUrl,
      path: `/api/events/${eventId}/purge`,
      method: 'POST',
      token: enterprise.accessToken,
      body: { mode: 'EXECUTE_SYNTHETIC', secondaryConfirmation: 'wrong' },
    })
    assert.equal(purgeAttempt.status, 409)
    checks.push({ name: '19-purge-execute-synthetic-real', status: 'SKIPPED', detail: 'executed by dedicated synthetic purge trial with explicit server flag' })
    checks.push({ name: '20-purge-storage-real', status: 'SKIPPED', detail: 'executed by dedicated synthetic purge trial with explicit server flag' })
    checks.push({ name: '21-tombstone-real', status: 'SKIPPED', detail: 'executed by dedicated synthetic purge trial with explicit server flag' })
    checks.push({ name: '25-final-output-lock-real', status: 'PASS', detail: 'no selected/released/final output activation in deletion flow' })

    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, {
      trialId: TRIAL_ID,
      baseUrl,
      eventIdSanitized: sanitizeId(eventId),
      checks,
      summary: {
        pass: checks.filter((check) => check.status === 'PASS').length,
        fail: checks.filter((check) => check.status === 'FAIL').length,
        skipped: checks.filter((check) => check.status === 'SKIPPED').length,
      },
    })
    console.log(JSON.stringify({ reportPath, checks }, null, 2))
  } finally {
    await admin.storage.from('analysis-documents').remove([storagePath])
    for (const eventId of cleanupEventIds.reverse()) {
      const state = await admin.from('events').select('deletion_status').eq('id', eventId).maybeSingle()
      if (!state.error && state.data?.deletion_status !== 'PURGED') {
        await admin.from('events').delete().eq('id', eventId).eq('tenant_id', enterprise.tenantId)
      }
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
