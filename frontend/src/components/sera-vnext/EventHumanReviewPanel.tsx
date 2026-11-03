'use client'

import { useCallback, useEffect, useState } from 'react'

interface ReviewHistory {
  id: string
  reviewer_id: string
  review_version: number
  created_at: string
  decision: string
  evidence_sufficiency: string
  review_notes: string | null
  metadata: { basedOnEngineRevision?: number } | null
}
interface EngineRevisionHistory {
  eventVersion: number
  engineRevision: number
  analysisId: string
  distinctLegacyAnalysis: boolean
  createdAt: string
  createdBy: string
  reason: string
  escapePoint: string | null
  actor: string | null
  poa: string
}
interface ReviewSummary {
  analysisId: string
  status: string
  reviewStatus: string
  engineRevision: number
  evidenceBlocked: boolean
  canReview: boolean
  reviews: ReviewHistory[]
  revisions: EngineRevisionHistory[]
}

const labels: Record<string, string> = {
  REQUIRES_MORE_EVIDENCE: 'Solicitar mais evidência',
  RETURN_FOR_REANALYSIS: 'Retornar para reanálise',
  REJECT_WORKING_HYPOTHESIS: 'Rejeitar hipótese de trabalho',
  ACCEPT_AS_WORKING_HYPOTHESIS: 'Aceitar como hipótese não final',
  INSUFFICIENT: 'Insuficiente',
  UNRESOLVED: 'Não resolvida',
  CONFLICTING: 'Conflitante',
  SUFFICIENT_FOR_WORKING_HYPOTHESIS: 'Suficiente para hipótese',
}

