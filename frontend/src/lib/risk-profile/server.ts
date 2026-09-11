import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDataConfidence } from '@/lib/sera/data-confidence'
import type { HfaErcCategory } from '@/lib/sera/erc-conversion'
import type { RiskQualityTrendPoint } from '@/lib/sera/risk-quality-trend'
import {
  deriveSafetyIssueCandidates,
  type SafetyIssueCandidateCombinationInput,
} from '@/lib/sera/safety-issue-candidates'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { computeHfaErcCategoryFromCodes, describeHfaErcCategory } from './erc'
import {
  D3_DECISION_ID,
  buildErcContainmentNotice,
  resolveErcPresentationMode,
  shouldSuppressConsolidatedNumericErc,
} from './erc-containment'
import type {
  RiskProfileRecurringPattern,
  RiskProfileSourceEvent,
  RiskProfileSourceStatus,
  RiskProfileSummary,
} from './types'

const LEGACY_PRECONDITION_NAMES: Record<string, string> = {
  P1: 'Condição do Pessoal - Fisiológico',
  P2: 'Condição do Pessoal - Psicológico',
  P3: 'Condição do Pessoal - Conhecimento',
  P4: 'Condição do Pessoal - Habilidade',
  P5: 'Condição do Pessoal - Prontidão Pessoal',
  P6: 'Condição do Pessoal - Seleção e Treinamento',
  P7: 'Condição do Pessoal - Qualificação e Autorização',
  S1: 'Falhas em C/C/S - Liderança e Supervisão',
  S2: 'Falhas em C/C/S - Planejamento',
  S3: 'Falhas em C/C/S - Monitoramento e Supervisão',
  S4: 'Falhas em C/C/S - Comunicação',
  T1: 'Treinamento - Qualidade',
  T2: 'Treinamento - Adequação',
  W1: 'Condições de Trabalho - Tecnológico',
  W2: 'Condições de Trabalho - Organizacional',
  W3: 'Condições de Trabalho - Ambiente',
  W4: 'Condições de Trabalho - Equipe',
  O1: 'Influências Organizacionais - Recursos',
  O2: 'Influências Organizacionais - Clima',
  O3: 'Influências Organizacionais - Processos',
  O4: 'Influências Organizacionais - Gestão',
}

const VNEXT_PRECONDITION_NAMES: Record<string, string> = {
  PHYSICAL_CAPABILITY: 'Capacidade física',
  SENSORY_LIMITATION: 'Limitação sensorial',
  KNOWLEDGE_TRAINING: 'Conhecimento e treinamento',
  TIME_PRESSURE: 'Pressão de tempo',
  COMMUNICATION_INFORMATION: 'Comunicação e informação',
  PROCEDURAL_MONITORING: 'Procedimento e monitoramento',
  FEEDBACK_VERIFICATION: 'Feedback e verificação',
  INTENT_AWARENESS: 'Intenção e consciência situacional',
  TEAM_COORDINATION: 'Coordenação de equipe',
  ENVIRONMENTAL_CONTEXT: 'Contexto ambiental',
  TECHNICAL_CONTEXT: 'Contexto técnico',
  ORGANIZATIONAL_CONTEXT: 'Contexto organizacional',
}

type LegacyAnalysisRow = {
  id: string
  perception_code: string | null
  objective_code: string | null
  action_code: string | null
  preconditions: unknown
  created_at: string | null
}

type LegacyEventRow = {
  id: string
  tenant_id: string
  title: string
  status: string
  created_at: string
  occurred_at: string | null
  analyses: LegacyAnalysisRow[] | LegacyAnalysisRow | null
}

type ActionRow = {
  id: string
  status: string
  due_date: string | null
  analysis_id: string | null
  created_at: string | null
}

type ExclusionRow = {
  id: string
  source_type: 'legacy_event' | 'sera_vnext_analysis'
  source_id: string
  excluded_at: string
  reason: string | null
}

type VNextAnalysisRow = {
  id: string
  tenant_id: string
  title: string
  status: string
  review_status: string
  created_at: string
  deleted_at: string | null
  engine_version: string | null
  engine_runtime_version: string | null
  methodology_version: string | null
  canonical_tree_version: string | null
  source_reference: string | null
  source_flow: string | null
  perception_candidate_code: string | null
  objective_candidate_code: string | null
  action_candidate_code: string | null
  warnings: unknown
  limitations: unknown
  uncertainties: unknown
  engine_output: Record<string, unknown> | null
}

