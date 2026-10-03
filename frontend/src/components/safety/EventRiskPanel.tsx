'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  SAFETY_PROBABILITY_LABELS,
  SAFETY_RISK_MATRIX_PROFILE,
  SAFETY_SEVERITY_LABELS,
  calculateSafetyRisk,
  type SafetyProbability,
  type SafetySeverity,
} from '@/lib/safety/risk'

type RiskAssessment = {
  id: string
  assessment_type: 'INITIAL' | 'RESIDUAL'
  probability: SafetyProbability
  severity: SafetySeverity
  risk_score: number
  risk_level: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO'
  matrix_profile: string
  justification?: string | null
  assessed_at: string
}

type RiskResponse = { matrix_profile: string; assessments: RiskAssessment[] }

type Props = { eventId: string; canEdit: boolean }
const RISK_STYLE: Record<RiskAssessment['risk_level'], string> = {
  BAIXO: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  MEDIO: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  ALTO: 'border-orange-500/30 bg-orange-500/10 text-orange-200',
  CRITICO: 'border-red-500/30 bg-red-500/10 text-red-200',
}

export function EventRiskPanel({ eventId, canEdit }: Props) {
  const [assessments, setAssessments] = useState<RiskAssessment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [assessmentType, setAssessmentType] = useState<'INITIAL' | 'RESIDUAL'>('INITIAL')
  const [probability, setProbability] = useState<SafetyProbability>('C')
  const [severity, setSeverity] = useState<SafetySeverity>(3)
  const [justification, setJustification] = useState('')

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/events/${eventId}/risk`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const json = await res.json().catch(() => ({})) as RiskResponse | { detail?: string; error?: { message?: string } }
      if (!res.ok) {
        const failure = json as { detail?: string; error?: { message?: string } }
        throw new Error(failure.error?.message || failure.detail || 'Falha ao carregar risco')
      }
      setAssessments(Array.isArray((json as RiskResponse).assessments) ? (json as RiskResponse).assessments : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar avaliação de risco.')
    } finally {
      setLoading(false)
    }
  }, [eventId])
  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  const latestInitial = assessments.find((item) => item.assessment_type === 'INITIAL') ?? null
  const latestResidual = assessments.find((item) => item.assessment_type === 'RESIDUAL') ?? null
  const preview = useMemo(() => calculateSafetyRisk(probability, severity), [probability, severity])

  async function saveAssessment() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão inválida.')
      const res = await fetch(`/api/events/${eventId}/risk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessment_type: assessmentType,
          probability,
          severity,
          justification: justification.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({})) as { detail?: string; error?: { message?: string } }
      if (!res.ok) throw new Error(json.error?.message || json.detail || 'Não foi possível salvar a avaliação.')
      setJustification('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a avaliação.')
    } finally {
      setSaving(false)
    }
  }

  function summaryCard(label: string, item: RiskAssessment | null) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {item ? (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[item.risk_level]}`}>
                {item.risk_level}
              </span>
              <span className="text-sm text-slate-300">{item.probability}{item.severity} · score {item.risk_score}</span>
            </div>
            <p className="text-xs text-slate-500">{SAFETY_PROBABILITY_LABELS[item.probability]} × {SAFETY_SEVERITY_LABELS[item.severity]}</p>
            {item.justification && <p className="text-xs leading-relaxed text-slate-400">{item.justification}</p>}
          </div>
        ) : <p className="mt-2 text-sm text-slate-600">Não registrada.</p>}
      </div>
    )
  }
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Avaliação de Risco de Safety</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Matriz 5×5 compatível com o SGSO do AirTrust. A avaliação é uma decisão humana registrada; IA e FRMS não alteram a probabilidade automaticamente.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-2.5 py-1 text-[10px] font-mono text-slate-400">
          {SAFETY_RISK_MATRIX_PROFILE}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {summaryCard('Risco inicial', latestInitial)}
        {summaryCard('Risco residual', latestResidual)}
      </div>

      {loading && <p className="text-xs text-slate-500">Carregando avaliações…</p>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {canEdit && (
        <div className="border-t border-slate-800 pt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs text-slate-400">Tipo</span>
              <select
                value={assessmentType}
                onChange={(e) => setAssessmentType(e.target.value === 'RESIDUAL' ? 'RESIDUAL' : 'INITIAL')}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                <option value="INITIAL">Inicial</option>
                <option value="RESIDUAL">Residual</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Probabilidade</span>
              <select
                value={probability}
                onChange={(e) => setProbability(e.target.value as SafetyProbability)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {(Object.keys(SAFETY_PROBABILITY_LABELS) as SafetyProbability[]).map((key) => (
                  <option key={key} value={key}>{key} — {SAFETY_PROBABILITY_LABELS[key]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Severidade</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value) as SafetySeverity)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {([1, 2, 3, 4, 5] as SafetySeverity[]).map((key) => (
                  <option key={key} value={key}>{key} — {SAFETY_SEVERITY_LABELS[key]}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Prévia:</span>
            <span className={`rounded-full border px-2.5 py-1 font-semibold ${RISK_STYLE[preview.level]}`}>
              {probability}{severity} · {preview.level} · score {preview.score}
            </span>
            <span className="text-slate-600">O servidor recalcula e persiste o resultado.</span>
          </div>
          <label className="block">
            <span className="text-xs text-slate-400">Justificativa da avaliação</span>
            <textarea
              rows={3}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Registre a evidência e o raciocínio usados para escolher probabilidade e severidade."
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
            />
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAssessment()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Registrar avaliação de risco'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
