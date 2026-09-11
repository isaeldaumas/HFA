'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { apiCall, resolveApiUrl } from '@/lib/api'
import FlowStep from '@/components/FlowStep'
import EditableClassification from '@/components/EditableClassification'
import EditHistoryPanel from '@/components/EditHistoryPanel'
import { STEP3_CODES, STEP4_CODES, STEP5_CODES } from '@/data/tutorials'
import { mapToHfacs, type HfacsEntry, type HfacsResult } from '@/lib/sera/hfacs-mapper'
import { useT } from '@/lib/i18n'
import {
  computeHfaErcCategoryFromCodes,
  getArmsSeverityRow,
  getArmsBarrierLevel,
  ARMS_CODE_MATRIX_MECHANISM_ID,
  ARMS_CODE_MATRIX_VERSION,
} from '@/lib/risk-profile/erc'
import { EngineProvenanceBadge, type GeneratedByType, type ValidationStatus } from '@/components/sera/EngineProvenanceBadge'

const FlowDiagram = dynamic(() => import('@/components/FlowDiagram'), { ssr: false })

type FlowTab = 'perception' | 'objective' | 'action'
type PdfState = 'idle' | 'loading' | 'done' | 'error'
type BadgeMap = Record<string, 'preserved' | 'recalculated' | null>
type FlowNodeLike = { justificativa: string; resposta: string; [key: string]: unknown }
type DiscardedFlow = { nos_percorridos?: FlowNodeLike[] }
type Precondition = { code?: string; etapa?: number | string; name?: string; justification?: string }
type Recommendation = { related_code?: string; title?: string; description?: string }
type AnalysisPayload = {
  id: string
  summary?: string | null
  event_summary?: string | null
  event_date?: string | null
  operation_type?: string | null
  event_location?: string | null
  flight_phase?: string | null
  weather_conditions?: string | null
  systems_involved?: string | null
  occupants_count?: string | null
  escape_point?: string | null
  unsafe_agent?: string | null
  unsafe_act?: string | null
  perception_code?: string | null
  perception_name?: string | null
  perception_justification?: string | null
  objective_code?: string | null
  objective_name?: string | null
  objective_justification?: string | null
  action_code?: string | null
  action_name?: string | null
  action_justification?: string | null
  perception_discarded?: DiscardedFlow | null
  objective_discarded?: DiscardedFlow | null
  action_discarded?: DiscardedFlow | null
  preconditions?: Precondition[] | null
  conclusions?: string | null
  recommendations?: Recommendation[] | null
  edit_count?: number | null
  engine_id?: string | null
  motor_version?: string | null
  generated_by_type?: string | null
  validation_status?: string | null
  raw_llm_output?: {
    causal_consistency?: {
      passed?: boolean
      issues?: string[]
      guard_applied?: boolean
    }
  } | null
}
type EventPayload = {
  id: string
  title?: string | null
  status?: string | null
  operation_type?: string | null
  aircraft_type?: string | null
  created_at: string
  occurred_at?: string | null
  deleted_at?: string | null
  recoverable_until?: string | null
  deletion_status?: string | null
  analyses?: AnalysisPayload | null
}
type DeletionImpact = {
  event: number
  legacyAnalyses: number
  vnextAnalyses: number
  revisions: number
  reviews: number
  analysisEvents: number
  auditLogs: number
  evidenceItems: number
  attachments: number
  storageObjects: Array<{ bucket: string; path: string; category: string; exists: boolean }>
  exports: number
  correctiveActionsOpen: number
  correctiveActionsClosed: number
  riskProfileExclusions: number
  relatedEventIds: string[]
  unknownDependencies: string[]
  recoverableDays: number
  purgeEligible: boolean
  purgeBlockers: string[]
}
type FlowItem = {
  mermaid: string
  nos_percorridos: FlowNodeLike[]
  codigo: string
  falhas_descartadas: string
}
type FlowMap = Record<FlowTab, FlowItem>
type RecalculatePayload = {
  analysis?: AnalysisPayload
  steps_recalculated?: number[]
  steps_preserved?: number[]
}

function MetaItem({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-slate-200 truncate">{value}</p>
    </div>
  )
}

type SectionAnchor = { id: string; label: string }

function SectionNav({ anchors }: { anchors: SectionAnchor[] }) {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <nav
      aria-label="Seções da análise"
      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
    >
      {anchors.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => scrollTo(id)}
          className="flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700 transition-colors"
        >
          {label}
        </button>
      ))}
    </nav>
  )
}