type RiskProfileUniverse = {
  sources: RiskProfileSourceEvent[]
  actions: ActionRow[]
  limitations: string[]
}

function topCode(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts)
  if (!entries.length) return null
  return entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

function topCodes(counts: Record<string, number>, n: number): Array<{ code: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([code, count]) => ({ code, count }))
}

function countMapToSortedArray(counts: Record<string, number>): Array<{ code: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([code, count]) => ({ code, count }))
}

function normalizeLegacyStatus(status: string, hasAnalysis: boolean): RiskProfileSourceStatus {
  switch (status) {
    case 'completed':
      return hasAnalysis ? 'completed' : 'received'
    case 'failed':
      return 'error'
    case 'processing':
      return 'processing'
    case 'received':
    default:
      return 'received'
  }
}

function normalizeVNextStatus(status: string, deletedAt: string | null): RiskProfileSourceStatus {
  if (deletedAt || status === 'ARCHIVED') return 'archived'
  if (status === 'HUMAN_REVIEW_COMPLETED_NON_FINAL') return 'completed'
  if (status === 'REQUIRES_MORE_EVIDENCE') return 'error'
  if (status === 'UNDER_HUMAN_REVIEW') return 'processing'
  return 'draft'
}

function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeLegacyPreconditions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (item && typeof item === 'object' && typeof (item as { code?: unknown }).code === 'string'
      ? (item as { code: string }).code
      : null))
    .filter((code): code is string => !!code)
}

function normalizeVNextPreconditions(engineOutput: Record<string, unknown> | null): string[] {
  const value = engineOutput?.preconditions
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const category = (item as { category?: unknown }).category
      return typeof category === 'string' && category.trim().length > 0 ? category : null
    })
    .filter((category): category is string => !!category)
}

function preconditionName(code: string): string {
  return LEGACY_PRECONDITION_NAMES[code] ?? VNEXT_PRECONDITION_NAMES[code] ?? code
}

function buildExclusionLookup(rows: ExclusionRow[]): Map<string, ExclusionRow> {
  const lookup = new Map<string, ExclusionRow>()
  for (const row of rows) {
    lookup.set(`${row.source_type}:${row.source_id}`, row)
  }
  return lookup
}

function coerceLegacyAnalysis(value: LegacyEventRow['analyses']): LegacyAnalysisRow | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function toLegacySource(row: LegacyEventRow, exclusionLookup: Map<string, ExclusionRow>): RiskProfileSourceEvent {
  const analysis = coerceLegacyAnalysis(row.analyses)
  const category = computeHfaErcCategoryFromCodes(
    analysis?.perception_code ?? null,
    analysis?.objective_code ?? null,
    analysis?.action_code ?? null,
  )
  const erc = describeHfaErcCategory(category)
  const exclusion = exclusionLookup.get(`legacy_event:${row.id}`)

  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    status: normalizeLegacyStatus(row.status, !!analysis),
    source: 'legacy_event',
    sourceFlow: 'LEGACY_SERA',
    analysisId: analysis?.id ?? null,
    engineVersion: null,
    engineRuntimeVersion: null,
    methodologyVersion: null,
    canonicalTreeVersion: null,
    erc: {
      code: erc.code,
      severity: erc.severity,
      label: erc.label,
      category,
    },
    perceptionCode: analysis?.perception_code ?? null,
    objectiveCode: analysis?.objective_code ?? null,
    actionCode: analysis?.action_code ?? null,
    preconditions: normalizeLegacyPreconditions(analysis?.preconditions),
    warnings: [],
    isExcludedFromRiskProfile: !!exclusion,
    exclusionId: exclusion?.id ?? null,
    exclusionReason: exclusion?.reason ?? null,
    exclusionAt: exclusion?.excluded_at ?? null,
  }
}

function isCompatibleVNextRow(row: VNextAnalysisRow): boolean {
  const preconditions = normalizeVNextPreconditions(row.engine_output)
  return !!(
    row.perception_candidate_code ||
    row.objective_candidate_code ||
    row.action_candidate_code ||
    preconditions.length > 0
  )
}

