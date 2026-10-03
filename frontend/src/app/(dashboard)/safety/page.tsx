'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardList, Radar, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

type Overview = {
  generated_at: string
  truncated: { events: boolean; risks: boolean; actions: boolean }
  events: {
    total_active: number
    last_30_days: number
    by_triage: Record<string, number>
    by_investigation_path: Record<string, number>
  }
  risk: {
    assessed_events: number
    unassessed_events: number
    by_level: Record<string, number>
    residual_assessed: number
    residual_improved: number
    residual_worsened: number
  }
  actions: {
    total: number
    open: number
    overdue: number
    completed: number
    high_or_critical_open: number
    by_priority: Record<string, number>
    by_category: Record<string, number>
  }
  attention: {
    untriaged: Array<{ id: string; title: string; created_at: string }>
    high_risk: Array<{
      id: string
      title: string
      risk_level: string
      probability: string
      severity: number
    }>
    overdue_actions: Array<{
      id: string
      event_id: string | null
      event_title: string
      title: string
      due_date: string | null
      priority: string | null
    }>
  }
  recent_events: Array<{
    id: string
    title: string
    triage_status: string
    investigation_path: string
    created_at: string
  }>
}

const TRIAGE_LABELS: Record<string, { pt: string; en: string }> = {
  UNTRIAGED: { pt: 'Aguardando triagem', en: 'Awaiting triage' },
  MONITOR_ONLY: { pt: 'Monitorar', en: 'Monitor only' },
  GENERAL_INVESTIGATION: { pt: 'Investigação geral', en: 'General investigation' },
  HFA_SELECTED: { pt: 'HFA selecionado', en: 'HFA selected' },
  CLOSED: { pt: 'Encerrado', en: 'Closed' },
}

const RISK_TONE: Record<string, string> = {
  BAIXO: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  MEDIO: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  ALTO: 'text-orange-300 border-orange-500/30 bg-orange-500/10',
  CRITICO: 'text-red-300 border-red-500/30 bg-red-500/10',
}
function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: number
  detail: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <Icon className="size-4 text-blue-400" />
      </div>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  )
}