// ── Per-event risk computation (ARMS-ERC + ISO severity) ─────────────────────

// ISO severity (1–4) por código de percepção — conceito distinto da matriz ARMS abaixo,
// não duplicado em outro arquivo.
const EV_P_SEVERITY: Record<string, number> = {
  'P-B': 4, 'P-F': 4,
  'P-C': 3, 'P-D': 3, 'P-E': 3, 'P-G': 3,
  'P-H': 2, 'P-A': 1,
}

// A matriz ARMS×código (severidade, matriz 4×4, nível de barreira) vive em
// @/lib/risk-profile/erc.ts (ARMS_CODE_MATRIX_V1). Antes da 3ª etapa da auditoria HFA
// (docs/auditoria-hfa/segunda-etapa/05-auditoria-erc.md) essa matriz estava duplicada aqui
// com uma cópia hardcoded independente — corrigido para importar da fonte única.

type EventRisk = {
  erc: number
  ercLabel: string
  sevLevel: number
  sevLabel: string
  sevKey: 'A' | 'B' | 'C' | 'D'
  barrierKey: 1 | 2 | 3 | 4
  mechanismId: string
  mechanismVersion: string
}

function computeEventRisk(
  p: string | null, o: string | null, a: string | null
): EventRisk | null {
  if (!p) return null
  const sevKey  = getArmsSeverityRow(p)
  const barrier = getArmsBarrierLevel(p, o, a)
  const erc     = computeHfaErcCategoryFromCodes(p, o, a) ?? 2
  const sevLevel = EV_P_SEVERITY[p] ?? 3
  const ercLabels: Record<number, string> = {
    5: 'Ação imediata obrigatória',
    4: 'Urgente — ação em 24–48h',
    3: 'Ação corretiva requerida',
    2: 'Monitorar — sem ação imediata',
    1: 'Aceitável',
  }
  const sevLabels: Record<number, string> = {
    4: 'Grave', 3: 'Moderada', 2: 'Menor', 1: 'Negligível',
  }
  return {
    erc, ercLabel: ercLabels[erc] ?? '',
    sevLevel, sevLabel: sevLabels[sevLevel] ?? 'Moderada',
    sevKey: sevKey as 'A' | 'B' | 'C' | 'D',
    barrierKey: barrier,
    mechanismId: ARMS_CODE_MATRIX_MECHANISM_ID,
    mechanismVersion: ARMS_CODE_MATRIX_VERSION,
  }
}

const ERC_STYLE: Record<number, { bg: string; border: string; text: string; bar: string }> = {
  5: { bg: 'bg-red-950',    border: 'border-red-800',    text: 'text-red-400',    bar: 'bg-red-500' },
  4: { bg: 'bg-orange-950', border: 'border-orange-800', text: 'text-orange-400', bar: 'bg-orange-500' },
  3: { bg: 'bg-yellow-950', border: 'border-yellow-800', text: 'text-yellow-400', bar: 'bg-yellow-500' },
  2: { bg: 'bg-slate-900',  border: 'border-slate-700',  text: 'text-slate-400',  bar: 'bg-slate-500' },
  1: { bg: 'bg-green-950',  border: 'border-green-800',  text: 'text-green-400',  bar: 'bg-green-500' },
}

const BARRIER_LABELS: Record<number, string> = {
  1: 'ausentes', 2: 'mínimas', 3: 'limitadas', 4: 'efetivas',
}