function toVNextSource(
  row: VNextAnalysisRow,
  exclusionLookup: Map<string, ExclusionRow>,
): RiskProfileSourceEvent {
  // D3-b: no numeric ERC for vNext — do not apply ARMS matrix as if it were vNext ERC.
  const exclusion = exclusionLookup.get(`sera_vnext_analysis:${row.id}`)
  const warnings = [
    ...ensureStringArray(row.warnings),
    ...ensureStringArray(row.limitations),
    ...ensureStringArray(row.uncertainties),
    'D3-b: ERC numérico canônico do vNext não disponível; valor não gerado a partir da matriz ARMS legada.',
  ]

  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    createdAt: row.created_at,
    status: normalizeVNextStatus(row.status, row.deleted_at),
    source: 'sera_vnext_analysis',
    sourceFlow: row.source_flow ?? 'VNEXT_PRODUCT_BETA',
    analysisId: row.id,
    engineVersion: row.engine_version,
    engineRuntimeVersion: row.engine_runtime_version,
    methodologyVersion: row.methodology_version,
    canonicalTreeVersion: row.canonical_tree_version,
    erc: {
      code: null,
      severity: null,
      label: null,
      category: null,
    },
    perceptionCode: row.perception_candidate_code,
    objectiveCode: row.objective_candidate_code,
    actionCode: row.action_candidate_code,
    preconditions: normalizeVNextPreconditions(row.engine_output),
    warnings,
    isExcludedFromRiskProfile: !!exclusion,
    exclusionId: exclusion?.id ?? null,
    exclusionReason: exclusion?.reason ?? null,
    exclusionAt: exclusion?.excluded_at ?? null,
  }
}

function sortSourcesNewestFirst<T extends { occurredAt?: string | null; createdAt: string }>(sources: T[]): T[] {
  return [...sources].sort((a, b) => {
    const left = a.occurredAt ?? a.createdAt
    const right = b.occurredAt ?? b.createdAt
    return right.localeCompare(left)
  })
}

function buildQualityTrendFromCategories(
  items: Array<{ createdAt: string; category: HfaErcCategory | null }>,
): RiskQualityTrendPoint[] {
  const monthMap = new Map<string, Record<HfaErcCategory, number>>()

  for (const item of items) {
    if (!item.category) continue
    const month = item.createdAt.slice(0, 7)
    if (!monthMap.has(month)) {
      monthMap.set(month, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
    }
    monthMap.get(month)![item.category] += 1
  }

  const result: RiskQualityTrendPoint[] = []
  for (const [month, counts] of monthMap.entries()) {
    const total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5]
    const dominant = ([5, 4, 3, 2, 1] as HfaErcCategory[]).find((candidate) =>
      counts[candidate] === Math.max(counts[1], counts[2], counts[3], counts[4], counts[5]),
    ) ?? null
    const criticalOrHigh = counts[4] + counts[5]
    result.push({
      month,
      total,
      hfa_erc: {
        c1: counts[1],
        c2: counts[2],
        c3: counts[3],
        c4: counts[4],
        c5: counts[5],
      },
      dominant_hfa_erc_category: total > 0 ? dominant : null,
      critical_or_high_count: criticalOrHigh,
      critical_or_high_share: total > 0 ? criticalOrHigh / total : 0,
    })
  }

  result.sort((a, b) => a.month.localeCompare(b.month))
  return result
}

function buildRecurringPatterns(
  counts: Record<string, number>,
  evidenceIds: Record<string, string[]>,
): RiskProfileRecurringPattern[] {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([pattern, count]) => ({
      pattern,
      count,
      evidenceEventIds: [...new Set(evidenceIds[pattern] ?? [])],
    }))
}

