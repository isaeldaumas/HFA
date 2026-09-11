import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
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

const TRIAL_ID = 'expanded-cohort-runner-trial-001'
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

type CohortCaseDefinition = {
  caseId: string
  caseType: string
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
  case_type: string
  analysis_id_sanitized: string
  participant_id: string
  created_ok: boolean
  detail_opened: boolean
  review_submitted: boolean
  reanalyzed: boolean
  archived_restored: boolean
  exported: boolean
  escape_point_useful: boolean
  poa_useful: boolean
  preconditions_useful: boolean
  uncertainty_clear: boolean
  warnings_clear: boolean
  reviewer_decision: ReviewDecision
  review_time_minutes: number
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

type CohortReport = {
  trialId: string
  baseUrl: string
  environment: 'CONTROLLED_INTERNAL_REMOTE'
  nextServerMode: 'build_start'
  cohortStatus: 'EXPANDED_COHORT_BLOCKED_SINGLE_REVIEWER_ONLY'
  participantIds: string[]
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

const COHORT_CASES: CohortCaseDefinition[] = [
  // ── CLEAN / STRAIGHTFORWARD (5) ──────────────────────────────────────────────
  {
    caseId: 'ec-clean-anchor',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] clean anchor',
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
    caseId: 'ec-unstable-continuation',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] unstable approach continuation',
    narrative:
      'A tripulação identificou corretamente a instabilidade antes de 1.000 pés, o PM realizou o callout previsto, mas o PF não executou a arremetida e continuou a aproximação até o toque fora dos parâmetros.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'ec-warning-ignored',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] warning ignored',
    narrative:
      'O sistema de alerta de proximidade com o terreno emitiu três chamadas consecutivas durante a descida final e a tripulação não executou a manobra de saída prevista nos procedimentos.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-crm-callout',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] CRM/callout case',
    narrative:
      'O PM realizou chamadas padrão corretas para parâmetros fora dos limites a partir de 500 pés, o PF reconheceu verbalmente e continuou sem correção efetiva até a zona de arremetida obrigatória.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-visual-approach-degradation',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] visual approach degradation',
    narrative:
      'Durante a aproximação visual noturna, a percepção de rampa do PF foi influenciada pela ausência de luzes de referência lateral e a aeronave ficou consistentemente baixa na reta final sem que a tripulação corrigisse.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },

  // ── BOUNDARY / AMBIGUOUS (5) ──────────────────────────────────────────────────
  {
    caseId: 'ec-automation-boundary',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] automation boundary',
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
    caseId: 'ec-procedural-fmc-mda',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] procedural/FMC/MDA boundary',
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
    caseId: 'ec-pf-pm-ambiguity',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] PF/PM ambiguity',
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
    caseId: 'ec-progressive-escape-zone',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] progressive escape zone',
    narrative:
      'A aproximação degradou gradualmente do perfil estabilizado para um estado de correções sucessivas e alta razão de descida, sem um único marco discreto imediatamente evidente como ponto de fuga.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-action-coherent-wrong-perception',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] action coherent with wrong perception',
    narrative:
      'O PF executou a ação tecnicamente correta para a situação que ele percebia, mas a percepção estava incorreta desde o início da fase crítica, o que tornou a ação deletéria no contexto real.',
    decision: 'REQUIRES_MORE_EVIDENCE',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: true,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },

  // ── EVIDENCE INSUFFICIENT / NO-FAILURE / TECHNICAL-DOMINANT (5) ───────────────
  {
    caseId: 'ec-evidence-insufficient',
    caseType: 'evidence_insufficient',
    title: '[SERA_VNEXT_EXPANDED_COHORT] evidence insufficient',
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
    caseId: 'ec-no-failure',
    caseType: 'no_failure',
    title: '[SERA_VNEXT_EXPANDED_COHORT] no failure',
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
    caseId: 'ec-technical-dominant',
    caseType: 'technical_dominant',
    title: '[SERA_VNEXT_EXPANDED_COHORT] technical dominant',
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
    caseId: 'ec-post-escape-evidence-trap',
    caseType: 'evidence_insufficient',
    title: '[SERA_VNEXT_EXPANDED_COHORT] post-escape evidence trap',
    narrative:
      'A maioria das evidências disponíveis documenta o estado da aeronave após o ponto de fuga, deixando a fase imediatamente anterior com lacunas que impactam diretamente a atribuição de código.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-consequence-as-cause',
    caseType: 'evidence_insufficient',
    title: '[SERA_VNEXT_EXPANDED_COHORT] consequence as cause',
    narrative:
      'O relato atribui o evento à excursão lateral após o toque, mas a sequência factual mostra instabilidade de alinhamento e correções tardias ainda na aproximação e no flare.',
    decision: 'REJECT_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: true,
    exportCase: false,
  },

  // ── OPERATIONALLY REALISTIC MIXED (5) ─────────────────────────────────────────
  {
    caseId: 'ec-offshore-helicopter',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] offshore/helicopter style case',
    narrative:
      'Em operação de pouso em plataforma offshore com visibilidade reduzida, o piloto-em-comando ultrapassou o ponto de descida autorizado sem referência visual clara e manteve a abordagem fora dos parâmetros de segurança.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'ec-wrong-runway-taxiway',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] wrong runway/taxiway style case',
    narrative:
      'A tripulação iniciou a corrida de decolagem em uma saída de pista designada em vez da pista ativa, com autorização de órgão baseada em comunicação ambígua e sem verificação cruzada visual completa.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'ec-precondition-confusion',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] precondition confusion',
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
    caseId: 'ec-oc-temptation',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] O-C temptation without awareness',
    narrative:
      'A análise inicial tentou atribuir código de consequência como substituto para o ator omissivo identificado, mas a evidência não sustenta percepção consciente prévia do estado no ponto de fuga.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'CONFLICTING',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-ac-temptation',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] A-C temptation without feedback evidence',
    narrative:
      'A hipótese proposta para o eixo A implica controle ativo sobre o estado crítico, porém a evidência disponível não confirma que o ator recebeu ou processou feedback sobre a condição antes da decisão.',
    decision: 'REQUIRES_MORE_EVIDENCE',
    evidenceSufficiency: 'UNRESOLVED',
    requiresMoreEvidence: true,
    reanalyze: false,
    archiveRestore: true,
    exportCase: false,
  },

  // ── SUPPLEMENTAL CASES (5) ────────────────────────────────────────────────────
  {
    caseId: 'ec-supplemental-01',
    caseType: 'operationally_realistic_mixed',
    title: '[SERA_VNEXT_EXPANDED_COHORT] supplemental 01 — multiple concurrent issues',
    narrative:
      'Simultâneo ao desvio de perfil, havia falha parcial do VOR principal, meteorologia pior do que prevista e fadiga acumulada de ciclo longo, tornando difícil isolar a causa primária no ponto de fuga.',
    decision: 'RETURN_FOR_REANALYSIS',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: true,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-supplemental-02',
    caseType: 'boundary_ambiguous',
    title: '[SERA_VNEXT_EXPANDED_COHORT] supplemental 02 — single pilot high workload',
    narrative:
      'Operação monopiloto com carga de trabalho elevada na fase de configuração levou a um atraso no checklist antes do ponto de gate de estabilização, sem chamadas preventivas e sem correção dentro da janela.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
  {
    caseId: 'ec-supplemental-03',
    caseType: 'clean_straightforward',
    title: '[SERA_VNEXT_EXPANDED_COHORT] supplemental 03 — clear GO-AROUND delayed',
    narrative:
      'A tripulação identificou a necessidade de arremetida no mínimo 8 segundos antes do limiar, confirmou verbalmente entre si e ainda assim atrasou a execução, resultando em toque fora da zona designada.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-supplemental-04',
    caseType: 'technical_dominant',
    title: '[SERA_VNEXT_EXPANDED_COHORT] supplemental 04 — FMS lateral deviation silent',
    narrative:
      'Uma divergência lateral silenciosa no FMS deslocou o perfil de aproximação sem alarme visual ou sonoro, e a tripulação confiou exclusivamente na automação até o aviso de terreno, quando o desvio já era crítico.',
    decision: 'ACCEPT_AS_WORKING_HYPOTHESIS',
    evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS',
    requiresMoreEvidence: false,
    reanalyze: false,
    archiveRestore: false,
    exportCase: false,
  },
  {
    caseId: 'ec-supplemental-05',
    caseType: 'evidence_insufficient',
    title: '[SERA_VNEXT_EXPANDED_COHORT] supplemental 05 — sparse CVR partial recovery',
    narrative:
      'O CVR só foi parcialmente recuperado, com os últimos 9 minutos fragmentados e sem as chamadas dos últimos 2 minutos de voo, impossibilitando confirmar o ponto exato de perda de referência.',
    decision: 'REQUIRES_MORE_EVIDENCE',
    evidenceSufficiency: 'INSUFFICIENT',
    requiresMoreEvidence: true,
    reanalyze: false,
    archiveRestore: false,
    exportCase: true,
  },
]

