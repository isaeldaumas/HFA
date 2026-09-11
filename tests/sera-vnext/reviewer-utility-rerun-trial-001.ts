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

const TRIAL_ID = 'reviewer-utility-rerun-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const RERUN_PREFIX = '[SERA_VNEXT_REVIEWER_UTILITY_RERUN]'

type CaseResult = {
  case_id: string
  analysis_id_sanitized: string
  escape_point_useful: boolean
  poa_useful: boolean
  preconditions_useful: boolean
  uncertainty_clear: boolean
  warnings_clear: boolean
  reviewer_decision: string
  issues: string[]
}

const PILOT_CASES = [
  {
    case_id: 'clean-anchor',
    narrative: 'O comandante executou aproximação VFR à noite sem balizamento visual adequado e colidiu com obstáculo. Relatório do CVR indica callouts ausentes e GPWS ignorado.',
  },
  {
    case_id: 'automation-boundary',
    narrative: 'Durante a aproximação com automação acoplada, o PF manteve a descida além do perfil estabilizado enquanto o PM demorou a intervir, até o alarme de terreno e a arremetida imediata.',
  },
  {
    case_id: 'procedural-fmc-mda-boundary',
    narrative: 'Tripulação programou MDA erroneamente no FMC, resultando em descida abaixo do mínimo de aproximação sem referências visuais. Não houve callout de checklist de aproximação.',
  },
  {
    case_id: 'technical-dominant',
    narrative: 'Falha hidráulica parcial causou resposta de superfície de controle diferente do esperado. A tripulação não foi treinada para esta combinação de falha e não reconheceu o estado de emergência a tempo.',
  },
  {
    case_id: 'consequence-as-cause',
    narrative: 'Aeronave colidiu com solo após perda de controle em voo. Análise indica que a perda de controle foi consequência de icing não detectado, mas o relatório inicial atribuiu ao piloto.',
  },
  {
    case_id: 'evidence-insufficient',
    narrative: 'Incidente de TCAS não resolvido. Registros parcialmente destruídos. FDR indica manobra evasiva mas CVR perdido. Tripulação sobreviveu mas não consegue recordar sequência completa.',
  },
  {
    case_id: 'no-failure',
    narrative: 'Incidente de bird strike com dano ao motor. Tripulação seguiu todos os procedimentos corretamente, declarou emergência, pousou com segurança no aeroporto mais próximo. Sem desvio procedimental identificado.',
  },
  {
    case_id: 'pf-pm-ambiguity',
    narrative: 'Os registros disponíveis divergem sobre quem estava efetivamente voando a aeronave no momento em que o perfil estabilizado foi perdido, e a coordenação PF/PM permaneceu ambígua até a arremetida.',
  },
  {
    case_id: 'precondition-confusion',
    narrative: 'Tripulação com fadiga documentada (turno de 14h) executou aproximação noturna em condições de baixa visibilidade. Não há clareza se a fadiga foi causa ou contexto do erro de configuração de flaps.',
  },
  {
    case_id: 'progressive-escape-zone',
    narrative: 'Tripulação gradualmente desviou do perfil de descida ao longo de 12 minutos sem que nenhum dos membros vocalizasse a discrepância. O desvio final foi detectado pelo GPWS.',
  },
]

type ApiCheck = { name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; detail: string }

