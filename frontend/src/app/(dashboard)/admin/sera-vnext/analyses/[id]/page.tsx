'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Archive, Download, Lock, RefreshCw, RotateCcw, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { SeraReviewerOutput, SeraReviewerAxisCard, SeraReviewerPreconditionCard } from '@/lib/sera-vnext-product/reviewer-output'
import GuardrailPanel from '@/components/sera/GuardrailPanel'

const betaUiEnabled = process.env.NEXT_PUBLIC_SERA_VNEXT_PRODUCT_BETA_UI_ENABLED?.trim().toLowerCase() === 'true'

type DetailPayload = {
  analysis: {
    id: string
    title: string
    narrative: string
    status: string
    review_status: string
    engine_version: string
    methodology_version: string
    baseline_id: string
    fixture_set_id: string
    current_revision: number
    warnings: string[]
    uncertainties: string[]
    limitations: string[]
    engine_output: {
      selectedCode: null
      releasedCode: null
      finalConclusion: null
      classifiedOutput: false
      readyPromotion: false
      downstreamAllowed: false
    }
  }
  revisions: Array<{ id: string; revision_number: number; created_at: string; reason: string; engine_output_hash: string }>
  reviews: Array<{ id: string; created_at: string; decision: string; review_notes: string | null }>
  events: Array<{ id: string; created_at: string; event_type: string; from_status: string | null; to_status: string | null }>
  locks: Record<string, unknown>
  reviewerOutput?: SeraReviewerOutput
}

