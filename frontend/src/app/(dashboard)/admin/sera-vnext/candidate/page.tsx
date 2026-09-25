'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, FileWarning, FlaskConical, Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type CandidateResponse = {
  mode: 'CANDIDATE_ONLY'
  requestId: string
  inputAccepted: true
  analysisStatus: 'CANDIDATE_ONLY'
  canonicalTreeStatus: 'COMPLETED_CANDIDATE_ONLY' | 'PARTIAL' | 'REAL_TREE_MISSING' | 'INSUFFICIENT_EVIDENCE'
  factualExtraction: {
    facts: Array<{
      id: string
      statement: string
      category: string
      sourceSentenceIndex: number
    }>
    timeline: Array<{
      id: string
      order: number
      statement: string
      temporalCue: string | null
      sourceSentenceIndex: number
    }>
    explicitlyUnsupportedClaims: string[]
  }
  escapePoint: {
    status: 'CANDIDATE' | 'PROGRESSIVE_ZONE' | 'NO_HUMAN_ESCAPE_POINT' | 'INSUFFICIENT_EVIDENCE'
    statement: string | null
    earliestCandidate: string | null
    latestCandidate: string | null
    directActor: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    excludedPostEscapeEvidence: string[]
  }
  directActor: {
    actor: string | null
    status: 'IDENTIFIED' | 'AMBIGUOUS' | 'NOT_APPLICABLE'
    alternatives: string[]
    actorMigrationWarnings: string[]
  }
  axes: {
    perception: CandidateAxis
    objective: CandidateAxis
    action: CandidateAxis
  }
  preconditions: Array<{
    id: string
    label: string
    category: string
    evidence: string[]
    sourceRuleIds: string[]
    linkedActor: string | null
    confidence: string
  }>
  canonicalTraversal: {
    status: 'COMPLETED_CANDIDATE_ONLY' | 'PARTIAL' | 'REAL_TREE_MISSING' | 'INSUFFICIENT_EVIDENCE'
    paths: Array<{
      axis: 'P' | 'O' | 'A'
      candidateCode: string | null
      status: 'COMPLETED_CANDIDATE_ONLY' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE'
      nodeIds: string[]
      questionPath: string[]
    }>
    unansweredQuestions: string[]
  }
  humanReviewPackage: {
    reviewerDecisionsRequired: string[]
    criticalWarnings: string[]
  }
  uncertainties: string[]
  warnings: string[]
  selectedCode: null
  releasedCode: null
  finalConclusion: null
  classifiedOutput: false
  readyPromotion: false
  downstreamAllowed: false
  persisted: false
}

type CandidateAxis = {
  proposedCode: string | null
  status: 'CANDIDATE' | 'NO_FAILURE' | 'INSUFFICIENT_EVIDENCE' | 'UNRESOLVED'
  actor: string | null
  statementAtEscapePoint: string | null
  supportingEvidence: string[]
  counterEvidence: string[]
  excludedPostEscapeEvidence: string[]
  confidence: string
}

const candidateUiEnabled =
  process.env.NEXT_PUBLIC_SERA_VNEXT_CANDIDATE_UI_ENABLED?.trim().toLowerCase() === 'true'

const maxChars = 12000
const reviewChoices = [
  { id: 'accept', label: 'Aceito como hipótese de trabalho' },
  { id: 'reject', label: 'Rejeito como hipótese' },
  { id: 'more-evidence', label: 'Precisa de mais evidência' },
] as const