export async function loadRiskProfileUniverse(
  tenantId: string,
  admin: SupabaseClient = getSupabaseAdmin(),
): Promise<RiskProfileUniverse> {
  const [eventsRes, actionsRes, exclusionsRes, vnextRes] = await Promise.all([
    admin
      .from('events')
      .select('id, tenant_id, title, status, created_at, occurred_at, analyses(id, perception_code, objective_code, action_code, preconditions, created_at)')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    admin
      .from('corrective_actions')
      .select('id, status, due_date, analysis_id, created_at')
      .eq('tenant_id', tenantId),
    admin
      .from('risk_profile_exclusions')
      .select('id, source_type, source_id, excluded_at, reason')
      .eq('tenant_id', tenantId)
      .is('restored_at', null),
    admin
      .from('sera_vnext_analyses')
      .select('id, tenant_id, title, status, review_status, created_at, deleted_at, source_reference, engine_version, engine_runtime_version, methodology_version, canonical_tree_version, source_flow, perception_candidate_code, objective_candidate_code, action_candidate_code, warnings, limitations, uncertainties, engine_output')
      .eq('tenant_id', tenantId)
      .eq('status', 'HUMAN_REVIEW_COMPLETED_NON_FINAL')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  if (eventsRes.error) throw new Error(`RISK_PROFILE_EVENTS_QUERY_FAILED: ${eventsRes.error.message}`)
  if (actionsRes.error) throw new Error(`RISK_PROFILE_ACTIONS_QUERY_FAILED: ${actionsRes.error.message}`)
  if (exclusionsRes.error) throw new Error(`RISK_PROFILE_EXCLUSIONS_QUERY_FAILED: ${exclusionsRes.error.message}`)
  if (vnextRes.error) throw new Error(`RISK_PROFILE_VNEXT_QUERY_FAILED: ${vnextRes.error.message}`)

  const exclusionLookup = buildExclusionLookup((exclusionsRes.data ?? []) as ExclusionRow[])
  const legacySources = ((eventsRes.data ?? []) as LegacyEventRow[]).map((row) => toLegacySource(row, exclusionLookup))
  const allVNextRows = (vnextRes.data ?? []) as VNextAnalysisRow[]
  const compatibleVNextRows = allVNextRows.filter(isCompatibleVNextRow)
  const incompatibleVNextCount = allVNextRows.length - compatibleVNextRows.length

  // Deduplicate vNext analyses by source_reference (event_id) — keep only the most recent per event
  const seenEventIds = new Set<string>()
  const deduped = new Array<VNextAnalysisRow>()
  const sortedVNext = [...compatibleVNextRows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const row of sortedVNext) {
    const eventKey = row.source_reference || row.id
    if (!seenEventIds.has(eventKey)) { seenEventIds.add(eventKey); deduped.push(row) }
  }
  const vnextSources = deduped.map((row) => toVNextSource(row, exclusionLookup))
  const limitations: string[] = []
  if (incompatibleVNextCount > 0) {
    limitations.push(
      `${incompatibleVNextCount} análise(s) SERA vNext foram ignoradas por ainda não exporem P/O/A ou preconditions compatíveis com o Perfil de Risco.`,
    )
  }

  return {
    sources: sortSourcesNewestFirst([...legacySources, ...vnextSources]),
    actions: (actionsRes.data ?? []) as ActionRow[],
    limitations,
  }
}

export async function getRiskProfileSummaryForTenant(
  tenantId: string,
  admin: SupabaseClient = getSupabaseAdmin(),
): Promise<RiskProfileSummary> {
  const { sources, actions, limitations: universeLimitations } = await loadRiskProfileUniverse(tenantId, admin)

  const totalEvents = sources.length
  const excludedSources = sortSourcesNewestFirst(sources.filter((source) => source.isExcludedFromRiskProfile))
  const activeSources = sources.filter((source) => !source.isExcludedFromRiskProfile)
  const includedSources = sortSourcesNewestFirst(activeSources.filter((source) => source.status === 'completed'))
  const errorSources = activeSources.filter((source) => source.status === 'error')
  const draftSources = activeSources.filter((source) => source.status === 'draft' || source.status === 'processing' || source.status === 'received')
  const archivedSources = activeSources.filter((source) => source.status === 'archived')

  const perceptionCounts: Record<string, number> = {}
  const objectiveCounts: Record<string, number> = {}
  const actionCounts: Record<string, number> = {}
  const preconditionCounts: Record<string, number> = {}
  const combinationCounts: Record<string, number> = {}
  const combinationEvidenceIds: Record<string, string[]> = {}
  const eventAnalysisMap: Record<string, { perception_code: string | null; objective_code: string | null; action_code: string | null }> = {}
  const ercCounts: Record<string, number> = {}

  for (const source of includedSources) {
    const p = source.perceptionCode ?? null
    const o = source.objectiveCode ?? null
    const a = source.actionCode ?? null

    if (p) perceptionCounts[p] = (perceptionCounts[p] || 0) + 1
    if (o) objectiveCounts[o] = (objectiveCounts[o] || 0) + 1
    if (a) actionCounts[a] = (actionCounts[a] || 0) + 1

    for (const code of source.preconditions ?? []) {
      preconditionCounts[code] = (preconditionCounts[code] || 0) + 1
    }

    const pairs = [
      p && o ? `${p} + ${o}` : null,
      p && a ? `${p} + ${a}` : null,
      o && a ? `${o} + ${a}` : null,
    ].filter((value): value is string => !!value)

    for (const pair of pairs) {
      combinationCounts[pair] = (combinationCounts[pair] || 0) + 1
      combinationEvidenceIds[pair] = [...(combinationEvidenceIds[pair] ?? []), source.id]
    }

    if (source.source === 'legacy_event' && source.erc?.category) {
      const code = String(source.erc.category)
      ercCounts[code] = (ercCounts[code] || 0) + 1
    }

    eventAnalysisMap[source.id] = {
      perception_code: p,
      objective_code: o,
      action_code: a,
    }
  }

  const totalAnalyses = includedSources.length
  const pTotal = Object.values(perceptionCounts).reduce((sum, value) => sum + value, 0)
  const oTotal = Object.values(objectiveCounts).reduce((sum, value) => sum + value, 0)
  const aTotal = Object.values(actionCounts).reduce((sum, value) => sum + value, 0)

  const topPreconditions = Object.entries(preconditionCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([code, count]) => ({
      code,
      count,
      pct: totalAnalyses > 0 ? Math.round((count / totalAnalyses) * 100) : 0,
      name: preconditionName(code),
    }))

  const topCombinations = Object.entries(combinationCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([pair, count]) => ({
      pair,
      count,
      pct: totalAnalyses > 0 ? Math.round((count / totalAnalyses) * 100) : 0,
    }))

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const thirtyDaysAgo = new Date(today)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const openStatuses = new Set(['pending', 'in_progress'])
  const openActions = actions.filter((action) => openStatuses.has(action.status))
  const openOverdue = openActions.filter((action) => action.due_date && new Date(action.due_date) < today).length
  const openTotal = openActions.length
  const closedLast30d = actions.filter(
    (action) => action.status === 'completed' && action.created_at && new Date(action.created_at) >= thirtyDaysAgo,
  ).length
  const closedTotal = actions.filter((action) => action.status === 'completed').length
  const resolutionRate =
    closedTotal + openTotal > 0
      ? Math.round((closedTotal / (closedTotal + openTotal)) * 100)
      : 0

  const actionsResult = {
    open_total: openTotal,
    open_overdue: openOverdue,
    open_no_owner: 0,
    closed_last_30d: closedLast30d,
    resolution_rate: resolutionRate,
  }

  const trendCounts: Record<string, number> = {}
  for (const source of includedSources) {
    const month = source.createdAt.slice(0, 7)
    trendCounts[month] = (trendCounts[month] || 0) + 1
  }
  const trend = Object.entries(trendCounts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([month, count]) => ({ month, count }))

  const baseScore =
    totalAnalyses > 0
      ? ((pTotal * 1.0 + oTotal * 0.8 + aTotal * 0.6) / totalAnalyses / 3) * 100
      : 0

  let penalties = 0
  if (openOverdue > 0) penalties += 15

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const totalEvents90d = activeSources.filter((source) => new Date(source.createdAt) >= ninetyDaysAgo).length
  const eventsThisMonth = activeSources.filter((source) => new Date(source.createdAt) >= thisMonthStart).length
  const monthlyAverage = totalEvents90d / 3
  if (monthlyAverage > 0 && eventsThisMonth > monthlyAverage * 1.5) penalties += 5

  const scoreValue = Math.min(Math.round(baseScore + penalties), 100)
  const scoreLevel = scoreValue >= 70 ? 'critical' : scoreValue >= 40 ? 'warning' : 'ok'
  const score = {
    value: scoreValue,
    level: scoreLevel,
    label: scoreLevel === 'critical' ? 'Crítico' : scoreLevel === 'warning' ? 'Atenção' : 'Normal',
  } as const

  const alerts: string[] = []
  if (openOverdue > 0) {
    alerts.push(`${openOverdue} ação${openOverdue > 1 ? 'ões' : ''} corretiva${openOverdue > 1 ? 's' : ''} vencida${openOverdue > 1 ? 's' : ''} sem resolução`)
  }
  const topPerception = topCode(perceptionCounts)
  if (topPerception && totalAnalyses > 0) {
    const pct = Math.round((perceptionCounts[topPerception] / totalAnalyses) * 100)
    if (pct >= 30) alerts.push(`Falha ${topPerception} representa ${pct}% das análises consideradas`)
  }
  alerts.push(`${eventsThisMonth} evento${eventsThisMonth !== 1 ? 's' : ''} ativo${eventsThisMonth !== 1 ? 's' : ''} este mês vs média de ${Math.round(monthlyAverage)}/mês`)

  const legacyCount = includedSources.filter((s) => s.source === 'legacy_event').length
  const vnextCount = includedSources.filter((s) => s.source === 'sera_vnext_analysis').length
  const legacyErcPresent = Object.keys(ercCounts).length > 0
  const ercPresentationMode = resolveErcPresentationMode({
    legacyCount,
    vnextCount,
    legacyErcPresent,
  })
  const suppressConsolidatedErc = shouldSuppressConsolidatedNumericErc(ercPresentationMode)

  const validErcCount = includedSources.filter(
    (source) => source.source === 'legacy_event' && source.erc?.category != null,
  ).length
  const modalErcLevel = (() => {
    if (suppressConsolidatedErc) return null
    const entries = Object.entries(ercCounts)
    if (!entries.length) return null
    entries.sort((left, right) => right[1] - left[1] || Number(right[0]) - Number(left[0]))
    return Number(entries[0][0]) as HfaErcCategory
  })()

  const combinationInput: SafetyIssueCandidateCombinationInput[] = Object.entries(combinationCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .flatMap(([pair, count]) => {
      const parts = pair.split(' + ')
      if (parts.length !== 2) return []
      const [first, second] = parts
      const firstDim = first.charAt(0)
      const secondDim = second.charAt(0)
      const items: SafetyIssueCandidateCombinationInput[] = []
      if (firstDim === 'P' && secondDim === 'O') items.push({ type: 'P+O', first, second, count })
      if (firstDim === 'P' && secondDim === 'A') items.push({ type: 'P+A', first, second, count })
      if (firstDim === 'O' && secondDim === 'A') items.push({ type: 'O+A', first, second, count })
      if (items.length > 0) return items
      return []
    })

  const safetyIssueCandidates = deriveSafetyIssueCandidates({
    totalAnalyses,
    combinations: combinationInput,
    preconditions: topPreconditions.map((precondition) => ({
      code: precondition.code,
      label: precondition.name,
      count: precondition.count,
    })),
  })

  const qualityTrend = buildQualityTrendFromCategories(
    includedSources
      .filter((source) => source.source === 'legacy_event')
      .map((source) => ({
        createdAt: source.createdAt,
        category: source.erc?.category ?? null,
      })),
  )

  const summaryLimitations = [...universeLimitations]
  summaryLimitations.push(
    'Índice de risco descritivo interno — não validado como medida de risco operacional. ' +
    'Pesos heurísticos (P×1.0, O×0.8, A×0.6) não foram calibrados empiricamente.'
  )
  if (draftSources.length > 0) {
    summaryLimitations.push(`${draftSources.length} registro(s) ainda não concluído(s) ficaram fora do consolidado.`)
  }
  if (errorSources.length > 0) {
    summaryLimitations.push(`${errorSources.length} evento(s) com erro não entraram como análise válida.`)
  }
  if (archivedSources.length > 0) {
    summaryLimitations.push(`${archivedSources.length} registro(s) arquivado(s) ficaram fora do cálculo.`)
  }
  if (excludedSources.length > 0) {
    summaryLimitations.push(`${excludedSources.length} fonte(s) foram desconsideradas manualmente do Perfil de Risco.`)
  }
  const legacyCountForLimitation = legacyCount
  const vnextCountForLimitation = vnextCount
  if (legacyCountForLimitation > 0 && vnextCountForLimitation > 0) {
    summaryLimitations.push(
      `Agregados combinam ${legacyCountForLimitation} análise(s) LEGACY_SERA e ${vnextCountForLimitation} análise(s) VNEXT: versões metodológicas distintas. Classificação: MIXED_VERSION_LIMITATION.`
    )
  }
  summaryLimitations.push(buildErcContainmentNotice())
  if (suppressConsolidatedErc) {
    summaryLimitations.push(
      ercPresentationMode === 'SUPPRESSED_D3B_MIXED'
        ? 'D3-b: perfil misto — ERC numérico consolidado omitido (modal_erc_level=null; erc_distribution vazia).'
        : 'D3-b: perfil somente vNext — ERC numérico canônico omitido até mecanismo validado/versionado.',
    )
  }

  const dataConfidence = buildDataConfidence({
    totalAnalyses,
    validErcCount,
    safetyIssueCandidateCount: safetyIssueCandidates.length,
    minimumRecommended: 10,
    ercShareAffectsLevel: !suppressConsolidatedErc,
  })

  const recentEvents = includedSources.slice(0, 5).map((source) => ({
    id: source.id,
    title: source.title,
    created_at: source.createdAt,
    perception_code: source.perceptionCode ?? null,
    objective_code: source.objectiveCode ?? null,
    action_code: source.actionCode ?? null,
  }))

  return {
    score,
    distribution: {
      perception: {
        count: pTotal,
        pct: totalAnalyses > 0 ? Math.round((pTotal / totalAnalyses) * 100) : 0,
        top_code: topCode(perceptionCounts),
        top_codes: topCodes(perceptionCounts, 3),
      },
      objective: {
        count: oTotal,
        pct: totalAnalyses > 0 ? Math.round((oTotal / totalAnalyses) * 100) : 0,
        top_code: topCode(objectiveCounts),
        top_codes: topCodes(objectiveCounts, 3),
      },
      action: {
        count: aTotal,
        pct: totalAnalyses > 0 ? Math.round((aTotal / totalAnalyses) * 100) : 0,
        top_code: topCode(actionCounts),
        top_codes: topCodes(actionCounts, 3),
      },
      total: totalAnalyses,
    },
    top_preconditions: topPreconditions,
    top_combinations: topCombinations,
    actions: actionsResult,
    trend,
    alerts,
    total_analyses: totalAnalyses,
    total_events_90d: totalEvents90d,
    modal_erc_level: modalErcLevel,
    erc_presentation_mode: ercPresentationMode,
    d3_decision: D3_DECISION_ID,
    safety_issue_candidates: safetyIssueCandidates,
    quality_trend: qualityTrend,
    data_confidence: dataConfidence,
    total_events: totalEvents,
    included_events: includedSources.length,
    excluded_events: excludedSources.length,
    completed_analyses: includedSources.length,
    error_analyses: errorSources.length,
    confidence: dataConfidence.level,
    erc_distribution: suppressConsolidatedErc
      ? []
      : Object.entries(ercCounts)
          .sort((left, right) => Number(right[0]) - Number(left[0]))
          .map(([code, count]) => ({
            code: `ERC ${code}`,
            label: describeHfaErcCategory(Number(code) as HfaErcCategory).label ?? `ERC ${code}`,
            count,
          })),
    perception_distribution: countMapToSortedArray(perceptionCounts),
    objective_distribution: countMapToSortedArray(objectiveCounts),
    action_distribution: countMapToSortedArray(actionCounts),
    precondition_distribution: countMapToSortedArray(preconditionCounts).map((item) => ({
      category: item.code,
      count: item.count,
    })),
    recurring_patterns: buildRecurringPatterns(combinationCounts, combinationEvidenceIds),
    source_events_included: includedSources,
    source_events_excluded: excludedSources,
    recent_events: recentEvents,
    limitations: summaryLimitations,
    generated_at: new Date().toISOString(),
  }
}
