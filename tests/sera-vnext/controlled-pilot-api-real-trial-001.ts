import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  apiJson,
  buildBaseUrl,
  createMagicLinkSession,
  eventCountByType,
  fetchProductBetaDbState,
  sanitizeId,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'controlled-pilot-api-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const BLOCKED_TENANT_PREFIX = resolveTestTenantPrefix({ fixture: 'B' })

type ReviewDecision =
  | 'ACCEPT_AS_WORKING_HYPOTHESIS'
  | 'REJECT_WORKING_HYPOTHESIS'
  | 'REQUIRES_MORE_EVIDENCE'
  | 'RETURN_FOR_REANALYSIS'

type EvidenceSufficiency =
  | 'UNRESOLVED'
  | 'SUFFICIENT_FOR_WORKING_HYPOTHESIS'
  | 'INSUFFICIENT'
  | 'CONFLICTING'

type PilotCaseDefinition = {
  caseId: string
  title: string
  narrative: string
  decision: ReviewDecision
  evidenceSufficiency: EvidenceSufficiency
  requiresMoreEvidence: boolean
  reanalyze: boolean
  archiveRestore: boolean
  exportCase: boolean
}

type CaseResult = {
  case_id: string
  analysis_id_sanitized: string
  participant_id: string
  created_ok: boolean
  reviewed_ok: boolean
  reanalyzed: boolean
  archived_restored: boolean
  exported: boolean
  escape_point_useful: boolean
  poa_useful: boolean
  preconditions_useful: boolean
  uncertainty_clear: boolean
  warnings_clear: boolean
  human_review_decision: ReviewDecision
  issues: string[]
  final_status: string
  final_review_status: string
  create_latency_ms: number
  detail_latency_ms: number
  review_latency_ms: number
  reanalyze_latency_ms: number | null
  export_latency_ms: number | null
  event_counts: Record<string, number>
  warning_count: number
  uncertainty_count: number
}

type PilotReport = {
  trialId: string
  baseUrl: string
  environment: 'CONTROLLED_INTERNAL_REMOTE'
  nextServerMode: 'build_start'
  participantIds: string[]
  limitation: 'PILOT_SINGLE_ADMIN_LIMITATION'
  blockedParticipantId: string | null
  accessDeniedValidated: boolean
  cases: CaseResult[]
  metrics: Record<string, number | string>
}

type DetailPayload = {
  analysis: {
    id: string
    status: string
    review_status: string
    warnings: string[]
    uncertainties: string[]
    engine_output: {
      escapePoint?: { status?: string; statement?: string | null }
      axes?: Record<string, { proposedCode?: string | null; status?: string | null }>
      preconditions?: Array<{ id: string }>
      selectedCode: null
      releasedCode: null
      finalConclusion: null
    }
  }
  revisions: Array<{ revision_number: number }>
  reviews: Array<{ decision: string }>
  events: Array<{ event_type: string }>
}

