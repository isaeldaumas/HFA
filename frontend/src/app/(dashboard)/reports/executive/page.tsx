'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PrintReportButton } from '@/components/product/PrintReportButton'
import { supabase } from '@/lib/supabase'
import type { RiskProfileSummary } from '@/lib/risk-profile/types'
import styles from './page.module.css'

type CorrectiveActionRow = {
  id: string
  title: string
  status: string
  due_date?: string | null
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
        if (!profileRes.ok) {
          throw new Error(profileBody?.detail ?? `HTTP ${profileRes.status}`)
        }
        if (!actionsRes.ok) {
          throw new Error((actionsBody as { detail?: string })?.detail ?? `HTTP ${actionsRes.status}`)
        }
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

  return (
    <div className={`p-8 max-w-5xl mx-auto space-y-6 ${styles.reportPage}`}>
      <div className={`${styles.screenOnly} flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4`}>
        <div>
          <h1 className="text-2xl font-bold text-white">Relatório executivo HFA/SERA</h1>
          <p className="text-slate-400 mt-1">Resumo print-friendly para reunião, auditoria ou acompanhamento SGSO/SMS.</p>
        </div>
        <div className="flex gap-2">
          <PrintReportButton />
          <Link href="/dashboard" className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Voltar ao dashboard
          </Link>
        </div>
      </div>

      <article className={`bg-white text-black rounded-lg p-8 shadow ${styles.reportShell}`}>
        <header className="border-b border-slate-300 pb-4 mb-6">
          <h2 className="text-2xl font-bold">Relatório Executivo HFA/SERA</h2>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            Este relatório é apoio à análise técnica. Não substitui investigação humana, validação de Safety Issues formais ou avaliação completa de risco.
          </p>
        </header>

        {loading && <p className={styles.reportText}>Carregando dados reais do tenant...</p>}
        {!loading && error && <p className={styles.reportText}>Dados indisponíveis. Motivo técnico: {error}</p>}

        {!loading && !error && profile && (
          <>
            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>1. Resumo executivo</h3>
              <p className={styles.reportText}>
                A base ativa inclui <strong>{profile.included_events}</strong> eventos considerados no perfil, <strong>{profile.completed_analyses}</strong> análises concluídas, <strong>{profile.source_events_excluded.length}</strong> registros desconsiderados e categoria ERC dominante <strong>{profile.modal_erc_level ? `ERC ${profile.modal_erc_level}` : (profile.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED' || profile.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY' ? 'omitida (D3-b)' : 'n/d')}</strong>.
              </p>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>2. Confiabilidade dos dados</h3>
              <p className={styles.reportText}>
                Nível informado: <strong>{profile.data_confidence.level}</strong>. Base: {profile.data_confidence.valid_erc_count}/{profile.data_confidence.total_analyses} análises com ERC válido.
              </p>
              <ul className={styles.reportList}>
                {profile.data_confidence.messages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>3. Padrões recorrentes</h3>
              <div className="space-y-2">
                {profile.safety_issue_candidates.length > 0 ? profile.safety_issue_candidates.map((candidate) => (
                  <div key={candidate.id} className={styles.reportBox}>
                    <p className="font-semibold">{candidate.label}</p>
                    <p className="text-sm text-slate-700">
                      {candidate.count} ocorrências ({Math.round(candidate.share * 100)}%) - confiança {candidate.confidence}.
                    </p>
                    <p className="text-xs text-slate-600 mt-1">{candidate.caveat}</p>
                  </div>
                )) : (
                  <div className={styles.reportBox}>
                    <p>Dados indisponíveis.</p>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>4. Tendência qualitativa observada</h3>
              <div className="space-y-2">
                {profile.quality_trend.length > 0 ? profile.quality_trend.map((trend) => (
                  <div key={trend.month} className={styles.reportBox}>
                    <p className="font-semibold">{trend.month}</p>
                    <p className="text-sm text-slate-700">
                      Dominante HFA ERC {trend.dominant_hfa_erc_category ?? 'n/d'} | Crítico/alto: {Math.round(trend.critical_or_high_share * 100)}%
                    </p>
                  </div>
                )) : (
                  <div className={styles.reportBox}>
                    <p>Dados indisponíveis.</p>
                  </div>
                )}
              </div>
            </section>

            <section className={styles.reportSection}>
              <h3 className={styles.reportTitle}>5. Ações corretivas</h3>
              <div className="space-y-2">
                {actions.length > 0 ? actions.slice(0, 10).map((action) => (
                  <div key={action.id} className={styles.reportBox}>
                    <p className="font-semibold">{action.title}</p>
                    <p className="text-sm text-slate-700">Status: {action.status}</p>
                    <p className="text-xs text-slate-600 mt-1">{action.due_date ? `Prazo: ${new Date(action.due_date).toLocaleDateString('pt-BR')}` : 'Sem prazo definido'}</p>
                  </div>
                )) : (
                  <div className={styles.reportBox}>
                    <p>Nenhuma ação corretiva registrada.</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </article>
    </div>
  )
}
