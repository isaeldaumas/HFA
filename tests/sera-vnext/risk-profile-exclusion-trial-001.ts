import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  createSupabaseClients,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'risk-profile-exclusion-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

type RiskProfileResponse = {
  included_events: number
  excluded_events: number
  perception_distribution: Array<{ code: string; count: number }>
  source_events_included: Array<{ id: string }>
  source_events_excluded: Array<{ id: string; exclusionId?: string | null }>
}

function findCount(items: Array<{ code: string; count: number }>, code: string): number {
  return items.find((item) => item.code === code)?.count ?? 0
}

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })
  const { admin } = createSupabaseClients()

  const title = `[RISK_PROFILE_TEST] exclusion ${Date.now()}`
  let eventId: string | null = null
  let analysisId: string | null = null
  let exclusionId: string | null = null

  try {
    const insertedEvent = await admin
      .from('events')
      .insert({
        tenant_id: enterprise.tenantId,
        submitted_by: enterprise.publicUserId ?? enterprise.authUserId,
        title,
        raw_input: '[RISK_PROFILE_TEST] synthetic event for exclusion/restore flow',
        input_type: 'text',
        status: 'completed',
      })
      .select('id')
      .single()
    if (insertedEvent.error || !insertedEvent.data) throw insertedEvent.error ?? new Error('event insert failed')
    eventId = insertedEvent.data.id as string

    const insertedAnalysis = await admin
      .from('analyses')
      .insert({
        event_id: eventId,
        tenant_id: enterprise.tenantId,
        event_summary: '[RISK_PROFILE_TEST] synthetic summary',
        perception_code: 'P-B',
        objective_code: 'O-D',
        action_code: 'A-I',
        preconditions: [{ code: 'P1' }],
        recommendations: [],
        conclusions: '[RISK_PROFILE_TEST] synthetic conclusion',
      })
      .select('id')
      .single()
    if (insertedAnalysis.error || !insertedAnalysis.data) throw insertedAnalysis.error ?? new Error('analysis insert failed')
    analysisId = insertedAnalysis.data.id as string

    const before = await apiJson<RiskProfileResponse>({
      baseUrl,
      path: '/api/risk-profile',
      token: enterprise.accessToken,
    })
    assert.equal(before.status, 200)
    const beforeIncluded = before.json.included_events
    const beforeExcluded = before.json.excluded_events
    const beforePB = findCount(before.json.perception_distribution, 'P-B')
    assert.ok(before.json.source_events_included.some((item) => item.id === eventId), 'synthetic event must appear as included before exclusion')

    const excluded = await apiJson<{ exclusion: { id: string } }>({
      baseUrl,
      path: '/api/risk-profile/exclusions',
      token: enterprise.accessToken,
      method: 'POST',
      body: {
        sourceType: 'legacy_event',
        sourceId: eventId,
        reason: 'temporary test exclusion',
      },
    })
    assert.equal(excluded.status, 201)
    exclusionId = excluded.json.exclusion.id

    const afterExclude = await apiJson<RiskProfileResponse>({
      baseUrl,
      path: '/api/risk-profile',
      token: enterprise.accessToken,
    })
    assert.equal(afterExclude.status, 200)
    assert.equal(afterExclude.json.included_events, beforeIncluded - 1)
    assert.equal(afterExclude.json.excluded_events, beforeExcluded + 1)
    assert.equal(findCount(afterExclude.json.perception_distribution, 'P-B'), Math.max(0, beforePB - 1))
    assert.ok(afterExclude.json.source_events_excluded.some((item) => item.id === eventId), 'synthetic event must move to excluded sources')

    const restored = await apiJson<{ restored: boolean }>({
      baseUrl,
      path: `/api/risk-profile/exclusions/${exclusionId}`,
      token: enterprise.accessToken,
      method: 'DELETE',
    })
    assert.equal(restored.status, 200)
    assert.equal(restored.json.restored, true)

    const afterRestore = await apiJson<RiskProfileResponse>({
      baseUrl,
      path: '/api/risk-profile',
      token: enterprise.accessToken,
    })
    assert.equal(afterRestore.status, 200)
    assert.equal(afterRestore.json.included_events, beforeIncluded)
    assert.equal(afterRestore.json.excluded_events, beforeExcluded)
    assert.equal(findCount(afterRestore.json.perception_distribution, 'P-B'), beforePB)
    assert.ok(afterRestore.json.source_events_included.some((item) => item.id === eventId), 'synthetic event must return to included sources')

    const report = {
      trialId: TRIAL_ID,
      tenantIdSanitized: sanitizeId(enterprise.tenantId),
      eventIdSanitized: sanitizeId(eventId),
      analysisIdSanitized: sanitizeId(analysisId),
      exclusionIdSanitized: sanitizeId(exclusionId),
      beforeIncluded,
      beforeExcluded,
      afterExcludedIncluded: afterExclude.json.included_events,
      afterRestoreIncluded: afterRestore.json.included_events,
      status: 'PASS',
    }
    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ ...report, reportPath }, null, 2))
  } finally {
    if (eventId) {
      await admin.from('risk_profile_exclusions').delete().eq('source_type', 'legacy_event').eq('source_id', eventId)
      await admin.from('events').delete().eq('id', eventId)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