export default function SafetyPage() {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  const L = useCallback((ptText: string, enText: string) => pt ? ptText : enText, [pt])
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(L('Sessão inválida.', 'Invalid session.'))
      const res = await fetch('/api/safety/overview', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || L('Falha ao carregar Safety Intelligence.', 'Failed to load Safety Intelligence.'))
      setData(json as Overview)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : L('Falha ao carregar.', 'Failed to load.'))
    } finally {
      setLoading(false)
    }
  }, [L])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  if (loading) return <div className="p-8 text-slate-400">{L('Carregando Safety Intelligence…', 'Loading Safety Intelligence…')}</div>
  if (error || !data) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-200">
          {error || L('Dados indisponíveis.', 'Data unavailable.')}
        </div>
      </div>
    )
  }

  const highRisk = (data.risk.by_level.ALTO ?? 0) + (data.risk.by_level.CRITICO ?? 0)
  const truncated = Object.values(data.truncated).some(Boolean)

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-300">
            <ShieldCheck className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">Safety Intelligence</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white">{L('Visão executiva de Safety', 'Executive Safety overview')}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
            {L('Consolida relato, triagem, risco e ações. O painel é determinístico; decisões de risco e investigação permanecem humanas.', 'Consolidates reports, triage, risk and actions. The dashboard is deterministic; risk and investigation decisions remain human.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/events/new" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            {L('Registrar evento', 'Report event')}
          </Link>
          <Link href="/risk-profile" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500">
            {L('Perfil HFA', 'HFA Profile')}
          </Link>
        </div>
      </div>

      {truncated && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {L('A base excedeu o limite operacional desta visão. Os totais exibidos são parciais e precisam de paginação para consolidação completa.', 'The dataset exceeded this view’s operational limit. Displayed totals are partial and require pagination for complete consolidation.')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={L('Eventos ativos', 'Active events')} value={data.events.total_active} detail={`${data.events.last_30_days} ${L('nos últimos 30 dias', 'in the last 30 days')}`} icon={Radar} />
        <MetricCard label={L('Aguardando triagem', 'Awaiting triage')} value={data.events.by_triage.UNTRIAGED ?? 0} detail={L('Requer decisão do Safety', 'Requires Safety decision')} icon={AlertTriangle} />
        <MetricCard label={L('Risco alto/crítico', 'High/critical risk')} value={highRisk} detail={`${data.risk.unassessed_events} ${L('eventos sem avaliação', 'events unassessed')}`} icon={ShieldCheck} />
        <MetricCard label={L('Ações abertas', 'Open actions')} value={data.actions.open} detail={`${data.actions.overdue} ${L('vencidas', 'overdue')}`} icon={ClipboardList} />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">{L('Fila de triagem', 'Triage queue')}</h2>
              <p className="mt-1 text-xs text-slate-500">{L('Distribuição dos eventos ativos por decisão de Safety.', 'Active events by Safety decision.')}</p>
            </div>
            <Link href="/events" className="text-xs text-blue-400 hover:text-blue-300">{L('Ver eventos →', 'View events →')}</Link>
          </div>
          <div className="mt-4 space-y-2">
            {Object.entries(TRIAGE_LABELS).map(([key, labels]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                <span className="text-sm text-slate-300">{pt ? labels.pt : labels.en}</span>
                <span className="font-mono text-sm text-white">{data.events.by_triage[key] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div>
            <h2 className="text-sm font-semibold text-white">{L('Risco atual', 'Current risk')}</h2>
            <p className="mt-1 text-xs text-slate-500">{L('Usa o risco residual mais recente; na ausência dele, o risco inicial.', 'Uses the latest residual risk; otherwise the initial risk.')}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'].map((level) => (
              <div key={level} className={`rounded-lg border px-3 py-3 ${RISK_TONE[level]}`}>
                <p className="text-[10px] font-bold tracking-wide">{level}</p>
                <p className="mt-1 text-2xl font-bold">{data.risk.by_level[level] ?? 0}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-slate-300">
              <p className="text-lg font-semibold text-white">{data.risk.residual_assessed}</p>
              {L('com residual', 'with residual')}
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-emerald-300">
              <p className="text-lg font-semibold">{data.risk.residual_improved}</p>
              {L('reduziram nível', 'improved')}
            </div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-red-300">
              <p className="text-lg font-semibold">{data.risk.residual_worsened}</p>
              {L('aumentaram nível', 'worsened')}
            </div>
          </div>
        </section>
      </div>
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{L('Atenção imediata', 'Immediate attention')}</h2>
            <p className="mt-1 text-xs text-slate-500">{L('Itens que pedem decisão, avaliação ou acompanhamento.', 'Items requiring decision, assessment or follow-up.')}</p>
          </div>
          <Link href="/actions" className="text-xs text-blue-400 hover:text-blue-300">{L('Ver ações →', 'View actions →')}</Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">{L('Sem triagem', 'Untriaged')}</p>
            <div className="mt-3 space-y-3">
              {data.attention.untriaged.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block text-sm text-slate-300 hover:text-white">
                  <span className="block truncate font-medium">{event.title}</span>
                  <span className="text-xs text-slate-600">{new Date(event.created_at).toLocaleDateString(pt ? 'pt-BR' : 'en-US')}</span>
                </Link>
              ))}
              {data.attention.untriaged.length === 0 && <p className="text-xs text-slate-600">{L('Fila vazia.', 'Queue clear.')}</p>}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-300">{L('Risco alto/crítico', 'High/critical risk')}</p>
            <div className="mt-3 space-y-3">
              {data.attention.high_risk.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block text-sm text-slate-300 hover:text-white">
                  <span className="block truncate font-medium">{event.title}</span>
                  <span className="text-xs text-slate-600">{event.probability}{event.severity} · {event.risk_level}</span>
                </Link>
              ))}
              {data.attention.high_risk.length === 0 && <p className="text-xs text-slate-600">{L('Nenhum risco alto/crítico registrado.', 'No high/critical risk recorded.')}</p>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-300">{L('Ações vencidas', 'Overdue actions')}</p>
            <div className="mt-3 space-y-3">
              {data.attention.overdue_actions.map((action) => (
                <Link key={action.id} href={action.event_id ? `/events/${action.event_id}` : '/actions'} className="block text-sm text-slate-300 hover:text-white">
                  <span className="block truncate font-medium">{action.title}</span>
                  <span className="text-xs text-slate-600">{action.event_title} · {action.due_date}</span>
                </Link>
              ))}
              {data.attention.overdue_actions.length === 0 && <p className="text-xs text-slate-600">{L('Nenhuma ação vencida.', 'No overdue actions.')}</p>}
            </div>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-white">{L('Tratamento das ações', 'Action treatment')}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-2xl font-bold text-white">{data.actions.open}</p><p className="text-xs text-slate-500">{L('abertas', 'open')}</p></div>
            <div><p className="text-2xl font-bold text-red-300">{data.actions.overdue}</p><p className="text-xs text-slate-500">{L('vencidas', 'overdue')}</p></div>
            <div><p className="text-2xl font-bold text-orange-300">{data.actions.high_or_critical_open}</p><p className="text-xs text-slate-500">{L('alta/crítica', 'high/critical')}</p></div>
            <div><p className="text-2xl font-bold text-emerald-300">{data.actions.completed}</p><p className="text-xs text-slate-500">{L('concluídas', 'completed')}</p></div>
          </div>
        </section>

        <section className="rounded-xl border border-blue-800/50 bg-blue-950/20 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-blue-300" />
            <div>
              <h2 className="text-sm font-semibold text-white">{L('Especialização HFA preservada', 'HFA specialization preserved')}</h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{L('Este painel gerencia o ciclo geral de Safety. A investigação de fatores humanos continua no HFA/SERA, com metodologia, evidência e revisão humana próprias.', 'This dashboard manages the general Safety cycle. Human factors investigation remains in HFA/SERA with its own methodology, evidence and human review.')}</p>
              <Link href="/risk-profile" className="mt-3 inline-block text-xs font-semibold text-blue-300 hover:text-blue-200">{L('Abrir inteligência de fatores humanos →', 'Open human factors intelligence →')}</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