export function EventHumanReviewPanel({ eventId, analysisId, token, mode = 'review' }: {
  eventId: string
  analysisId: string
  token: string
  mode?: 'review' | 'history'
}) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null)
  const [decision, setDecision] = useState('REQUIRES_MORE_EVIDENCE')
  const [evidenceSufficiency, setEvidenceSufficiency] = useState('INSUFFICIENT')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/events/${eventId}/sera-reviews?analysisId=${encodeURIComponent(analysisId)}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(body.detail ?? 'Falha ao consultar histórico de revisão.'))
      setSummary(body as ReviewSummary)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao consultar revisões.') }
    finally { setLoaded(true) }
  }, [analysisId, eventId, token])

  useEffect(() => {
    // Async history retrieval updates state only after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function saveReview() {
    if (!summary) return
    setBusy(true)
    setSaved('')
    setError('')
    try {
      const res = await fetch(`/api/events/${eventId}/sera-reviews`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-request-id': crypto.randomUUID() },
        body: JSON.stringify({ analysisId, baseReviewVersion: summary.reviews.reduce((max, r) => Math.max(max, r.review_version), 0), baseEngineRevision: summary.engineRevision,
          decision, evidenceSufficiency, requiresMoreEvidence: decision === 'REQUIRES_MORE_EVIDENCE', reviewNotes: notes }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(body.detail ?? 'Não foi possível salvar a revisão.'))
      setSaved(`Revisão humana nº ${body.reviewVersion} registrada. A decisão anterior permanece preservada.`)
      setNotes('')
      setShowReviewForm(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao registrar a revisão.') }
    finally { setBusy(false) }
  }

  return (
    <section className="rounded-xl border border-cyan-700/50 bg-slate-900 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-white">{mode === 'history' ? 'Histórico de revisões humanas' : 'Revisão humana da análise'}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {mode === 'review'
            ? 'Registre sua decisão metodológica, sustentada nas evidências. Nenhuma decisão libera códigos P/O/A definitivos.'
            : 'Versões e decisões sucessivas do mesmo evento permanecem preservadas para auditoria, com autoria e justificativas.'}
        </p>
      </div>
      {summary && (
        <>
          {mode === 'history' && (
          <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-2">
            <h3 className="text-sm font-semibold text-white">Histórico de versões da análise SERA</h3>
            <p className="text-xs text-slate-400">Versões sucessivas do mesmo evento. As evidências e os resultados anteriores permanecem disponíveis para auditoria.</p>
            {summary.revisions?.map((revision) => (
              <div key={`${revision.analysisId}-${revision.engineRevision}`} className="rounded-md border border-slate-700 p-3 text-xs text-slate-300 space-y-1">
                <p><strong>Versão do evento {revision.eventVersion}</strong> · {new Date(revision.createdAt).toLocaleString('pt-BR')} · P/O/A: {revision.poa}</p>
                <p>Ator: {revision.actor ?? 'Não identificado'} · Ponto de fuga: {revision.escapePoint ?? 'Não estabelecido'}</p>
                <p>Revisão {revision.engineRevision} da análise · Autor ID: {revision.createdBy}</p>
                {revision.distinctLegacyAnalysis && <p className="text-amber-200">Histórico legado preservado em registro de análise separado.</p>}
              </div>
            ))}
          </div>
          )}
          <p className="text-xs text-slate-400">Análise SERA · revisão atual {summary.engineRevision} · {summary.reviews.length} decisão(ões) humana(s) registrada(s)</p>
          {mode === 'history' && (summary.reviews.length === 0 ? (
            <p className="text-sm text-amber-200">Nenhuma revisão humana salva até agora. A classificação automática não é uma decisão humana.</p>
          ) : (
            <ol className="space-y-3">
              {summary.reviews.map((review) => (
                <li key={review.id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 text-slate-200">
                    <strong>Decisão humana nº {review.review_version} · {labels[review.decision] ?? review.decision}</strong>
                    <span className="text-xs text-slate-400">{new Date(review.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Revisor ID: {review.reviewer_id} · Evidência: {labels[review.evidence_sufficiency] ?? review.evidence_sufficiency} · Motor v{review.metadata?.basedOnEngineRevision ?? '—'}</p>
                  <p className="mt-2 whitespace-pre-wrap text-slate-200">{review.review_notes || 'Sem justificativa registrada.'}</p>
                </li>
              ))}
            </ol>
          ))}
          {mode === 'review' && summary.canReview && !showReviewForm && (
            <button type="button" onClick={() => setShowReviewForm(true)}
              className="rounded-lg border border-cyan-700/60 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">
              Registrar {summary.reviews.length === 0 ? 'primeira revisão humana' : 'nova revisão humana'}
            </button>
          )}
          {mode === 'review' && summary.canReview && showReviewForm && (
            <div className="space-y-3 border-t border-slate-700 pt-4">
              <h3 className="text-sm font-semibold text-white">Registrar {summary.reviews.length === 0 ? 'primeira decisão' : 'nova decisão'} não final</h3>
              {summary.evidenceBlocked && <p className="text-xs text-amber-200">Há evidência insuficiente em pelo menos uma etapa da análise. A classificação não pode ser aceita integralmente como sustentada até que o bloqueio seja resolvido.</p>}
              <label className="block text-xs font-medium text-slate-300">Decisão do revisor
                <select value={decision} onChange={(e) => setDecision(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white">
                  <option value="REQUIRES_MORE_EVIDENCE">Solicitar mais evidência</option>
                  <option value="RETURN_FOR_REANALYSIS">Retornar para reanálise</option>
                  {!summary.evidenceBlocked && <option value="REJECT_WORKING_HYPOTHESIS">Rejeitar hipótese de trabalho</option>}
                  {!summary.evidenceBlocked && <option value="ACCEPT_AS_WORKING_HYPOTHESIS">Aceitar como hipótese não final</option>}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-300">Suficiência da evidência
                <select value={evidenceSufficiency} onChange={(e) => setEvidenceSufficiency(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white">
                  <option value="INSUFFICIENT">Insuficiente</option>
                  <option value="UNRESOLVED">Não resolvida</option>
                  <option value="CONFLICTING">Conflitante</option>
                  {!summary.evidenceBlocked && <option value="SUFFICIENT_FOR_WORKING_HYPOTHESIS">Suficiente para hipótese de trabalho</option>}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-300">Justificativa metodológica do analista
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Registre sua avaliação da evidência disponível, sem acrescentar fatos não documentados." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" />
              </label>
              <button type="button" disabled={busy} onClick={() => setShowReviewForm(false)}
                className="mr-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={busy || notes.trim().length < 10} onClick={() => void saveReview()}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
                {busy ? 'Salvando decisão…' : 'Registrar revisão não final'}
              </button>
            </div>
          )}
        </>
      )}
      {saved && <p role="status" className="text-sm text-emerald-300">{saved}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {!loaded && <p className="text-xs text-slate-400">Carregando histórico...</p>}
    </section>
  )
}