function EventRiskCard({ risk }: { risk: EventRisk }) {
  const s = ERC_STYLE[risk.erc] ?? ERC_STYLE[2]
  return (
    <div className={`${s.bg} ${s.border} border rounded-xl p-4 space-y-3`}>
      <div className="flex flex-wrap items-start gap-4">
        {/* ERC number */}
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">ARMS-ERC</span>
          <span className={`text-3xl font-bold leading-none ${s.text}`}>{risk.erc}</span>
          <span className="text-[9px] text-slate-600 mt-0.5">de 5</span>
        </div>
        {/* Separador */}
        <div className="w-px self-stretch bg-slate-800" />
        {/* Detalhe */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${s.text} mb-1`}>{risk.ercLabel}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span>Severidade {risk.sevKey} — {risk.sevLabel}</span>
            <span>·</span>
            <span>Barreiras {BARRIER_LABELS[risk.barrierKey]}</span>
            <span>·</span>
            <span>ISO nível {risk.sevLevel}/4</span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden w-full max-w-xs">
            <div
              className={`h-full rounded-full ${s.bar}`}
              style={{ width: `${(risk.erc / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-600 border-t border-slate-800/60 pt-2">
        Nível de risco estimado com base nas evidências disponíveis. Escala HFA 1–5 adaptada do ARMS/ERC (EASA, 2010) — não é o índice ARMS canônico (1–2500). Revise a classificação antes de aprovar o relatório formal.
      </p>
      <p className="text-[10px] text-slate-700">
        Mecanismo: {risk.mechanismId} {risk.mechanismVersion} — estimativa heurística não validada, não canônica (decisão D3 pendente).
      </p>
    </div>
  )
}

function HfacsSection({ hfacs }: { hfacs: HfacsResult }) {
  const t = useT()

  const levels: { key: keyof HfacsResult; labelKey: string; color: string }[] = [
    { key: 'nivel1_unsafe_acts',   labelKey: 'hfacs.level1', color: 'border-red-700/50 bg-red-950/20' },
    { key: 'nivel2_preconditions', labelKey: 'hfacs.level2', color: 'border-orange-700/50 bg-orange-950/20' },
    { key: 'nivel3_supervision',   labelKey: 'hfacs.level3', color: 'border-yellow-700/50 bg-yellow-950/20' },
    { key: 'nivel4_organization',  labelKey: 'hfacs.level4', color: 'border-purple-700/50 bg-purple-950/20' },
  ]

  const hasAny = levels.some((l) => hfacs[l.key].length > 0)
  if (!hasAny) return null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-3 bg-slate-800 border-b border-slate-700 flex items-center gap-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {t('hfacs.title')}
        </span>
        <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 px-1.5 py-0.5 rounded">
          {t('hfacs.bonus')}
        </span>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">{t('hfacs.subtitle')}</p>
        {levels.map(({ key, labelKey, color }) => {
          const entries: HfacsEntry[] = hfacs[key]
          if (entries.length === 0) return null
          return (
            <div key={key} className={`border rounded-xl p-4 ${color}`}>
              <p className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                {t(labelKey)}
              </p>
              <div className="space-y-3">
                {entries.map((item, i) => (
                  <div key={i} className="bg-slate-900/50 rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                        {item.codigo_sera_origem}
                      </span>
                      <span className="text-xs text-slate-400">{t('hfacs.origin')}</span>
                      <span className="mx-1 text-slate-600">→</span>
                      <span className="text-xs font-semibold text-slate-200">
                        {t(item.categoria_key)}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-xs text-slate-300">
                        {t(item.subcategoria_key)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {item.justificativa_pt}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <p className="text-xs text-slate-600 pt-1">{t('hfacs.note')}</p>
        <p className="text-xs text-slate-600">{t('hfacs.reference')}</p>
      </div>
    </div>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const searchParams = useSearchParams()
  const [event, setEvent]         = useState<EventPayload | null>(null)
  const [analysis, setAnalysis]   = useState<AnalysisPayload | null>(null)
  const [token, setToken]         = useState<string>('')
  const [loading, setLoading]     = useState(true)
  const [flows, setFlows]         = useState<FlowMap | null>(null)
  const [activeTab, setActiveTab] = useState<FlowTab>('perception')
  const [pdfState, setPdfState]   = useState<PdfState>('idle')
  const [badges, setBadges]       = useState<BadgeMap>({})
  const [actionStates, setActionStates] = useState<Record<number, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [canManageDelete, setCanManageDelete] = useState(false)
  const [deletionBusy, setDeletionBusy] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpact | null>(null)
  const [deletionModalOpen, setDeletionModalOpen] = useState(false)
  const [deletionReason, setDeletionReason] = useState('')
  const [deletionConfirmationTitle, setDeletionConfirmationTitle] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setToken(session.access_token)
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setCanManageDelete(Boolean(me.is_admin) || String(me.role ?? '').toLowerCase() === 'admin')
        } else {
          setCanManageDelete(false)
        }
      } catch (error) {
        console.error('Falha ao carregar /api/auth/me para permissões de UI', error)
        setCanManageDelete(false)
      }
      const scope = searchParams?.get('scope') === 'deleted' ? 'deleted' : 'active'
      const data = await apiCall(`/events/${id}?scope=${scope}`, {}, session.access_token) as EventPayload
      setEvent(data)
      if (data?.analyses) setAnalysis(data.analyses)
      setLoading(false)

      if (data?.analyses?.id) {
        try {
          const flowData = await apiCall(`/analyses/${data.analyses.id}/flows`, {}, session.access_token) as FlowMap
          setFlows(flowData)
        } catch { /* flows are optional */ }
      }
    }
    load()
    const interval = setInterval(() => {
      // Only auto-refresh while processing
      if (event?.status === 'processing') load()
    }, 5000)
    return () => clearInterval(interval)
  }, [event?.status, id, searchParams])

  const handleRecalculated = useCallback((data: RecalculatePayload) => {
    if (!data?.analysis) return
    setAnalysis(data.analysis)

    // Apply badges based on recalculate result
    const stepMap: Record<number, string> = { 3: 'perception', 4: 'objective', 5: 'action' }
    const newBadges: BadgeMap = {}
    data.steps_recalculated?.forEach((s: number) => {
      if (stepMap[s]) newBadges[stepMap[s]] = 'recalculated'
    })
    data.steps_preserved?.forEach((s: number) => {
      if (stepMap[s]) newBadges[stepMap[s]] = 'preserved'
    })
    setBadges(newBadges)

    // Clear badges after 8s
    setTimeout(() => setBadges({}), 8000)
  }, [])

  const downloadPdf = useCallback(async () => {
    if (!analysis || !token || !event) return
    setPdfState('loading')
    try {
      const analysisId = analysis.id
      const res = await fetch(resolveApiUrl(`/analyses/${analysisId}/pdf`), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.text()
        console.error('PDF response error:', res.status, body)
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date(event.created_at).toISOString().slice(0, 10)
      const name = (event.title ?? 'evento').replace(/\s+/g, '-').slice(0, 40)
      a.href     = url
      a.download = `SERA_${name}_${date}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setPdfState('done')
      setTimeout(() => setPdfState('idle'), 3000)
    } catch (err) {
      console.error('PDF error:', err)
      setPdfState('error')
      setTimeout(() => setPdfState('idle'), 3000)
    }
  }, [event, analysis, token])

  async function createAction(index: number, r: Recommendation, analysisId: string) {
    setActionStates((prev) => ({ ...prev, [index]: 'loading' }))
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          analysis_id: analysisId,
          title: r.title ?? 'Ação corretiva/preventiva',
          description: r.description ?? null,
          related_failure: r.related_code ?? null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>
        throw new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`)
      }
      setActionStates((prev) => ({ ...prev, [index]: 'done' }))
    } catch {
      setActionStates((prev) => ({ ...prev, [index]: 'error' }))
    }
  }

  async function deleteEventFromDetail() {
    if (!token || !event?.title || event.deleted_at) return
    setDeletionBusy(true)
    setDeletionError(null)
    setDeletionImpact(null)
    setDeletionReason('')
    setDeletionConfirmationTitle('')
      setDeletionModalOpen(true)
    try {
      const impactResponse = await fetch(`/api/events/${event.id}/deletion-impact`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const impact = await impactResponse.json().catch(() => ({})) as DeletionImpact
      if (!impactResponse.ok) throw new Error('Não foi possível calcular o impacto da exclusão.')
      setDeletionImpact(impact)
    } catch (error) {
      setDeletionError(error instanceof Error ? error.message : 'Não foi possível calcular o impacto da exclusão.')
    } finally {
      setDeletionBusy(false)
    }
  }

  async function confirmDeleteFromDetail() {
    if (!token || !event?.title || !deletionReason.trim() || deletionConfirmationTitle.trim() !== event.title) return
    setDeletionBusy(true)
    setDeletionError(null)
    try {
      const response = await fetch(`/api/events/${event.id}/delete-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: deletionReason.trim(), confirmationTitle: deletionConfirmationTitle.trim() }),
      })
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível excluir o evento.')
      window.location.assign('/events/deleted')
    } catch (error) {
      setDeletionError(error instanceof Error ? error.message : 'Não foi possível excluir o evento.')
    } finally {
      setDeletionBusy(false)
    }
  }

  async function restoreEventFromDetail() {
    if (!token || !event?.deleted_at) return
    setDeletionBusy(true)
    setDeletionError(null)
    try {
      const response = await fetch(`/api/events/${event.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? 'Não foi possível restaurar o evento.')
      window.location.assign('/events')
    } catch (error) {
      setDeletionError(error instanceof Error ? error.message : 'Não foi possível restaurar o evento.')
    } finally {
      setDeletionBusy(false)
    }
  }

  if (loading) return <div className="p-8 text-slate-400">Carregando...</div>
  if (!event)  return <div className="p-8 text-slate-400">Evento não encontrado</div>

  const pdfLabel: Record<PdfState, string> = {
    idle:    '⬇ Baixar PDF',
    loading: 'Gerando PDF…',
    done:    'PDF gerado ✓',
    error:   'Erro no PDF',
  }

  const tabLabels: Record<FlowTab, string> = {
    perception: `Percepção ${flows?.perception?.codigo ?? ''}`,
    objective:  `Objetivo ${flows?.objective?.codigo ?? ''}`,
    action:     `Ação ${flows?.action?.codigo ?? ''}`,
  }

  const summaryText = analysis?.summary || analysis?.event_summary || null

  // Flow path helpers
  const perceptionFlow = analysis?.perception_discarded?.nos_percorridos ?? []
  const objectiveFlow  = analysis?.objective_discarded?.nos_percorridos  ?? []
  const actionFlow     = analysis?.action_discarded?.nos_percorridos     ?? []
  const preconditions = analysis?.preconditions ?? []
  const recommendations = analysis?.recommendations ?? []
  const causalConsistency = analysis?.raw_llm_output?.causal_consistency ?? null
  const causalConsistencyFailed = causalConsistency?.passed === false

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {deletionModalOpen && event.title && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(clickEvent) => {
            if (clickEvent.target === clickEvent.currentTarget) setDeletionModalOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-delete-event-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl"
            onClick={(clickEvent) => clickEvent.stopPropagation()}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Escape') setDeletionModalOpen(false)
              if (keyEvent.key !== 'Tab') return
              const controls = Array.from(keyEvent.currentTarget.querySelectorAll<HTMLElement>('button, textarea, input, [href], [tabindex]:not([tabindex="-1"])'))
                .filter((control) => !control.hasAttribute('disabled'))
              if (controls.length === 0) return
              const first = controls[0]
              const last = controls[controls.length - 1]
              if (keyEvent.shiftKey && document.activeElement === first) {
                keyEvent.preventDefault()
                last.focus()
              } else if (!keyEvent.shiftKey && document.activeElement === last) {
                keyEvent.preventDefault()
                first.focus()
              }
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-red-300">Excluir evento e dados relacionados</p>
                <h2 id="detail-delete-event-title" className="mt-2 text-xl font-semibold text-white">{event.title}</h2>
                <p className="mt-2 text-sm text-slate-400">
                  O evento sairá da operação ativa e permanecerá recuperável por {deletionImpact?.recoverableDays ?? 30} dias.
                </p>
              </div>
              <button type="button" onClick={() => setDeletionModalOpen(false)} className="text-slate-500 hover:text-white">Fechar</button>
            </div>

            {deletionError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{deletionError}</div>
            )}

            <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">Legacy: <strong>{deletionImpact?.legacyAnalyses ?? '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">vNext: <strong>{deletionImpact?.vnextAnalyses ?? '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">Revisões: <strong>{deletionImpact?.revisions ?? '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">Reviews: <strong>{deletionImpact?.reviews ?? '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">Anexos/storage: <strong>{deletionImpact ? `${deletionImpact.attachments}/${deletionImpact.storageObjects.length}` : '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300">Perfil de Risco: <strong>{deletionImpact?.riskProfileExclusions ?? '-'}</strong></div>
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-slate-300 sm:col-span-3">
                Ações corretivas: <strong>{deletionImpact ? `${deletionImpact.correctiveActionsOpen} abertas / ${deletionImpact.correctiveActionsClosed} encerradas` : '-'}</strong>
              </div>
            </div>

            {deletionImpact && (deletionImpact.purgeBlockers.length > 0 || deletionImpact.unknownDependencies.length > 0) && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="font-semibold">Bloqueios e dependências desconhecidas</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {[...deletionImpact.purgeBlockers, ...deletionImpact.unknownDependencies].map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Motivo da exclusão</span>
                <textarea
                  autoFocus
                  value={deletionReason}
                  onChange={(changeEvent) => setDeletionReason(changeEvent.target.value)}
                  className="min-h-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-200">Digite o título do evento para confirmar</span>
                <input
                  value={deletionConfirmationTitle}
                  onChange={(changeEvent) => setDeletionConfirmationTitle(changeEvent.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-red-400"
                  placeholder="Título exato do evento"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setDeletionModalOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancelar</button>
              <button
                type="button"
                onClick={() => void confirmDeleteFromDetail()}
                disabled={deletionBusy || !deletionImpact || !deletionReason.trim() || deletionConfirmationTitle.trim() !== event.title}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletionBusy ? 'Excluindo...' : 'Excluir e iniciar período de recuperação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {event.deleted_at && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Evento em recuperação até {event.recoverable_until ? new Date(event.recoverable_until).toLocaleString('pt-BR') : 'prazo indisponível'}.
          Ele não aparece em listas ativas, dashboard ou Perfil de Risco.
        </div>
      )}
      {deletionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {deletionError}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">{event.title}</h1>
          <p className="text-slate-400 text-sm">
            {event.operation_type} • {event.aircraft_type} •{' '}
            {new Date(event.created_at).toLocaleDateString('pt-BR')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {canManageDelete && !event.deleted_at && (
            <button
              type="button"
              onClick={() => void deleteEventFromDetail()}
              disabled={deletionBusy}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/20 disabled:opacity-50"
            >
              {deletionBusy ? 'Calculando impacto...' : 'Excluir evento'}
            </button>
          )}
          {canManageDelete && !!event.deleted_at && event.deletion_status !== 'PURGED' && (
            <button
              type="button"
              onClick={() => void restoreEventFromDetail()}
              disabled={deletionBusy}
              className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-200 hover:bg-green-500/20 disabled:opacity-50"
            >
              {deletionBusy ? 'Restaurando...' : 'Restaurar evento'}
            </button>
          )}
          <a
            href={`/reports/event/${event.id}${event.deleted_at ? '?scope=deleted' : ''}`}
            className="text-sm px-4 py-2 rounded-lg transition font-medium bg-slate-800 hover:bg-slate-700 text-white"
          >
            Relatorio do evento
          </a>
          {analysis && (
            <button
              onClick={downloadPdf}
              disabled={pdfState === 'loading'}
              className={`text-sm px-4 py-2 rounded-lg transition font-medium ${
                pdfState === 'done'    ? 'bg-emerald-700 text-white' :
                pdfState === 'error'  ? 'bg-red-700 text-white' :
                pdfState === 'loading'? 'bg-slate-600 text-slate-400 cursor-wait' :
                'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {pdfLabel[pdfState]}
            </button>
          )}
          {event.status === 'processing' && (
            <div className="bg-blue-600/20 text-blue-400 border border-blue-600/30 px-4 py-2 rounded-lg text-sm animate-pulse">
              ⏳ Analisando...
            </div>
          )}
        </div>
      </div>

      {/* Pending / processing state */}
      {!analysis && event.status !== 'completed' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <p className="text-slate-400">
            {event.status === 'processing'
              ? 'Análise em andamento. A página atualiza automaticamente.'
              : 'Análise pendente.'}
          </p>
        </div>
      )}

      {analysis && (
        <>
          {/* Section jump nav */}
          <SectionNav anchors={[
            { id: 'etapa-1', label: 'Resumo' },
            { id: 'etapa-2', label: 'Ponto de Fuga' },
            { id: 'etapas-3-5', label: 'Falhas Ativas' },
            ...(flows ? [{ id: 'fluxo', label: 'Fluxo de Decisão' }] : []),
            ...(preconditions.length > 0 ? [{ id: 'preconditions', label: 'Pré-condições' }] : []),
            { id: 'etapa-6', label: 'Conclusão' },
            ...(recommendations.length > 0 ? [{ id: 'etapa-7', label: 'Recomendações' }] : []),
          ]} />

          {/* ── Mini-card de risco por evento ─────────────────────────── */}
          {(() => {
            if (causalConsistencyFailed) {
              return (
                <div className="bg-amber-950 border border-amber-800 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-amber-300">
                    Risk layer not validated — causal analysis requires review.
                  </p>
                  <p className="text-xs text-amber-200/80">
                    Camada de risco/ERC suprimida nesta análise devido a inconsistência causal detectada nos códigos/conclusão.
                  </p>
                </div>
              )
            }
            const risk = computeEventRisk(
              analysis.perception_code ?? null,
              analysis.objective_code  ?? null,
              analysis.action_code     ?? null,
            )
            return risk ? (
              <div className="space-y-2">
                <EventRiskCard risk={risk} />
                <EngineProvenanceBadge
                  engineId={analysis.engine_id}
                  engineVersion={analysis.motor_version}
                  generatedByType={analysis.generated_by_type as GeneratedByType}
                  validationStatus={analysis.validation_status as ValidationStatus}
                />
              </div>
            ) : null
          })()}

          {/* Edit history banner */}
          {analysis.id && token && (
            <EditHistoryPanel
              analysisId={analysis.id}
              token={token}
              editCount={analysis.edit_count || 0}
              onReverted={(payload) => handleRecalculated(payload as RecalculatePayload)}
            />
          )}

          {/* ── ETAPA 1 — Resumo do Evento ───────────────────────────── */}
          <div id="etapa-1" className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-6 py-3 bg-slate-700/50 border-b border-slate-700">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Etapa 1 — Resumo do Evento
              </span>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-700">
                <MetaItem
                  label="Data do evento"
                  value={analysis.event_date
                    || (event.occurred_at ? new Date(event.occurred_at).toLocaleDateString('pt-BR') : null)
                    || new Date(event.created_at).toLocaleDateString('pt-BR')}
                />
                <MetaItem label="Tipo de operação"    value={analysis.operation_type || event.operation_type} />
                <MetaItem label="Sistema / tipo"      value={event.aircraft_type} />
                <MetaItem label="Local"               value={analysis.event_location} />
                <MetaItem label="Fase do voo"         value={analysis.flight_phase} />
                <MetaItem label="Cond. meteorológicas" value={analysis.weather_conditions} />
                <MetaItem label="Sistemas envolvidos"  value={analysis.systems_involved} />
                <MetaItem label="Ocupantes"            value={analysis.occupants_count} />
              </div>
              {summaryText ? (
                <p className="text-slate-200 leading-relaxed text-sm sm:text-base">{summaryText}</p>
              ) : (
                <p className="text-slate-500 text-sm italic">
                  Resumo narrativo gerado pela IA estará disponível nas próximas análises.
                </p>
              )}
            </div>
          </div>

          {/* ── ETAPA 2 — Ponto de Fuga ───────────────────────────────── */}
          <div id="etapa-2" className="bg-amber-950 border border-amber-700 rounded-xl overflow-hidden">
            <div className="px-6 py-3 bg-amber-900/40 border-b border-amber-800">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                Etapa 2 — Ponto de Fuga da Operação Segura
              </span>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-200 text-sm sm:text-base leading-relaxed">
                {analysis.escape_point}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-amber-900/40 rounded-lg p-3">
                  <p className="text-xs text-amber-400 mb-1">Agente</p>
                  <p className="text-sm text-slate-200">{analysis.unsafe_agent}</p>
                </div>
                <div className="bg-amber-900/40 rounded-lg p-3">
                  <p className="text-xs text-amber-400 mb-1">Ato Inseguro</p>
                  <p className="text-sm text-slate-200">{analysis.unsafe_act}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── ETAPAS 3 / 4 / 5 — Editable failure classifications ──── */}
          <div id="etapas-3-5">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Etapas 3 · 4 · 5 — Falhas Ativas
              <span className="ml-2 normal-case text-slate-600 font-normal">(clique &quot;Editar&quot; para recalcular)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <EditableClassification
                code={analysis.perception_code ?? ''}
                name={analysis.perception_name ?? ''}
                justification={analysis.perception_justification ?? ''}
                flowPath={perceptionFlow}
                stepAltered="3"
                field="perception_code"
                availableCodes={STEP3_CODES}
                analysisId={analysis.id}
                token={token}
                badge={badges['perception'] ?? null}
                onUpdated={(payload) => handleRecalculated(payload as RecalculatePayload)}
              />
              <EditableClassification
                code={analysis.objective_code ?? ''}
                name={analysis.objective_name ?? ''}
                justification={analysis.objective_justification ?? ''}
                flowPath={objectiveFlow}
                stepAltered="4"
                field="objective_code"
                availableCodes={STEP4_CODES}
                analysisId={analysis.id}
                token={token}
                badge={badges['objective'] ?? null}
                onUpdated={(payload) => handleRecalculated(payload as RecalculatePayload)}
              />
              <EditableClassification
                code={analysis.action_code ?? ''}
                name={analysis.action_name ?? ''}
                justification={analysis.action_justification ?? ''}
                flowPath={actionFlow}
                stepAltered="5"
                field="action_code"
                availableCodes={STEP5_CODES}
                analysisId={analysis.id}
                token={token}
                badge={badges['action'] ?? null}
                onUpdated={(payload) => handleRecalculated(payload as RecalculatePayload)}
              />
            </div>
          </div>

          {/* ── Fluxo de Decisão SERA ──────────────────────────────────── */}
          {flows && (
            <div id="fluxo" className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <h2 className="text-lg font-semibold text-white mb-4">Fluxo de Decisão SERA</h2>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap mb-6">
                {(['perception', 'objective', 'action'] as FlowTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition ${
                      activeTab === tab
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {tabLabels[tab]}
                  </button>
                ))}
              </div>
              <FlowDiagram chart={flows[activeTab].mermaid} id={activeTab} />
              <FlowStep
                nos={flows[activeTab].nos_percorridos}
                codigo={flows[activeTab].codigo}
                falhasDescartadas={flows[activeTab].falhas_descartadas}
              />
            </div>
          )}

          {/* ── Pré-condições ──────────────────────────────────────────── */}
          {preconditions.length > 0 && (
            <div id="preconditions" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Pré-condições Identificadas
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {preconditions.map((p: Precondition, i: number) => (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                          {p.code}
                        </span>
                        {p.etapa && (
                          <span className="text-xs text-slate-500">Etapa {p.etapa}</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-200 mb-1">{p.name}</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{p.justification}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── ETAPA 6 — Conclusões ───────────────────────────────────── */}
          <div id="etapa-6" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Etapa 6 — Conclusão da Análise
              </span>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-200 leading-relaxed text-sm sm:text-base">{analysis.conclusions}</p>
              <p className="text-xs text-slate-600 border-t border-slate-800 pt-3">
                Esta conclusão é gerada com apoio de IA com base na evidência disponível no relato. O investigador deve revisar, complementar e validar antes de qualquer encaminhamento formal.
              </p>
            </div>
          </div>

          {/* ── ETAPA 7 — Recomendações ────────────────────────────────── */}
          {recommendations.length > 0 && (
            <div id="etapa-7" className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-6 py-3 bg-slate-800 border-b border-slate-700">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Etapa 7 — Ações de Mitigação e Prevenção
                </span>
              </div>
              <div className="p-6 space-y-3">
                {recommendations.map((r: Recommendation, i: number) => {
                  const aState = actionStates[i] ?? 'idle'
                  return (
                    <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <span className="flex-shrink-0 text-xs font-mono bg-blue-900 text-blue-300 px-2 py-1 rounded self-start">
                          {r.related_code}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-200 mb-1">{r.title}</p>
                          <p className="text-sm text-slate-400 leading-relaxed">{r.description}</p>
                        </div>
                      </div>
                      {analysis?.id && (
                        <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between gap-3">
                          <span className={
                            aState === 'done'  ? 'text-xs text-green-400' :
                            aState === 'error' ? 'text-xs text-red-400' :
                            'text-xs text-slate-600'
                          }>
                            {aState === 'done'  ? 'Ação criada — revisável em Ações Corretivas' :
                             aState === 'error' ? 'Erro ao criar. Tente novamente.' :
                             'Transforme esta recomendação em uma ação rastreável.'}
                          </span>
                          {aState === 'done' ? (
                            <a
                              href="/actions"
                              className="shrink-0 text-xs font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Ver ações →
                            </a>
                          ) : (
                            <button
                              disabled={aState === 'loading'}
                              onClick={() => createAction(i, r, analysis.id)}
                              className={aState === 'loading'
                                ? 'shrink-0 text-xs font-medium text-slate-500 border border-slate-700 px-3 py-1.5 rounded-lg cursor-wait'
                                : 'shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-3 py-1.5 rounded-lg transition-colors'}
                            >
                              {aState === 'loading' ? 'Criando…' : 'Criar ação corretiva'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <p className="text-xs text-slate-600">
                    Ações corretivas/preventivas criadas aqui ficam disponíveis para acompanhamento na lista de ações.
                  </p>
                  <a
                    href="/actions"
                    className="shrink-0 ml-4 text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Ver todas as ações →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── HFACS — Classificação Bônus ────────────────────────────── */}
          {causalConsistencyFailed ? (
            <div className="bg-amber-950 border border-amber-800 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-300">
                Mapeamento HFACS suprimido por inconsistência causal.
              </p>
              <p className="text-xs text-amber-200/80">
                A classificação HFACS automática volta a ser exibida após revisão humana e consistência causal validada.
              </p>
            </div>
          ) : (
            (analysis.perception_code || analysis.objective_code || analysis.action_code) && (
              <HfacsSection
                hfacs={mapToHfacs({
                  perception: analysis.perception_code,
                  objective: analysis.objective_code,
                  action: analysis.action_code,
                })}
              />
            )
          )}
        </>
      )}
    </div>
  )
}
