import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'

const MAX_ROWS = 5000
const TRIAGE_STATUSES = [
  'UNTRIAGED',
  'MONITOR_ONLY',
  'GENERAL_INVESTIGATION',
  'HFA_SELECTED',
  'CLOSED',
] as const
const RISK_LEVELS = ['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'] as const
const RISK_RANK: Record<string, number> = { BAIXO: 1, MEDIO: 2, ALTO: 3, CRITICO: 4 }

type EventRow = {
  id: string
  title: string
  triage_status: string
  investigation_path: string
  event_kind: string
  created_at: string
  reported_at: string | null
  occurred_at: string | null
}
type RiskRow = {
  event_id: string
  assessment_type: 'INITIAL' | 'RESIDUAL'
  probability: string
  severity: number
  risk_level: string
  assessed_at: string
}

type ActionRow = {
  id: string
  source_event_id: string | null
  title: string
  status: string
  priority: string | null
  category: string | null
  due_date: string | null
}

function increment(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1
}

function latestByEvent(rows: RiskRow[], type?: RiskRow['assessment_type']) {
  const map = new Map<string, RiskRow>()
  for (const row of rows) {
    if (type && row.assessment_type !== type) continue
    if (!map.has(row.event_id)) map.set(row.event_id, row)
  }
  return map
}
export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()

    const [eventsRes, risksRes, actionsRes] = await Promise.all([
      admin
        .from('events')
        .select('id, title, triage_status, investigation_path, event_kind, created_at, reported_at, occurred_at')
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
        .neq('deletion_status', 'PURGED')
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      admin
        .from('event_risk_assessments')
        .select('event_id, assessment_type, probability, severity, risk_level, assessed_at')
        .eq('tenant_id', user.tenantId)
        .order('assessed_at', { ascending: false })
        .limit(MAX_ROWS),
      admin
        .from('corrective_actions')
        .select('id, source_event_id, title, status, priority, category, due_date')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
    ])
    if (eventsRes.error || risksRes.error || actionsRes.error) {
      console.error('[/api/safety/overview]', {
        requestId,
        eventsError: eventsRes.error?.message,
        risksError: risksRes.error?.message,
        actionsError: actionsRes.error?.message,
      })
      return jsonError('Não foi possível consolidar o Safety Intelligence.', 500)
    }

    const events = (eventsRes.data ?? []) as EventRow[]
    const activeEventIds = new Set(events.map((event) => event.id))
    const risks = ((risksRes.data ?? []) as RiskRow[]).filter((row) => activeEventIds.has(row.event_id))
    const actions = ((actionsRes.data ?? []) as ActionRow[]).filter(
      (row) => !!row.source_event_id && activeEventIds.has(row.source_event_id),
    )
    const truncated = {
      events: events.length >= MAX_ROWS,
      risks: (risksRes.data?.length ?? 0) >= MAX_ROWS,
      actions: (actionsRes.data?.length ?? 0) >= MAX_ROWS,
    }

    const triage: Record<string, number> = Object.fromEntries(TRIAGE_STATUSES.map((status) => [status, 0]))
    const paths: Record<string, number> = { NONE: 0, GENERAL: 0, HFA: 0, BOTH: 0 }
    for (const event of events) {
      increment(triage, event.triage_status || 'UNTRIAGED')
      increment(paths, event.investigation_path || 'NONE')
    }
    const currentRisk = latestByEvent(risks)
    const initialRisk = latestByEvent(risks, 'INITIAL')
    const residualRisk = latestByEvent(risks, 'RESIDUAL')
    const byRiskLevel: Record<string, number> = Object.fromEntries(RISK_LEVELS.map((level) => [level, 0]))
    for (const row of currentRisk.values()) increment(byRiskLevel, row.risk_level)

    let residualImproved = 0
    let residualWorsened = 0
    for (const [eventId, residual] of residualRisk.entries()) {
      const initial = initialRisk.get(eventId)
      if (!initial) continue
      const delta = (RISK_RANK[residual.risk_level] ?? 0) - (RISK_RANK[initial.risk_level] ?? 0)
      if (delta < 0) residualImproved += 1
      if (delta > 0) residualWorsened += 1
    }

    const openActions = actions.filter((action) => ['pending', 'in_progress'].includes(action.status))
    const today = new Date().toISOString().slice(0, 10)
    const overdueActions = openActions.filter((action) => !!action.due_date && action.due_date < today)
    const byPriority: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
    const byCategory: Record<string, number> = {}
    for (const action of openActions) {
      increment(byPriority, action.priority || 'medium')
      increment(byCategory, action.category || 'OUTRO')
    }
    const eventById = new Map(events.map((event) => [event.id, event]))
    const untriagedAttention = events
      .filter((event) => event.triage_status === 'UNTRIAGED')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, 5)
      .map((event) => ({ id: event.id, title: event.title, created_at: event.created_at }))

    const riskAttention = [...currentRisk.entries()]
      .filter(([, row]) => ['ALTO', 'CRITICO'].includes(row.risk_level))
      .sort((a, b) => (RISK_RANK[b[1].risk_level] ?? 0) - (RISK_RANK[a[1].risk_level] ?? 0))
      .slice(0, 5)
      .map(([eventId, row]) => ({
        id: eventId,
        title: eventById.get(eventId)?.title ?? 'Evento',
        risk_level: row.risk_level,
        probability: row.probability,
        severity: row.severity,
      }))

    const overdueAttention = overdueActions.slice(0, 5).map((action) => ({
      id: action.id,
      event_id: action.source_event_id,
      event_title: action.source_event_id ? eventById.get(action.source_event_id)?.title ?? 'Evento' : 'Evento',
      title: action.title,
      due_date: action.due_date,
      priority: action.priority,
    }))
    const thirtyDaysAgo = Date.now() - 30 * 86_400_000
    const recentEvents = events.filter((event) => Date.parse(event.created_at) >= thirtyDaysAgo).length

    return NextResponse.json({
      generated_at: new Date().toISOString(),
      truncated,
      events: {
        total_active: events.length,
        last_30_days: recentEvents,
        by_triage: triage,
        by_investigation_path: paths,
      },
      risk: {
        assessed_events: currentRisk.size,
        unassessed_events: Math.max(events.length - currentRisk.size, 0),
        by_level: byRiskLevel,
        residual_assessed: residualRisk.size,
        residual_improved: residualImproved,
        residual_worsened: residualWorsened,
      },
      actions: {
        total: actions.length,
        open: openActions.length,
        overdue: overdueActions.length,
        completed: actions.filter((action) => action.status === 'completed').length,
        high_or_critical_open: openActions.filter((action) => ['high', 'critical'].includes(action.priority || '')).length,
        by_priority: byPriority,
        by_category: byCategory,
      },
      attention: {
        untriaged: untriagedAttention,
        high_risk: riskAttention,
        overdue_actions: overdueAttention,
      },
      recent_events: events.slice(0, 5).map((event) => ({
        id: event.id,
        title: event.title,
        triage_status: event.triage_status,
        investigation_path: event.investigation_path,
        created_at: event.created_at,
      })),
    }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/safety/overview]', {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return jsonError('Não foi possível consolidar o Safety Intelligence.', 500)
  }
}
