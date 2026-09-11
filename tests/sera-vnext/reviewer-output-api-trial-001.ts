import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'reviewer-output-api-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()

type ApiCheck = { name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterprise = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: ApiCheck[] = []
  let analysisId: string | null = null

  function check(name: string, fn: () => void) {
    try {
      fn()
      checks.push({ name, status: 'PASS', detail: 'ok' })
    } catch (err) {
      checks.push({ name, status: 'FAIL', detail: String(err) })
    }
  }

  // Create analysis
  const createRes = await apiJson({
    baseUrl,
    token: enterprise.accessToken,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    body: {
      title: `[SERA_VNEXT_REVIEWER_UTILITY_RERUN] API trial — ${TRIAL_ID}`,
      narrative: 'Durante a aproximação ILS o copiloto não monitorou a altitude após o FAF, resultando em desvio de perfil que só foi corrigido após o ativamento do GPWS. O comandante demorou 8 segundos para assumir os controles.',
      sourceType: 'INTERNAL_PILOT',
      clientRequestId: `${TRIAL_ID}-create`,
    },
  })

  if (createRes.status === 201 || createRes.status === 200) {
    const body = createRes.json as Record<string, unknown>
    analysisId = (body.analysis as Record<string, unknown>)?.id as string ?? null
    check('analysis_created', () => {
      assert.ok(analysisId, 'analysis id must exist')
    })
  } else {
    checks.push({ name: 'analysis_created', status: 'FAIL', detail: `HTTP ${createRes.status}: ${JSON.stringify(createRes.json)}` })
  }

  if (!analysisId) {
    checks.push({ name: 'all_subsequent_checks', status: 'SKIPPED', detail: 'analysis creation failed' })
    writeJsonReport(TRIAL_ID, { checks, status: 'REVIEWER_OUTPUT_API_BLOCKED_BY_CREATE_FAILURE' })
    process.exit(1)
  }

  // GET detail — check reviewerOutput
  const detailRes = await apiJson({
    baseUrl,
    token: enterprise.accessToken,
    path: `/api/admin/sera-vnext/analyses/${analysisId}`,
  })
  check('detail_ok', () => assert.equal(detailRes.status, 200))

  const detail = detailRes.json as Record<string, unknown>

  check('reviewer_output_in_detail', () => {
    assert.ok(detail.reviewerOutput, 'reviewerOutput must exist in detail response')
  })

  const ro = detail.reviewerOutput as Record<string, unknown> | undefined

  check('reviewer_output_summary', () => {
    const summary = ro?.summary as Record<string, unknown> | undefined
    assert.ok(summary?.headline, 'summary.headline must exist')
    assert.ok(summary?.nonFinalNotice, 'summary.nonFinalNotice must exist')
  })

  check('reviewer_output_escape_point', () => {
    const ep = ro?.escapePointReview as Record<string, unknown> | undefined
    assert.ok(ep, 'escapePointReview must exist')
    assert.ok(typeof ep?.reviewerQuestion === 'string', 'reviewerQuestion must be a string')
    assert.ok(Array.isArray(ep?.supportingEvidence), 'supportingEvidence must be array')
    assert.ok(Array.isArray(ep?.reviewerOptions), 'reviewerOptions must be array')
  })

  check('reviewer_output_axis_reviews', () => {
    const axisReviews = ro?.axisReviews as Record<string, unknown> | undefined
    assert.ok(axisReviews?.perception, 'perception axis card must exist')
    assert.ok(axisReviews?.objective, 'objective axis card must exist')
    assert.ok(axisReviews?.action, 'action axis card must exist')
  })

  check('reviewer_output_perception_has_fields', () => {
    const p = (ro?.axisReviews as Record<string, Record<string, unknown>> | undefined)?.perception
    assert.ok(p, 'perception card must exist')
    assert.ok(typeof p?.plainLanguageQuestion === 'string', 'perception must have plainLanguageQuestion')
    assert.ok(Array.isArray(p?.reviewerMustDecide), 'perception must have reviewerMustDecide')
    assert.ok(typeof p?.confidence === 'string', 'perception must have confidence label')
    assert.ok(Array.isArray(p?.whyCandidateWasSuggested), 'perception must have whyCandidateWasSuggested')
    assert.ok(Array.isArray(p?.alternativesConsidered), 'perception must have alternativesConsidered')
  })

  check('reviewer_output_preconditions', () => {
    const preconditions = ro?.preconditionReview as Record<string, unknown> | undefined
    assert.ok(preconditions, 'preconditionReview must exist')
    assert.ok(Array.isArray(preconditions?.cards), 'preconditionReview.cards must be array')
    assert.ok(Array.isArray(preconditions?.reviewerQuestions), 'preconditionReview.reviewerQuestions must be array')
  })

  check('reviewer_output_uncertainty', () => {
    const ur = ro?.uncertaintyReview as Record<string, unknown> | undefined
    assert.ok(ur, 'uncertaintyReview must exist')
    assert.ok(Array.isArray(ur?.uncertainties), 'uncertainties must be array')
    assert.ok(Array.isArray(ur?.unansweredQuestions), 'unansweredQuestions must be array')
  })

  check('reviewer_output_decision_guide', () => {
    const dg = ro?.humanDecisionGuide as Record<string, unknown> | undefined
    assert.ok(dg, 'humanDecisionGuide must exist')
    assert.ok(['ACCEPT_AS_WORKING_HYPOTHESIS', 'REJECT_WORKING_HYPOTHESIS', 'REQUIRES_MORE_EVIDENCE', 'RETURN_FOR_REANALYSIS'].includes(dg?.recommendedNextStep as string))
    assert.ok(Array.isArray(dg?.decisionChecklist) && (dg?.decisionChecklist as unknown[]).length >= 8)
  })

  check('engine_output_preserved', () => {
    const analysis = detail.analysis as Record<string, unknown> | undefined
    const engineOutput = analysis?.engine_output as Record<string, unknown> | undefined
    assert.ok(engineOutput, 'engine_output must be preserved')
    assert.equal(engineOutput?.selectedCode, null)
    assert.equal(engineOutput?.releasedCode, null)
    assert.equal(engineOutput?.finalConclusion, null)
    assert.equal(engineOutput?.classifiedOutput, false)
    assert.equal(engineOutput?.readyPromotion, false)
    assert.equal(engineOutput?.downstreamAllowed, false)
  })

  check('locks_intact', () => {
    const locks = detail.locks as Record<string, unknown> | undefined
    assert.equal(locks?.selectedCode, null)
    assert.equal(locks?.releasedCode, null)
    assert.equal(locks?.finalConclusion, null)
    assert.equal(locks?.classifiedOutput, false)
    assert.equal(locks?.humanReviewRequired, true)
  })

  // GET export — check reviewerOutput in export
  const exportRes = await apiJson({
    baseUrl,
    token: enterprise.accessToken,
    path: `/api/admin/sera-vnext/analyses/${analysisId}/export`,
  })
  check('export_ok', () => assert.equal(exportRes.status, 200))

  const exportBody = exportRes.json as Record<string, unknown>

  check('reviewer_output_in_export', () => {
    assert.ok(exportBody.reviewerOutput, 'reviewerOutput must exist in export response')
  })

  check('export_markers_present', () => {
    const markers = exportBody.markers as string[] | undefined
    assert.ok(Array.isArray(markers), 'markers must be array')
    assert.ok(markers?.includes('NON_FINAL'), 'export must include NON_FINAL marker')
    assert.ok(markers?.includes('INTERNAL'), 'export must include INTERNAL marker')
  })

  check('export_narrative_redacted', () => {
    const analysis = exportBody.analysis as Record<string, unknown> | undefined
    assert.equal(analysis?.narrative, '[REDACTED_IN_EXPORT_SUMMARY]')
  })

  check('export_candidate_output_preserved', () => {
    const candidateOutput = exportBody.candidateOutput as Record<string, unknown> | undefined
    assert.ok(candidateOutput, 'candidateOutput must exist')
    assert.equal(candidateOutput?.selectedCode, null)
    assert.equal(candidateOutput?.releasedCode, null)
    assert.equal(candidateOutput?.finalConclusion, null)
  })

  const pass = checks.filter((c) => c.status === 'PASS').length
  const fail = checks.filter((c) => c.status === 'FAIL').length

  const result = {
    trial: TRIAL_ID,
    analysisIdSanitized: analysisId ? sanitizeId(analysisId) : null,
    pass,
    fail,
    status: fail === 0 ? 'REVIEWER_OUTPUT_API_PASS' : 'REVIEWER_OUTPUT_API_FAIL',
    checks,
  }

  writeJsonReport(TRIAL_ID, result)
  console.log(JSON.stringify(result, null, 2))

  if (fail > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