export default function AdminSeraVNextCandidatePage() {
  const [eventText, setEventText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CandidateResponse | null>(null)
  const [reviewState, setReviewState] = useState<(typeof reviewChoices)[number]['id'] | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(Boolean(data.session))
      if (!data.session && candidateUiEnabled) {
        setError('Sessão ausente')
      }
    })
  }, [])

  async function handleAnalyze() {
    setLoading(true)
    setError('')
    setResult(null)
    setReviewState(null)

    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setLoading(false)
      setError('Sessão ausente')
      return
    }

    try {
      const response = await fetch('/api/admin/sera-vnext/candidate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          eventText,
          clientRequestId: crypto.randomUUID(),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(String(payload.detail ?? 'Falha ao executar o sandbox SERA 0.3.'))
      }
      setResult(payload as CandidateResponse)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Falha ao executar o sandbox SERA 0.3.')
    } finally {
      setLoading(false)
    }
  }

  if (!candidateUiEnabled) {
    return (
      <div className="p-5 md:p-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 text-slate-300">
            <Lock className="size-4" />
            <h1 className="text-xl font-semibold">Sandbox SERA 0.3 indisponível</h1>
          </div>
          <p className="text-slate-400 text-sm mt-2">
            Defina NEXT_PUBLIC_SERA_VNEXT_CANDIDATE_UI_ENABLED=true em ambiente controlado para exibir esta superfície interna.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-amber-300">
          <FlaskConical className="size-4" />
          <span className="text-xs uppercase tracking-[0.2em]">Product Alpha</span>
        </div>
        <h1 className="text-2xl font-bold text-white">Sandbox metodológico SERA 0.3</h1>
        <p className="text-slate-300 text-sm max-w-4xl">
          Ambiente de teste do mesmo motor SERA 0.3. Não salva dados, não altera eventos e não produz saída operacional.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <label className="block text-sm text-slate-300 font-medium" htmlFor="candidate-event-text">
          Relato do evento
        </label>
        <textarea
          id="candidate-event-text"
          value={eventText}
          onChange={(event) => setEventText(event.target.value)}
          className="w-full min-h-56 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-amber-400"
          placeholder="Cole aqui um relato factual para testar o motor SERA 0.3 sem persistência operacional."
          maxLength={maxChars}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-slate-400">
            {eventText.length}/{maxChars} caracteres
          </div>
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={loading || !sessionReady}
            className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? 'Analisando...' : 'Analisar como candidato não final'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Status</p>
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck className="size-4 text-emerald-400" />
                {result.analysisStatus}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Tree</p>
              <p className="text-white font-semibold">{result.canonicalTreeStatus}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Persistência</p>
              <p className="text-white font-semibold">{String(result.persisted)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Request ID</p>
              <p className="text-white font-semibold break-all">{result.requestId}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <h2 className="text-white font-semibold">Fatos extraídos</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {result.factualExtraction.facts.map((fact, index) => (
                <li key={`${fact.sourceSentenceIndex}-${index}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="text-amber-300 mr-2 uppercase text-xs">{fact.category}</span>
                  {fact.statement}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <h2 className="text-white font-semibold">Cronologia resumida</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {result.factualExtraction.timeline.map((item) => (
                <li key={item.order} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="text-amber-300 mr-2">#{item.order}</span>
                  {item.statement}
                  {item.temporalCue && <span className="text-slate-500 ml-2">({item.temporalCue})</span>}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2 text-white font-semibold">
              <FileWarning className="size-4 text-amber-300" />
              Janela candidata de ponto de fuga
            </div>
            <p className="text-sm text-slate-300">{result.escapePoint.statement ?? 'Sem janela candidata explícita no texto enviado.'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Earliest candidate</p>
                {result.escapePoint.earliestCandidate ?? '-'}
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Latest candidate</p>
                {result.escapePoint.latestCandidate ?? '-'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {([
              ['perception', result.axes.perception],
              ['objective', result.axes.objective],
              ['action', result.axes.action],
            ] as const).map(([lane, item]) => (
              <div key={lane} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h2 className="text-white font-semibold capitalize">{lane}</h2>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
                  <p>{item.status}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Candidate code</p>
                  <p>{item.proposedCode ?? 'INSUFFICIENT_EVIDENCE'}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Statement</p>
                  <p>{item.statementAtEscapePoint ?? 'Sem statement suficiente no ponto de fuga.'}</p>
                  <p className="text-xs text-slate-500">A favor: {item.supportingEvidence.join(' | ') || '-'}</p>
                  <p className="text-xs text-slate-500">Contra: {item.counterEvidence.join(' | ') || '-'}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Preconditions</h2>
              {result.preconditions.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma precondition candidata sustentada pelo texto disponível.</p>
              ) : (
                <ul className="space-y-2 text-sm text-slate-300">
                  {result.preconditions.map((item) => (
                    <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                      <p className="text-amber-300 text-xs uppercase">{item.category}</p>
                      <p>{item.label}</p>
                      <p className="text-xs text-slate-500 mt-1">{item.evidence.join(' | ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Canonical traversal</h2>
              <div className="space-y-2 text-sm text-slate-300">
                <p>Status: {result.canonicalTraversal.status}</p>
                {result.canonicalTraversal.paths.map((path) => (
                  <div key={path.axis} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-amber-300 text-xs uppercase">{path.axis}</p>
                    <p>Código: {path.candidateCode ?? 'INSUFFICIENT_EVIDENCE'}</p>
                    <p className="text-xs text-slate-500">{path.nodeIds.join(' -> ') || 'Sem path executado.'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Revisão humana local</h2>
            <p className="text-sm text-slate-400">
              Estes controles existem apenas no estado desta página. Não salvam dados e não mudam nenhum evento.
            </p>
            <ul className="space-y-2 text-sm text-slate-300">
              {result.humanReviewPackage.reviewerDecisionsRequired.map((item) => (
                <li key={item} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">{item}</li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 md:flex-row">
              {reviewChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setReviewState(choice.id)}
                  className={[
                    'rounded-xl border px-4 py-3 text-sm text-left transition',
                    reviewState === choice.id
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700',
                  ].join(' ')}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Warnings</h2>
              <ul className="space-y-2 text-sm text-slate-300">
                {result.warnings.map((warning) => (
                  <li key={warning} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">{warning}</li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-3">Uncertainties</h2>
              <ul className="space-y-2 text-sm text-slate-300">
                {result.uncertainties.map((uncertainty) => (
                  <li key={uncertainty} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-amber-300 shrink-0 mt-0.5" />
                      <span>{uncertainty}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