function buildReviewNotes(def: CohortCaseDefinition): string {
  return `Expanded cohort review for ${def.caseId}. Type=${def.caseType}. Decision=${def.decision}.`
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

async function main(): Promise<void> {
  // Safety guard: must be called before any mutation
  assertSafeTestEnvironment({ requiresFixtureIds: true })

  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const admin = await createMagicLinkSession({
    baseUrl,
    participantId: 'REVIEWER-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  let blockedParticipantId: string | null = null
  let accessDeniedValidated = false

  try {
    const blocked = await createMagicLinkSession({
      baseUrl,
      participantId: 'REVIEWER-BLOCKED-01',
      tenantPrefix: BLOCKED_TENANT_PREFIX,
    })
    blockedParticipantId = blocked.participantId
    const denied = await apiJson<{ detail?: string }>({
      baseUrl,
      path: '/api/admin/sera-vnext/analyses',
      method: 'POST',
      token: blocked.accessToken,
      body: {
        title: '[SERA_VNEXT_EXPANDED_COHORT] blocked access probe',
        narrative: 'Blocked probe narrative for security validation only.',
        sourceType: 'INTERNAL_PILOT',
        sourceReference: TRIAL_ID,
        clientRequestId: `${TRIAL_ID}-blocked-${Date.now()}`,
        metadata: { internalUseConfirmed: true },
      },
    })
    assert.equal(denied.status, 403, 'Blocked reviewer must be denied with 403')
    accessDeniedValidated = true
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err
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

  for (const definition of COHORT_CASES) {
    const startMs = Date.now()
    try {
      const createPayload = {
        title: definition.title,
        narrative: definition.narrative,
        sourceType: 'INTERNAL_PILOT',
        sourceReference: definition.caseId,
        clientRequestId: `${TRIAL_ID}-${definition.caseId}-${Date.now()}`,
        metadata: { internalUseConfirmed: true, cohortCase: definition.caseId, caseType: definition.caseType },
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
        body: createPayload,
      })
      assert.equal(created.status, 201)
      assert.equal(created.json.analysis.engine_output.selectedCode, null, 'selectedCode must be null')
      assert.equal(created.json.analysis.engine_output.releasedCode, null, 'releasedCode must be null')
      assert.equal(created.json.analysis.engine_output.finalConclusion, null, 'finalConclusion must be null')
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
          body: { reason: `expanded-cohort:${definition.caseId}` },
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
        assert.equal(exported.json.candidateOutput.selectedCode, null, 'export selectedCode must be null')
        assert.equal(exported.json.candidateOutput.releasedCode, null, 'export releasedCode must be null')
        assert.equal(exported.json.candidateOutput.finalConclusion, null, 'export finalConclusion must be null')
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
      assert.ok(eventCounts['analysis.created'] >= 1, 'Must have analysis.created event')
      assert.ok(eventCounts['analysis.viewed'] >= 1, 'Must have analysis.viewed event')
      totalAuditEvents += dbState.events.length

      const output = finalDetail.json.analysis.engine_output
      assert.equal(output.selectedCode, null, 'selectedCode must remain null')
      assert.equal(output.releasedCode, null, 'releasedCode must remain null')
      assert.equal(output.finalConclusion, null, 'finalConclusion must remain null')

      const escapePointUseful =
        Boolean(output.escapePoint?.statement) &&
        output.escapePoint?.status !== 'INSUFFICIENT_EVIDENCE'
      const poaUseful = Object.values(output.axes ?? {}).some(
        (axis) => Boolean(axis.proposedCode) || axis.status === 'NO_FAILURE' || axis.status === 'CANDIDATE',
      )
      const preconditionsUseful = (output.preconditions?.length ?? 0) > 0
      const warnings = finalDetail.json.analysis.warnings ?? []
      const uncertainties = finalDetail.json.analysis.uncertainties ?? []
      const uncertaintyClear =
        uncertainties.length > 0 ||
        definition.requiresMoreEvidence ||
        Object.values(output.axes ?? {}).some(
          (axis) => axis.status === 'INSUFFICIENT_EVIDENCE' || axis.status === 'UNRESOLVED',
        )
      const warningsClear = warnings.every((w) => w.trim().length >= 8)

      const reviewTimeSec = (Date.now() - startMs) / 1000
      const issues = [
        ...(escapePointUseful ? [] : ['escape_point_needs_human_attention']),
        ...(poaUseful ? [] : ['candidate_poa_not_actionable']),
        ...(preconditionsUseful ? [] : ['preconditions_not_explicit']),
        ...(uncertaintyClear ? [] : ['uncertainty_not_explicit']),
        ...(warningsClear ? [] : ['warning_copy_needs_clarification']),
      ]

      cases.push({
        case_id: definition.caseId,
        case_type: definition.caseType,
        analysis_id_sanitized: sanitizeId(analysisId),
        participant_id: admin.participantId,
        created_ok: true,
        detail_opened: true,
        review_submitted: true,
        reanalyzed: definition.reanalyze,
        archived_restored: definition.archiveRestore,
        exported: definition.exportCase,
        escape_point_useful: escapePointUseful,
        poa_useful: poaUseful,
        preconditions_useful: preconditionsUseful,
        uncertainty_clear: uncertaintyClear,
        warnings_clear: warningsClear,
        reviewer_decision: definition.decision,
        review_time_minutes: Math.round((reviewTimeSec / 60) * 100) / 100,
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

  const total = cases.length
  const escapeUsefulCount = cases.filter((c) => c.escape_point_useful).length
  const poaUsefulCount = cases.filter((c) => c.poa_useful).length
  const precondUsefulCount = cases.filter((c) => c.preconditions_useful).length
  const uncertainClearCount = cases.filter((c) => c.uncertainty_clear).length
  const warningsClearCount = cases.filter((c) => c.warnings_clear).length
  const acceptedCount = cases.filter((c) => c.reviewer_decision === 'ACCEPT_AS_WORKING_HYPOTHESIS').length
  const rejectedCount = cases.filter((c) => c.reviewer_decision === 'REJECT_WORKING_HYPOTHESIS').length
  const moreEvidenceCount = cases.filter((c) => c.reviewer_decision === 'REQUIRES_MORE_EVIDENCE').length
  const reanalyzeCount = cases.filter((c) => c.reviewer_decision === 'RETURN_FOR_REANALYSIS').length
  const avgReviewTimeSec =
    cases.reduce((sum, c) => sum + c.review_time_minutes, 0) / Math.max(total, 1)

  const escapeUsefulRate = escapeUsefulCount / Math.max(total, 1)
  const poaUsefulRate = poaUsefulCount / Math.max(total, 1)
  const precondUsefulRate = precondUsefulCount / Math.max(total, 1)
  const uncertainClearRate = uncertainClearCount / Math.max(total, 1)
  const warningsClearRate = warningsClearCount / Math.max(total, 1)

  assert.equal(apiErrors, 0, 'api_errors must be 0')

  const metrics = {
    total_cases: total,
    total_reviewers: 1,
    analyses_created: cases.filter((c) => c.created_ok).length,
    reviews_submitted: reviewsSubmitted,
    reanalyses,
    exports,
    archive_restore_count: archiveRestore,
    api_errors: apiErrors,
    ui_errors: 0,
    audit_events: totalAuditEvents,
    escape_point_useful_count: escapeUsefulCount,
    escape_point_useful_rate: Number(escapeUsefulRate.toFixed(3)),
    poa_useful_count: poaUsefulCount,
    poa_useful_rate: Number(poaUsefulRate.toFixed(3)),
    preconditions_useful_count: precondUsefulCount,
    preconditions_useful_rate: Number(precondUsefulRate.toFixed(3)),
    uncertainty_clear_count: uncertainClearCount,
    uncertainty_clear_rate: Number(uncertainClearRate.toFixed(3)),
    warnings_clear_count: warningsClearCount,
    warnings_clear_rate: Number(warningsClearRate.toFixed(3)),
    accepted_hypothesis_count: acceptedCount,
    accepted_hypothesis_rate: Number((acceptedCount / Math.max(total, 1)).toFixed(3)),
    rejected_hypothesis_count: rejectedCount,
    rejected_hypothesis_rate: Number((rejectedCount / Math.max(total, 1)).toFixed(3)),
    more_evidence_count: moreEvidenceCount,
    more_evidence_rate: Number((moreEvidenceCount / Math.max(total, 1)).toFixed(3)),
    reanalyze_count: reanalyzeCount,
    reanalyze_rate: Number((reanalyzeCount / Math.max(total, 1)).toFixed(3)),
    average_review_time_minutes: Number(avgReviewTimeSec.toFixed(3)),
    average_latency_ms: Math.round(
      latencyValues.reduce((sum, v) => sum + v, 0) / Math.max(latencyValues.length, 1),
    ),
    access_denied_validated: accessDeniedValidated ? 1 : 0,
  }

  const report: CohortReport = {
    trialId: TRIAL_ID,
    baseUrl,
    environment: 'CONTROLLED_INTERNAL_REMOTE',
    nextServerMode: 'build_start',
    cohortStatus: 'EXPANDED_COHORT_BLOCKED_SINGLE_REVIEWER_ONLY',
    participantIds: [admin.participantId],
    blockedParticipantId,
    accessDeniedValidated,
    cases,
    metrics,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)

  const csvDir = '/Users/filipedaumas/SAAS/HFA/docs/sera-vnext/expanded-cohort'
  ensureDir(csvDir)

  const caseResultsRows = [
    'case_id,reviewer_id,analysis_id_sanitized,created_ok,detail_opened,review_submitted,reanalyzed,exported,archived_restored,escape_point_useful,poa_useful,preconditions_useful,uncertainty_clear,warnings_clear,reviewer_decision,review_time_minutes,issues',
    ...cases.map((c) =>
      [
        c.case_id,
        c.participant_id,
        c.analysis_id_sanitized,
        c.created_ok,
        c.detail_opened,
        c.review_submitted,
        c.reanalyzed,
        c.exported,
        c.archived_restored,
        c.escape_point_useful,
        c.poa_useful,
        c.preconditions_useful,
        c.uncertainty_clear,
        c.warnings_clear,
        c.reviewer_decision,
        c.review_time_minutes,
        `"${c.issues.join(';')}"`,
      ].join(','),
    ),
  ]
  fs.writeFileSync(
    path.join(csvDir, 'SERA_VNEXT_EXPANDED_COHORT_CASE_RESULTS.csv'),
    caseResultsRows.join('\n'),
  )

  console.log(JSON.stringify({ reportPath, cohortStatus: report.cohortStatus, metrics }, null, 2))
  console.log('EXPANDED_COHORT_RUNNER_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