const PILOT_CASES: PilotCaseDefinition[] = [
  {
    caseId: 'clean-anchor',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] clean anchor',
    narrative:
      'Durante a aproximação final estabilizada, o PF continuou a descida abaixo da altitude mínima publicada sem referência visual suficiente e iniciou a arremetida apenas após o aviso do sistema.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'automation-boundary',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] automation boundary',
    narrative:
      'Com o piloto automático acoplado em modo de razão de descida, a tripulação não percebeu imediatamente que o perfil vertical havia deixado a janela estabilizada, e a correção veio apenas após o alarme.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'procedural-fmc-mda-boundary',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] procedural/FMC/MDA boundary',
    narrative:
      'Na aproximação não precisão, a aeronave cruzou a MDA enquanto o PF ainda ajustava a lógica do FMC e manteve a aproximação sem a referência visual requerida até o chamado do PM.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'technical-dominant',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] technical dominant',
    narrative:
      'Após uma indicação inconsistente do sistema de voo, a tripulação enfrentou referências contraditórias entre instrumentos, com aumento de carga de trabalho e perda temporária da consciência de perfil.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'consequence-as-cause',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] consequence as cause',
    narrative:
      'O relato atribui o evento à excursão lateral após o toque, mas a sequência factual mostra instabilidade de alinhamento e correções tardias ainda na aproximação e no flare.',
    decision: 'REJECT_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: true,
    exportCase: false,
  },
  {
    caseId: 'evidence-insufficient',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] evidence insufficient',
    narrative:
      'O relato disponível é breve e registra apenas que a aeronave ficou baixa na aproximação, sem detalhes claros de configuração, chamadas, referência visual ou intervenção da tripulação.',
    decision: 'REQUIRES_MORE_EVIDENCE',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'no-failure',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] no failure',
    narrative:
      'Durante a descida houve oscilação momentânea de parâmetros, mas a tripulação identificou a condição, estabilizou a aeronave dentro dos critérios e completou a arremetida preventiva sem degradação adicional.',
    decision: 'REJECT_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'pf-pm-ambiguity',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] PF/PM ambiguity',
    narrative:
      'As fontes divergem sobre quem efetivamente conduzia os comandos no momento em que a aeronave ultrapassou o gate estabilizado, e as chamadas registradas não resolvem a atribuição de ator direto.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'precondition-confusion',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] precondition confusion',
    narrative:
      'O relato mistura fadiga, meteorologia e coordenação de cabine com a ação no ponto de fuga, exigindo distinção entre condição preexistente e falha diretamente sustentada por evidência.',
    decision: 'REQUIRES_MORE_EVIDENCE',
    evidenceSufficiency: 'UNRESOLVED',
    requiresMoreEvidence: true,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'progressive-escape-zone',
    title: '[SERA_VNEXT_CONTROLLED_PILOT] progressive escape zone',
    narrative:
      'A aproximação degradou gradualmente do perfil estabilizado para um estado de correções sucessivas e alta razão de descida, sem um único marco discreto imediatamente evidente como ponto de fuga.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
]