function evaluateReviewerOutput(ro: Record<string, unknown>): {
  escape_point_useful: boolean
  poa_useful: boolean
  preconditions_useful: boolean
  uncertainty_clear: boolean
  warnings_clear: boolean
  issues: string[]
} {
  const issues: string[] = []

  const ep = ro?.escapePointReview as Record<string, unknown> | undefined
  // useful = has a clear statement OR has boundary warnings explaining why not determinable
  const escape_point_useful = !!(ep?.reviewerQuestion) && (
    !!ep?.candidateStatement ||
    ((ep?.boundaryWarnings as string[])?.length > 0)
  )
  if (!escape_point_useful) issues.push('escape_point_not_useful')

  const axisReviews = ro?.axisReviews as Record<string, Record<string, unknown>> | undefined
  const axes = ['perception', 'objective', 'action'] as const
  let poaUseful = true
  for (const axis of axes) {
    const card = axisReviews?.[axis]
    if (!card?.plainLanguageQuestion || !card?.reviewerMustDecide || !(card?.whyCandidateWasSuggested as string[])?.length) {
      poaUseful = false
      issues.push(`poa_not_actionable_${axis}`)
    }
  }
  const poa_useful = poaUseful

  const preconditionReview = ro?.preconditionReview as Record<string, unknown> | undefined
  const cards = preconditionReview?.cards as Array<Record<string, unknown>> ?? []
  const absentMsg = preconditionReview?.absentOrInsufficient as string[] ?? []
  const preconditions_useful = (cards.length > 0 && cards.every((c) => c.description && c.reviewerQuestion)) || absentMsg.some((m) => m.length > 10)
  if (!preconditions_useful) issues.push('preconditions_not_explicit')

  const ur = ro?.uncertaintyReview as Record<string, unknown> | undefined
  const uncertainties = ur?.uncertainties as string[] ?? []
  const uncertainty_clear = uncertainties.length > 0 && uncertainties.every((u) => u.length > 5)
  if (!uncertainty_clear) issues.push('uncertainty_not_clear')

  const summary = ro?.summary as Record<string, unknown> | undefined
  const warnings_clear = !!(summary?.nonFinalNotice && (summary?.nonFinalNotice as string).length > 10)
  if (!warnings_clear) issues.push('warnings_not_clear')

  return { escape_point_useful, poa_useful, preconditions_useful, uncertainty_clear, warnings_clear, issues }
}

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

  const caseResults: CaseResult[] = []
  const checks: ApiCheck[] = []

  for (const pilotCase of PILOT_CASES) {
    const clientRequestId = `${TRIAL_ID}-${pilotCase.case_id}`
    const createRes = await apiJson({
      baseUrl,
      token: enterprise.accessToken,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      body: {
        title: `${RERUN_PREFIX} ${pilotCase.case_id}`,
        narrative: pilotCase.narrative,
        sourceType: 'INTERNAL_PILOT',
        clientRequestId,
      },
    })

    const analysisId = ((createRes.json as Record<string, Record<string, unknown>>)?.analysis?.id) as string | null

    if (!analysisId) {
      checks.push({ name: `create_${pilotCase.case_id}`, status: 'FAIL', detail: `HTTP ${createRes.status}` })
      caseResults.push({
        case_id: pilotCase.case_id,
        analysis_id_sanitized: 'FAILED',
        escape_point_useful: false,
        poa_useful: false,
        preconditions_useful: false,
        uncertainty_clear: false,
        warnings_clear: false,
        reviewer_decision: 'NOT_CREATED',
        issues: ['create_failed'],
      })
      continue
    }

    checks.push({ name: `create_${pilotCase.case_id}`, status: 'PASS', detail: sanitizeId(analysisId) })

    const detailRes = await apiJson({
      baseUrl,
      token: enterprise.accessToken,
      path: `/api/admin/sera-vnext/analyses/${analysisId}`,
    })

    if (detailRes.status !== 200) {
      checks.push({ name: `detail_${pilotCase.case_id}`, status: 'FAIL', detail: `HTTP ${detailRes.status}` })
      continue
    }
    checks.push({ name: `detail_${pilotCase.case_id}`, status: 'PASS', detail: 'ok' })

    const detail = detailRes.json as Record<string, unknown>
    const reviewerOutput = detail.reviewerOutput as Record<string, unknown> | undefined

    if (!reviewerOutput) {
      checks.push({ name: `reviewer_output_${pilotCase.case_id}`, status: 'FAIL', detail: 'reviewerOutput missing' })
      continue
    }
    checks.push({ name: `reviewer_output_${pilotCase.case_id}`, status: 'PASS', detail: 'ok' })

    const evaluation = evaluateReviewerOutput(reviewerOutput)
    const dg = (reviewerOutput as Record<string, Record<string, unknown>>)?.humanDecisionGuide
    const reviewerDecision = (dg?.recommendedNextStep as string) ?? 'UNKNOWN'

    caseResults.push({
      case_id: pilotCase.case_id,
      analysis_id_sanitized: sanitizeId(analysisId),
      ...evaluation,
      reviewer_decision: reviewerDecision,
    })
  }

  const total = caseResults.length
  const escape_point_useful_count = caseResults.filter((c) => c.escape_point_useful).length
  const poa_useful_count = caseResults.filter((c) => c.poa_useful).length
  const preconditions_useful_count = caseResults.filter((c) => c.preconditions_useful).length
  const uncertainty_clear_count = caseResults.filter((c) => c.uncertainty_clear).length
  const warnings_clear_count = caseResults.filter((c) => c.warnings_clear).length

  const metricsPass =
    escape_point_useful_count >= Math.ceil(total * 0.9) &&
    poa_useful_count >= Math.ceil(total * 0.7) &&
    preconditions_useful_count >= Math.ceil(total * 0.7) &&
    uncertainty_clear_count === total &&
    warnings_clear_count === total

  const checksFail = checks.filter((c) => c.status === 'FAIL').length

  let status: string
  if (checksFail > 0) {
    status = 'REVIEWER_UTILITY_RERUN_BLOCKED_BY_API_ERROR'
  } else if (metricsPass) {
    status = 'SERA_VNEXT_REVIEWER_UTILITY_REMEDIATION_PASS'
  } else if (poa_useful_count === 0 && preconditions_useful_count <= 1) {
    status = 'SERA_VNEXT_REVIEWER_UTILITY_REMEDIATION_FAILED'
  } else {
    status = 'SERA_VNEXT_REVIEWER_UTILITY_REMEDIATION_PASS_WITH_LIMITATIONS'
  }

  const result = {
    trial: TRIAL_ID,
    total,
    escape_point_useful: `${escape_point_useful_count}/${total}`,
    poa_useful: `${poa_useful_count}/${total}`,
    preconditions_useful: `${preconditions_useful_count}/${total}`,
    uncertainty_clear: `${uncertainty_clear_count}/${total}`,
    warnings_clear: `${warnings_clear_count}/${total}`,
    status,
    metricsPass,
    caseResults,
    checks,
  }

  writeJsonReport(TRIAL_ID, result)
  console.log(JSON.stringify(result, null, 2))

  if (checksFail > 0 || !metricsPass) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