export default function SeraVNextAnalysisDetailPage() {
  const params = useParams<{ id: string }>()
  const [payload, setPayload] = useState<DetailPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function authFetch(path: string, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new Error('Sessão ausente')
    return fetch(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
        'x-request-id': crypto.randomUUID(),
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    })
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await authFetch(`/api/admin/sera-vnext/analyses/${params.id}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json.detail ?? 'Falha ao carregar análise.'))
      setPayload(json as DetailPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar análise.')
    } finally {
      setLoading(false)
    }
  }

  async function postAction(action: 'archive' | 'restore' | 'reanalyze') {
    setError('')
    try {
      const res = await authFetch(`/api/admin/sera-vnext/analyses/${params.id}/${action}`, { method: 'POST', body: JSON.stringify({ reason: action }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json.detail ?? `Falha em ${action}.`))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Falha em ${action}.`)
    }
  }

  async function exportJson() {
    try {
      const res = await authFetch(`/api/admin/sera-vnext/analyses/${params.id}/export`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json.detail ?? 'Falha ao exportar.'))
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `sera-vnext-beta-${params.id}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar.')
    }
  }


  async function exportPdf() {
    try {
      const res = await authFetch(`/api/admin/sera-vnext/analyses/${params.id}/pdf`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(String(json.detail ?? 'Falha ao exportar PDF.'))
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename="?([^";]+)"?/i)
      const filename = match?.[1] ?? `hfa-sera-${params.id}.pdf`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao exportar PDF.')
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (betaUiEnabled) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  if (!betaUiEnabled) return <div className="p-8 text-slate-300"><Lock className="mb-3 size-5" /> Product Beta UI disabled.</div>
  const analysis = payload?.analysis
  const ro = payload?.reviewerOutput

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/sera-vnext/analyses" className="text-cyan-300 hover:text-cyan-200">
          ← Voltar à lista
        </Link>
        <Link href="/dashboard" className="text-slate-400 hover:text-slate-200">
          Ir ao dashboard
        </Link>
      </div>

      {/* Non-final banner */}
      <div className="rounded-2xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-100">
        <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" /> Resultado candidate-only não final.</div>
        <p className="mt-1">Exige revisão humana e não representa classificação SERA liberada. selectedCode, releasedCode, finalConclusion, CLASSIFIED, READY e downstream permanecem bloqueados.</p>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Detalhe auditável</p>
          <h1 className="mt-2 text-3xl font-bold text-white">{analysis?.title ?? 'Análise'}</h1>
          <p className="mt-2 text-sm text-slate-400">{analysis?.status ?? '...'} · {analysis?.review_status ?? '...'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/sera-vnext/analyses/${params.id}/review`} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">Revisar</Link>
          <button type="button" onClick={() => void postAction('reanalyze')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"><RefreshCw className="size-4" /> Reanalisar</button>
          <button type="button" onClick={() => void postAction(analysis?.status === 'ARCHIVED' ? 'restore' : 'archive')} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200">{analysis?.status === 'ARCHIVED' ? <RotateCcw className="size-4" /> : <Archive className="size-4" />} {analysis?.status === 'ARCHIVED' ? 'Restaurar' : 'Arquivar'}</button>
          <button type="button" onClick={() => void exportPdf()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-800 bg-cyan-950/20 px-4 py-2 text-sm text-cyan-200"><Download className="size-4" /> Baixar PDF completo</button>
          <button type="button" onClick={() => void exportJson()} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"><Download className="size-4" /> Export JSON</button>
        </div>
      </div>

      {loading && <div className="text-sm text-slate-400">Carregando...</div>}
      {error && <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}

      {analysis && (
        <>
          {/* Seção 1 — Resumo para revisão */}
          <ReviewSection label="1. Resumo para revisão">
            <p className="text-sm text-slate-300">{ro?.summary.headline ?? analysis.title}</p>
            {ro?.summary.overallUsefulnessWarning && (
              <div className="mt-3 rounded-xl border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                {ro.summary.overallUsefulnessWarning}
              </div>
            )}
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <InfoCard title="Versões" lines={[`engine ${analysis.engine_version}`, analysis.methodology_version, analysis.baseline_id]} />
              <InfoCard title="Status" lines={[analysis.status, analysis.review_status, `rev ${analysis.current_revision}`]} />
              <InfoCard title="Locks ativos" lines={['selectedCode: null', 'releasedCode: null', 'finalConclusion: null']} />
            </div>
            <p className="mt-3 text-xs text-amber-400">{ro?.summary.nonFinalNotice}</p>
          </ReviewSection>

          {/* Seção 2 — Ponto de fuga candidato */}
          <ReviewSection label="2. Ponto de fuga candidato">
            {ro ? (
              <EscapePointCard ep={ro.escapePointReview} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Seção 3 — Percepção */}
          <ReviewSection label="3. Percepção (P)">
            {ro ? (
              <AxisCard card={ro.axisReviews.perception} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Seção 4 — Objetivo */}
          <ReviewSection label="4. Objetivo (O)">
            {ro ? (
              <AxisCard card={ro.axisReviews.objective} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Seção 5 — Ação */}
          <ReviewSection label="5. Ação (A)">
            {ro ? (
              <AxisCard card={ro.axisReviews.action} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Seção 6 — Precondições */}
          <ReviewSection label="6. Precondições">
            {ro ? (
              <PreconditionsCard pr={ro.preconditionReview} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Seção 7 — Incertezas e evidência faltante */}
          <ReviewSection label="7. Incertezas e evidência faltante">
            {ro ? (
              <UncertaintyCard ur={ro.uncertaintyReview} />
            ) : (
              <Panel title="Incertezas" items={analysis.uncertainties} />
            )}
          </ReviewSection>

          {/* Seção 8 — Salvaguardas metodológicas (Guardrails) */}
          <ReviewSection label="8. Salvaguardas metodológicas">
            {analysis.engine_output && (analysis.engine_output as Record<string, unknown>).guardrails ? (
              <GuardrailPanel
                guardrails={(analysis.engine_output as Record<string, unknown>).guardrails as Record<string, boolean>}
                guardrailEvidence={(analysis.engine_output as Record<string, unknown>).guardrailEvidence as Record<string, string[]> ?? {}}
              />
            ) : (
              <p className="text-sm text-slate-400">Salvaguardas não disponíveis.</p>
            )}
          </ReviewSection>

          {/* Seção 9 — Guia de decisão humana */}
          <ReviewSection label="9. Guia de decisão humana">
            {ro ? (
              <DecisionGuideCard dg={ro.humanDecisionGuide} analysisId={params.id} />
            ) : (
              <p className="text-sm text-slate-400">Saída de revisão não disponível.</p>
            )}
          </ReviewSection>

          {/* Relato */}
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="text-lg font-semibold text-white">Relato</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{analysis.narrative}</p>
          </section>

          {/* Audit */}
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h2 className="text-lg font-semibold text-white">Histórico auditável</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel title="Revisions" items={payload!.revisions.map((r) => `rev ${r.revision_number}: ${r.reason} · ${r.engine_output_hash.slice(0, 12)}`)} />
              <Panel title="Reviews" items={payload!.reviews.map((r) => `${r.decision}: ${r.review_notes ?? 'sem notas'}`)} />
              <Panel title="Eventos" items={(payload?.events ?? []).map((e) => `${e.event_type}: ${e.from_status ?? '-'} → ${e.to_status ?? '-'}`)} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function ReviewSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
      <h2 className="text-lg font-semibold text-white">{label}</h2>
      {children}
    </section>
  )
}

function InfoCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {lines.map((line, i) => <p key={`${title}-${i}`} className="mt-1 break-words text-sm text-slate-300">{line}</p>)}
    </div>
  )
}

function Panel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {items.length === 0
        ? <p className="mt-2 text-sm text-slate-500">Sem itens.</p>
        : <ul className="mt-2 space-y-1 text-sm text-slate-300">{items.map((item, i) => <li key={`${title}-${i}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">{item}</li>)}</ul>}
    </div>
  )
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">{item}</li>
        ))}
      </ul>
    </div>
  )
}

function EscapePointCard({ ep }: { ep: SeraReviewerOutput['escapePointReview'] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-900 bg-cyan-950/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400 mb-1">Statement candidato</p>
        <p className="text-sm text-white">{ep.candidateStatement ?? 'Não determinado — veja incertezas.'}</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-200 mb-1">Por que isso importa</p>
        <p>{ep.whyThisMatters}</p>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
        <p className="font-medium text-slate-200 mb-2">Pergunta para o revisor</p>
        <p className="text-amber-200">{ep.reviewerQuestion}</p>
      </div>
      {ep.boundaryWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-2">Avisos de fronteira</p>
          <ul className="space-y-1">{ep.boundaryWarnings.map((w, i) => <li key={i} className="text-sm text-amber-200">{w}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <EvidenceList title="Evidência de suporte" items={ep.supportingEvidence} />
        <EvidenceList title="Evidência contrária" items={ep.counterEvidence} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Confiança:</span>
        <span className="text-xs text-slate-300">{ep.confidence}</span>
      </div>
    </div>
  )
}

function AxisCard({ card }: { card: SeraReviewerAxisCard }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-900 bg-cyan-950/20 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="rounded-lg bg-cyan-900 px-2 py-1 text-xs font-bold text-cyan-200">{card.axis}</span>
          <span className="text-sm font-medium text-white">{card.candidateCode ?? 'Sem código candidato'}</span>
          <span className="text-xs text-slate-400">{card.candidateStatus}</span>
        </div>
        {card.candidateMeaning && (
          <p className="mt-2 text-sm text-cyan-100">{card.candidateMeaning}</p>
        )}
        {card.statementAtEscapePoint && (
          <p className="mt-2 text-sm italic text-slate-300">&ldquo;{card.statementAtEscapePoint}&rdquo;</p>
        )}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-amber-200">
        <p className="font-medium text-slate-200 mb-1">Pergunta para o revisor</p>
        <p>{card.plainLanguageQuestion}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <EvidenceList title="Por que este código foi sugerido" items={card.whyCandidateWasSuggested} />
        <EvidenceList title="Por que pode estar errado" items={card.whyItMayBeWrong} />
        <EvidenceList title="Alternativas consideradas e rejeitadas" items={card.alternativesConsidered} />
        <EvidenceList title="Evidência excluída (pós-ponto de fuga)" items={card.evidenceExcluded} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Confiança:</span>
        <span className="text-xs text-slate-300">{card.confidence}</span>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">O revisor precisa decidir</p>
        <ul className="space-y-1">
          {card.reviewerMustDecide.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="mt-0.5 size-1.5 rounded-full bg-cyan-500 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PreconditionsCard({ pr }: { pr: SeraReviewerOutput['preconditionReview'] }) {
  if (pr.absentOrInsufficient.length > 0 && pr.cards.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-400">
        {pr.absentOrInsufficient.map((msg, i) => <p key={i}>{msg}</p>)}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {pr.cards.map((card, i) => <PreconditionItem key={`prec-${i}`} card={card} />)}
    </div>
  )
}

function PreconditionItem({ card }: { card: SeraReviewerPreconditionCard }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">{card.plainLanguageLabel}</span>
        <span className="text-xs text-slate-500">{card.category}</span>
        <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-xs text-amber-300">NÃO é ponto de fuga</span>
      </div>
      <p className="text-sm text-slate-200">{card.description}</p>
      <p className="text-xs text-slate-400">Relação: {card.relationship}</p>
      <EvidenceList title="Evidência" items={card.evidence} />
      <div className="rounded-lg border border-amber-900 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
        <span className="font-medium">Pergunta: </span>{card.reviewerQuestion}
      </div>
      <p className="text-xs text-slate-500">Confiança: {card.confidence}</p>
    </div>
  )
}

function UncertaintyCard({ ur }: { ur: SeraReviewerOutput['uncertaintyReview'] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Incertezas" items={ur.uncertainties} />
      <Panel title="Perguntas abertas" items={ur.unansweredQuestions} />
      <Panel title="Evidência necessária" items={ur.evidenceNeeded} />
    </div>
  )
}

function DecisionGuideCard({ dg, analysisId }: { dg: SeraReviewerOutput['humanDecisionGuide']; analysisId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Próximo passo sugerido</p>
        <p className="text-sm font-bold text-cyan-300">{dg.recommendedNextStep}</p>
        <p className="mt-2 text-sm text-slate-300">{dg.rationale}</p>
      </div>
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Checklist de decisão</p>
        <ul className="space-y-2">
          {dg.decisionChecklist.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <span className="mt-0.5 size-4 rounded border border-slate-600 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <Link href={`/admin/sera-vnext/analyses/${analysisId}/review`} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
        Ir para página de revisão →
      </Link>
    </div>
  )
}