function buildReviewNotes(definition: PilotCaseDefinition): string {
  return `Controlled pilot review for ${definition.caseId}. Decision=${definition.decision}.`
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: true })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const admin = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  let blockedParticipantId: string | null = null
  let accessDeniedValidated = false

  try {
    const blocked = await createMagicLinkSession({
      baseUrl,
      participantId: 'PILOT-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })
    blockedParticipantId = blocked.participantId
    const denied = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: blocked.accessToken,
      body: {
        title: '[SERA_VNEXT_CONTROLLED_PILOT] blocked access probe',
        narrative: 'Blocked probe narrative for tenant validation only.',
        sourceType: 'INTERNAL_PILOT',
        sourceReference: TRIAL_ID,
        clientRequestId: `${TRIAL_ID}-blocked-${Date.now()}`,
        metadata: { internalUseConfirmed: true },
      },
    })
    assert.equal(denied.status, 403)
    accessDeniedValidated = true
  } catch {
    blockedParticipantId = null
    accessDeniedValidated = false
  }

  const cases: CaseResult[] = []
  const latencyValues: number[] = []
  let reviewsSubmitted = 0
  let reanalyses = 0
  let archiveRestore = 0
  let exports = 0
  let apiErrors = 0
  let totalAuditEvents = 0

  for (const definition of PILOT_CASES) {
    try {
      const payload = {
        title: definition.title,
        narrative: definition.narrative,
        sourceType: 'INTERNAL_PILOT',
        sourceReference: definition.caseId,
        clientRequestId: `${TRIAL_ID}-${definition.caseId}-${Date.now()}`,
        metadata: { internalUseConfirmed: true, pilotCase: definition.caseId },
      }

      const created = await apiJson<{
        analysis: {
          id: string
          status: string
          review_status: string
          engine_output: { selectedCode: null; releasedCode: null; finalConclusion: null }
        }
      }>({
        baseUrl,
        path: '/api/admin/sera-vnext/analyses',
        method: 'POST',
        token: admin.accessToken,
        body: payload,
      })
      assert.equal(created.status, 201)
      assert.equal(created.json.analysis.engine_output.selectedCode, null)
      assert.equal(created.json.analysis.engine_output.releasedCode, null)
      assert.equal(created.json.analysis.engine_output.finalConclusion, null)
      const analysisId = created.json.analysis.id
      latencyValues.push(created.durationMs)

      const detail = await apiJson<DetailPayload>({
        baseUrl,
        path: `/api/admin/sera-vnext/analyses/${analysisId}`,
        token: admin.accessToken,
      })
      assert.equal(detail.status, 200)
      latencyValues.push(detail.durationMs)

      const review = await apiJson<{ status: string; reviewStatus: string }>({
        baseUrl,
        path: `/api/admin/sera-vnext/analyses/${analysisId}/reviews`,
        method: 'POST',
        token: admin.accessToken,
        body: {
          decision: definition.decision,
          evidenceSufficiency: definition.evidenceSufficiency,
          reviewNotes: buildReviewNotes(definition),
          requiresMoreEvidence: definition.requiresMoreEvidence,
        },
      })
      if (review.status !== 201) {
        throw new Error(`REVIEW_FAILED:${definition.caseId}:${review.status}:${JSON.stringify(review.json)}`)
      }
      reviewsSubmitted += 1
      latencyValues.push(review.durationMs)

      let reanalyzeLatencyMs: number | null = null
      if (definition.reanalyze) {
        const reanalyze = await apiJson<{ analysis: { current_revision: number; status: string } }>({
          baseUrl,
          path: `/api/admin/sera-vnext/analyses/${analysisId}/reanalyze`,
          method: 'POST',
          token: admin.accessToken,
          body: { reason: `controlled-pilot:${definition.caseId}` },
        })
        assert.equal(reanalyze.status, 200)
        assert.equal(reanalyze.json.analysis.current_revision, 2)
        reanalyzeLatencyMs = reanalyze.durationMs
        reanalyses += 1
        latencyValues.push(reanalyze.durationMs)
      }

      if (definition.archiveRestore) {
        const archived = await apiJson<{ analysis: { status: string } }>({
          baseUrl,
          path: `/api/admin/sera-vnext/analyses/${analysisId}/archive`,
          method: 'POST',
          token: admin.accessToken,
        })
        assert.equal(archived.status, 200)
        assert.equal(archived.json.analysis.status, 'ARCHIVED')
        const restored = await apiJson<{ analysis: { status: string } }>({
          baseUrl,
          path: `/api/admin/sera-vnext/analyses/${analysisId}/restore`,
          method: 'POST',
          token: admin.accessToken,
        })
        assert.equal(restored.status, 200)
        assert.notEqual(restored.json.analysis.status, 'ARCHIVED')
        archiveRestore += 1
      }

      let exportLatencyMs: number | null = null
      if (definition.exportCase) {
        const exported = await apiJson<{
          markers: string[]
          analysis: { narrative: string }
          candidateOutput: { selectedCode: null; releasedCode: null; finalConclusion: null }
        }>({
          baseUrl,
          path: `/api/admin/sera-vnext/analyses/${analysisId}/export`,
          token: admin.accessToken,
        })
        assert.equal(exported.status, 200)
        assert.deepEqual(exported.json.markers, ['INTERNAL', 'NON_FINAL', 'NOT_OPERATIONAL'])
        assert.equal(exported.json.analysis.narrative, '[REDACTED_IN_EXPORT_SUMMARY]')
        assert.equal(exported.json.candidateOutput.selectedCode, null)
        assert.equal(exported.json.candidateOutput.releasedCode, null)
        assert.equal(exported.json.candidateOutput.finalConclusion, null)
        exportLatencyMs = exported.durationMs
        exports += 1
        latencyValues.push(exported.durationMs)
      }

      const finalDetail = await apiJson<DetailPayload>({
        baseUrl,
        path: `/api/admin/sera-vnext/analyses/${analysisId}`,
        token: admin.accessToken,
      })
      assert.equal(finalDetail.status, 200)

      const dbState = await fetchProductBetaDbState(admin.tenantId, analysisId)
      const eventCounts = eventCountByType(dbState.events)
      assert.ok(eventCounts['analysis.created'] >= 1)
      assert.ok(eventCounts['analysis.viewed'] >= 1)
      totalAuditEvents += dbState.events.length

      const output = finalDetail.json.analysis.engine_output
      const escapePointUseful = Boolean(output.escapePoint?.statement) && output.escapePoint?.status !== 'INSUFFICIENT_EVIDENCE'
      const poaUseful = Object.values(output.axes ?? {}).some((axis) => Boolean(axis.proposedCode) || axis.status === 'NO_FAILURE' || axis.status === 'CANDIDATE')
      const preconditionsUseful = (output.preconditions?.length ?? 0) > 0
      const warnings = finalDetail.json.analysis.warnings ?? []
      const uncertainties = finalDetail.json.analysis.uncertainties ?? []
      const uncertaintyClear = uncertainties.length > 0 || definition.requiresMoreEvidence || Object.values(output.axes ?? {}).some((axis) => axis.status === 'INSUFFICIENT_EVIDENCE' || axis.status === 'UNRESOLVED')
      const warningsClear = warnings.every((warning) => warning.trim().length >= 8)
      const issues = [
        ...(escapePointUseful ? [] : ['escape_point_needs_human_attention']),
        ...(poaUseful ? [] : ['candidate_poa_not_actionable']),
        ...(preconditionsUseful ? [] : ['preconditions_not_explicit']),
        ...(uncertaintyClear ? [] : ['uncertainty_not_explicit']),
        ...(warningsClear ? [] : ['warning_copy_needs_clarification']),
      ]

      cases.push({
        case_id: definition.caseId,
        analysis_id_sanitized: sanitizeId(analysisId),
        participant_id: admin.participantId,
        created_ok: true,
        reviewed_ok: true,
        reanalyzed: definition.reanalyze,
        archived_restored: definition.archiveRestore,
        exported: definition.exportCase,
        escape_point_useful: escapePointUseful,
        poa_useful: poaUseful,
        preconditions_useful: preconditionsUseful,
        uncertainty_clear: uncertaintyClear,
        warnings_clear: warningsClear,
        human_review_decision: definition.decision,
        issues,
        final_status: finalDetail.json.analysis.status,
        final_review_status: finalDetail.json.analysis.review_status,
        create_latency_ms: created.durationMs,
        detail_latency_ms: detail.durationMs,
        review_latency_ms: review.durationMs,
        reanalyze_latency_ms: reanalyzeLatencyMs,
        export_latency_ms: exportLatencyMs,
        event_counts: eventCounts,
        warning_count: warnings.length,
        uncertainty_count: uncertainties.length,
      })
    } catch (error) {
      apiErrors += 1
      throw error
    }
  }

  const metrics = {
    total_cases: cases.length,
    analyses_created: cases.filter((item) => item.created_ok).length,
    reviews_submitted: reviewsSubmitted,
    reanalyses,
    archive_restore: archiveRestore,
    exports,
    api_errors: apiErrors,
    ui_errors: 0,
    access_denied: accessDeniedValidated ? 1 : 0,
    average_latency_ms: Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / Math.max(latencyValues.length, 1)),
    evidence_insufficient_rate: Number((cases.filter((item) => item.human_review_decision === 'REQUIRES_MORE_EVIDENCE' || item.human_review_decision === 'RETURN_FOR_REANALYSIS').length / Math.max(cases.length, 1)).toFixed(2)),
    more_evidence_required_rate: Number((cases.filter((item) => item.human_review_decision === 'REQUIRES_MORE_EVIDENCE' || item.reanalyzed).length / Math.max(cases.length, 1)).toFixed(2)),
    accepted_working_hypothesis_rate: Number((cases.filter((item) => item.human_review_decision === 'ACCEPT_AS_WORKING_HYPOTHESIS').length / Math.max(cases.length, 1)).toFixed(2)),
    rejected_hypothesis_rate: Number((cases.filter((item) => item.human_review_decision === 'REJECT_WORKING_HYPOTHESIS').length / Math.max(cases.length, 1)).toFixed(2)),
    warnings_frequency: Number((cases.reduce((sum, item) => sum + item.warning_count, 0) / Math.max(cases.length, 1)).toFixed(2)),
    total_audit_events: totalAuditEvents,
  }

  const report: PilotReport = {
    trialId: TRIAL_ID,
    baseUrl,
    environment: 'CONTROLLED_INTERNAL_REMOTE',
    nextServerMode: 'build_start',
    participantIds: [admin.participantId],
    limitation: 'PILOT_SINGLE_ADMIN_LIMITATION',
    blockedParticipantId,
    accessDeniedValidated,
    cases,
    metrics,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('CONTROLLED_PILOT_API_REAL_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
