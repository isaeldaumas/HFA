'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PrintReportButton } from '@/components/product/PrintReportButton'
import { supabase } from '@/lib/supabase'
import type { RiskProfileSourceEvent, RiskProfileSummary } from '@/lib/risk-profile/types'
import styles from './page.module.css'

type CorrectiveActionRow = {
  id: string
  title: string
  description?: string | null
  status: string
  responsible?: string | null
  due_date?: string | null
  event_id?: string | null
}

const STATUS_LABEL: Record<RiskProfileSourceEvent['status'], string> = {
  received: 'Recebido',
  processing: 'Processando',
  completed: 'Revisado',
  provisional: 'Provisório — revisão pendente',
  error: 'Erro',
  draft: 'Rascunho',
  archived: 'Arquivado',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Não informado'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Não informado' : date.toLocaleDateString('pt-BR')
}

function codeLine(source: RiskProfileSourceEvent): string {
  return [source.perceptionCode, source.objectiveCode, source.actionCode].map((value) => value ?? '—').join(' / ')
}

export default function ExecutiveReportPage() {
  const [profile, setProfile] = useState<RiskProfileSummary | null>(null)
  const [actions, setActions] = useState<CorrectiveActionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      try {
        const [profileRes, actionsRes] = await Promise.all([
          fetch('/api/risk-profile', { headers: { Authorization: `Bearer ${session.access_token}` } }),
          fetch('/api/actions', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        ])
        const profileBody = await profileRes.json().catch(() => null)
        const actionsBody = await actionsRes.json().catch(() => [])
        if (!profileRes.ok) throw new Error(profileBody?.detail ?? `HTTP ${profileRes.status}`)
        if (!actionsRes.ok) throw new Error((actionsBody as { detail?: string })?.detail ?? `HTTP ${actionsRes.status}`)
        setProfile(profileBody as RiskProfileSummary)
        setActions(Array.isArray(actionsBody) ? actionsBody as CorrectiveActionRow[] : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const includedEventIds = useMemo(
    () => new Set((profile?.source_events_included ?? []).map((source) => source.sourceReference ?? source.id)),
    [profile],
  )
  const relevantActions = useMemo(
    () => actions.filter((action) => action.event_id && includedEventIds.has(action.event_id)),
    [actions, includedEventIds],
  )

  return (
    <div className={`p-8 max-w-5xl mx-auto space-y-6 ${styles.reportPage}`}>
      <div className={`${styles.screenOnly} flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4`}>
        <div>
          <h1 className="text-2xl font-bold text-white">Relatório executivo do Perfil de Risco</h1>
          <p className="text-slate-400 mt-1">Leitura didática para gestão, reunião, auditoria e acompanhamento das ações corretivas.</p>
        </div>
        <div className="flex gap-2">
          <PrintReportButton label="Imprimir / salvar PDF" />
          <Link href="/risk-profile" className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Voltar ao Perfil de Risco
          </Link>
        </div>
      </div>

      <article className={`bg-white text-black rounded-lg p-8 shadow ${styles.reportShell}`}>
        <header className="border-b border-slate-300 pb-4 mb-6">
          <h2 className="text-2xl font-bold">Perfil de Risco HFA / SERA</h2>
          <p className="text-sm text-slate-700 mt-1">Relatório executivo consolidado</p>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            O índice HFA apresentado neste documento serve para priorização e acompanhamento. Não é probabilidade de acidente, não substitui avaliação operacional de risco e não deve ser interpretado como ERC/ARMS canônico.
          </p>
        </header>

        {loading && <p className={styles.reportText}>Carregando dados reais do perfil...</p>}
        {!loading && error && <p className={styles.reportText}>Dados indisponíveis. Motivo técnico: {error}</p>}

        {!loading && !error && profile && (
          <>
            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>1. Resumo executivo</h3>
              <div className="grid sm:grid-cols-4 gap-3 mb-3">
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Índice HFA</p><p className="text-2xl font-bold">{profile.score.value}/100</p><p className="text-xs text-slate-600">{profile.score.label}</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Eventos considerados</p><p className="text-2xl font-bold">{profile.included_events}</p><p className="text-xs text-slate-600">de {profile.total_events} no universo</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Revisados</p><p className="text-2xl font-bold">{profile.reviewed_analyses}</p><p className="text-xs text-slate-600">{profile.provisional_analyses} provisório(s)</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Ações corretivas</p><p className="text-2xl font-bold">{profile.actions.open_total}</p><p className="text-xs text-slate-600">{profile.actions.open_overdue} vencida(s)</p></div>
              </div>
              <p className={styles.reportText}>
                O panorama atual combina os padrões P/O/A dos eventos considerados com a situação das ações corretivas vinculadas a esses mesmos eventos e, quando há histórico suficiente, um sinal discreto de aumento recente do volume de eventos. Análises ainda não revisadas entram apenas como sinal provisório e permanecem identificadas separadamente.
              </p>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>2. Principais padrões observados</h3>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  ['Percepção (P)', profile.distribution.perception.top_codes],
                  ['Objetivo (O)', profile.distribution.objective.top_codes],
                  ['Ação (A)', profile.distribution.action.top_codes],
                ].map(([title, values]) => (
                  <div key={String(title)} className={styles.reportBox}>
                    <p className="font-semibold">{String(title)}</p>
                    {(values as Array<{ code: string; count: number }>).length > 0 ? (values as Array<{ code: string; count: number }>).map((item) => (
                      <p key={item.code} className="text-sm text-slate-700 mt-1"><strong>{item.code}</strong> — {item.count} ocorrência(s)</p>
                    )) : <p className="text-sm text-slate-500 mt-1">Sem padrão disponível.</p>}
                  </div>
                ))}
              </div>
              {profile.top_preconditions.length > 0 && (
                <div className="mt-3">
                  <p className="font-semibold text-sm">Pré-condições mais recorrentes</p>
                  <ul className={styles.reportList}>
                    {profile.top_preconditions.slice(0, 5).map((item) => (
                      <li key={item.code}><strong>{item.name}</strong> — {item.count} ocorrência(s), {item.pct}% das análises consideradas.</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>3. Eventos que compõem o perfil</h3>
              <div className="space-y-2">
                {profile.source_events_included.length > 0 ? profile.source_events_included.slice(0, 12).map((source) => (
                  <div key={source.id} className={styles.reportBox}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{source.title}</p>
                        <p className="text-xs text-slate-600">{formatDate(source.occurredAt ?? source.createdAt)} · {STATUS_LABEL[source.status]}</p>
                      </div>
                      <p className="font-mono text-sm font-semibold">{codeLine(source)}</p>
                    </div>
                  </div>
                )) : <div className={styles.reportBox}>Nenhum evento considerado.</div>}
              </div>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>4. Ações corretivas vinculadas aos eventos considerados</h3>
              <div className="grid sm:grid-cols-4 gap-3 mb-3">
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Total vinculadas</p><p className="text-xl font-bold">{profile.actions.total}</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Abertas</p><p className="text-xl font-bold">{profile.actions.open_total}</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Vencidas</p><p className="text-xl font-bold">{profile.actions.open_overdue}</p></div>
                <div className={styles.reportBox}><p className="text-xs text-slate-500">Sem responsável</p><p className="text-xl font-bold">{profile.actions.open_no_owner}</p></div>
              </div>
              <div className="space-y-2">
                {relevantActions.length > 0 ? relevantActions.slice(0, 12).map((action) => (
                  <div key={action.id} className={styles.reportBox}>
                    <p className="font-semibold">{action.title}</p>
                    {action.description && <p className="text-sm text-slate-700 mt-1">{action.description}</p>}
                    <p className="text-xs text-slate-600 mt-1">Status: {action.status} · Responsável: {action.responsible || 'Não definido'} · Prazo: {formatDate(action.due_date)}</p>
                  </div>
                )) : (
                  <div className={styles.reportBox}><p>Nenhuma ação corretiva vinculada aos eventos atualmente considerados no perfil.</p></div>
                )}
              </div>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>5. Recorrência e evolução temporal</h3>
              {profile.top_combinations.length > 0 && (
                <div className="mb-3">
                  <p className="font-semibold text-sm">Combinações P/O/A mais frequentes</p>
                  <ul className={styles.reportList}>
                    {profile.top_combinations.map((item) => <li key={item.pair}><strong>{item.pair}</strong> — {item.count} ocorrência(s), {item.pct}%.</li>)}
                  </ul>
                </div>
              )}
              <div className="space-y-2">
                {profile.trend.length > 0 ? profile.trend.map((point) => (
                  <div key={point.month} className={styles.reportBox}>
                    <p className="font-semibold">{point.month}</p>
                    <p className="text-sm text-slate-700">{point.count} análise(s) considerada(s) no período.</p>
                  </div>
                )) : <div className={styles.reportBox}>Ainda não há série temporal suficiente.</div>}
              </div>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>6. Limitações e cuidados de interpretação</h3>
              <ul className={styles.reportList}>
                {profile.limitations.slice(0, 10).map((message) => <li key={message}>{message}</li>)}
              </ul>
              <p className={styles.reportNote}>
                O ERC numérico consolidado permanece omitido quando o perfil contém análises SERA vNext sem mecanismo ERC canônico validado. Essa contenção evita misturar escalas incompatíveis.
              </p>
            </section>
          </>
        )}
      </article>
    </div>
  )
}
