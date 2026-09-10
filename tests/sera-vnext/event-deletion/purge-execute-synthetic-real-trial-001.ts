import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
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

const TRIAL_ID = 'purge-execute-synthetic-real-trial-001'
const PREFIX = '[EVENT_DELETE_TEST]'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

async function main() {
  // Safety guard: must be called before any mutation
  assertSafeTestEnvironment({ requiresFixtureIds: true })

  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)
  const { admin } = createSupabaseClients()
  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'EVENT-PURGE-ADMIN',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })
  assert.ok(enterprise.publicUserId)

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const title = `${PREFIX} purge ${suffix}`
  const storagePath = `${enterprise.publicUserId}/event-delete-tests/purge-${suffix}.pdf`

  const upload = await admin.storage.from('analysis-documents').upload(
    storagePath,
    new TextEncoder().encode('%PDF-1.4\n% synthetic purge fixture\n%%EOF'),
    { contentType: 'application/pdf', upsert: false },
  )
  if (upload.error) throw upload.error

  const event = await admin.from('events').insert({
    tenant_id: enterprise.tenantId,
    submitted_by: enterprise.publicUserId,
    title,
    raw_input: 'Synthetic purge fixture with no human or production data.',
    input_type: 'text',
    status: 'completed',
  }).select('id').single()
  if (event.error) throw event.error
  const eventId = String(event.data.id)

  const analysis = await admin.from('analyses').insert({
    event_id: eventId,
    tenant_id: enterprise.tenantId,
    event_summary: 'Synthetic purge fixture',
    perception_code: 'P-A',
    objective_code: 'O-A',
    action_code: 'A-A',
    source_file_url: `analysis-documents/${storagePath}`,
  }).select('id').single()
  if (analysis.error) throw analysis.error

  const closedAction = await admin.from('corrective_actions').insert({
    analysis_id: analysis.data.id,
    tenant_id: enterprise.tenantId,
    title: `${PREFIX} preserved closed action`,
    status: 'completed',
    completed_at: new Date().toISOString(),
  }).select('id').single()
  if (closedAction.error) throw closedAction.error

  const deleted = await apiJson({
    baseUrl,
    path: `/api/events/${eventId}/delete-request`,
    method: 'POST',
    token: enterprise.accessToken,
    body: { reason: 'synthetic purge validation', confirmationTitle: title },
  })
  assert.equal(deleted.status, 200)

  const expire = await admin.from('events').update({
    recoverable_until: new Date(Date.now() - 60_000).toISOString(),
  }).eq('id', eventId).eq('tenant_id', enterprise.tenantId)
  if (expire.error) throw expire.error

  const purge = await apiJson<{
    mode: string
    result: { status: string; tombstone_id: string }
  }>({
    baseUrl,
    path: `/api/events/${eventId}/purge`,
    method: 'POST',
    token: enterprise.accessToken,
    body: {
      mode: 'EXECUTE_SYNTHETIC',
      secondaryConfirmation: 'PURGE_SYNTHETIC_FIXTURE_ONLY',
    },
  })
  assert.equal(purge.status, 200, JSON.stringify(purge.json))
  assert.equal(purge.json.mode, 'PURGE_EXECUTE_SYNTHETIC')
  assert.equal(purge.json.result.status, 'PURGED')

  const [eventState, analysisState, actionState, tombstone, lifecycle, storageList, activeDetail, deletedDetail] = await Promise.all([
    admin.from('events').select('title, raw_input, deletion_status, purged_at').eq('id', eventId).single(),
    admin.from('analyses').select('event_summary, source_file_url, raw_llm_output').eq('id', analysis.data.id).single(),
    admin.from('corrective_actions').select('id, status, analysis_id').eq('id', closedAction.data.id).single(),
    admin.from('event_deletion_tombstones').select('id, status, event_title_hash').eq('tenant_id', enterprise.tenantId).eq('event_id_original', eventId).single(),
    admin.from('event_deletion_events').select('event_status').eq('tenant_id', enterprise.tenantId).eq('event_id', eventId),
    admin.storage.from('analysis-documents').list(`${enterprise.publicUserId}/event-delete-tests`, { search: `purge-${suffix}.pdf` }),
    apiJson({ baseUrl, path: `/api/events/${eventId}`, token: enterprise.accessToken }),
    apiJson({ baseUrl, path: `/api/events/${eventId}?scope=deleted`, token: enterprise.accessToken }),
  ])

  if (eventState.error || analysisState.error || actionState.error || tombstone.error || lifecycle.error || storageList.error) {
    throw new Error('synthetic purge verification query failed')
  }
  assert.equal(eventState.data.deletion_status, 'PURGED')
  assert.equal(eventState.data.title, '[PURGED SYNTHETIC FIXTURE]')
  assert.equal(analysisState.data.source_file_url, null)
  assert.equal(actionState.data.status, 'completed')
  assert.equal(tombstone.data.status, 'PURGED')
  assert.ok(tombstone.data.event_title_hash.length >= 64)
  assert.ok(lifecycle.data.some((row: { event_status: string }) => row.event_status === 'PURGE_STARTED'))
  assert.ok(lifecycle.data.some((row: { event_status: string }) => row.event_status === 'PURGED'))
  assert.equal((storageList.data ?? []).some((item: { name: string }) => item.name === `purge-${suffix}.pdf`), false)
  assert.equal(activeDetail.status, 404)
  assert.equal(deletedDetail.status, 404)

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    eventIdSanitized: sanitizeId(eventId),
    tombstoneIdSanitized: sanitizeId(tombstone.data.id),
    checks: [
      { name: '19-purge-execute-synthetic-real', status: 'PASS', detail: 'synthetic-only API gate executed' },
      { name: '20-purge-storage-real', status: 'PASS', detail: 'storage object removed and absence confirmed' },
      { name: '21-tombstone-real', status: 'PASS', detail: 'minimal final tombstone persisted' },
      { name: 'corrective-action-closed-preserved', status: 'PASS', detail: sanitizeId(actionState.data.id) },
      { name: 'purged-api-hidden', status: 'PASS', detail: 'active and deleted detail return 404' },
    ],
  }
  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
