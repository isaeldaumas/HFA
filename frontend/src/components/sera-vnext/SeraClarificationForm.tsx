'use client'

import { useMemo, useState } from 'react'
import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { useI18n } from '@/lib/i18n'

export function SeraClarificationForm(props: {
  eventId: string
  token: string
  output: SeraVNextEngineOutput
  onUpdated?: () => void
}) {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  const questions = useMemo(
    () => props.output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
      ? props.output.evidenceSufficiency.questions
      : [],
    [props.output],
  )
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastRevision, setLastRevision] = useState<number | null>(null)

  if (!questions.length) return null

  async function submit() {
    const clarificationResponses = questions
      .map((q) => ({ questionId: q.id, response: (responses[q.id] ?? '').trim() }))
      .filter((item) => item.response.length > 0)
    if (!clarificationResponses.length) {
      setError(pt
        ? 'Preencha pelo menos uma resposta com informação factual do evento.'
        : 'Provide at least one response with factual event information.')
      return
    }
    setState('loading')
    setError(null)
    try {
      const res = await fetch(`/api/events/${props.eventId}/clarifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${props.token}` },
        body: JSON.stringify({ clarificationResponses, locale }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(body.detail ?? (pt
        ? 'Falha ao registrar informações adicionais.'
        : 'Failed to register additional information.')))
      setResponses({})
      setLastRevision(typeof body.revision_number === 'number' ? body.revision_number : null)
      setState('success')
      props.onUpdated?.()
    } catch (e) {
      setState('error')
      setError(e instanceof Error
        ? e.message
        : (pt ? 'Falha ao registrar informações adicionais.' : 'Failed to register additional information.'))
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-amber-200">
          {pt ? 'Informações adicionais necessárias' : 'Additional information required'}
        </h2>
        <p className="mt-1 text-sm text-amber-100/80">
          {pt
            ? 'O motor interrompeu a classificação para não inferir além da evidência disponível. Responda somente com fatos conhecidos ou documentados.'
            : 'The engine stopped classification to avoid inferring beyond the available evidence. Respond only with known or documented facts.'}
        </p>
      </div>
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-lg border border-amber-700/40 bg-slate-950/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
            {pt ? 'Pergunta' : 'Question'} {index + 1}
          </p>
          <p className="mt-2 text-sm text-slate-100">{question.question}</p>
          <textarea
            rows={3}
            value={responses[question.id] ?? ''}
            onChange={(e) => setResponses((current) => ({ ...current, [question.id]: e.target.value }))}
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
            placeholder={pt ? 'Descreva a evidência factual disponível.' : 'Describe the available factual evidence.'}
          />
        </div>
      ))}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {state === 'success' && (
        <p className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          {pt
            ? `Evidência registrada e reanálise concluída${lastRevision ? ` na revisão ${lastRevision}` : ''}. Confira o ponto de fuga, o ator e as perguntas ainda pendentes acima.`
            : `Evidence registered and reanalysis completed${lastRevision ? ` in revision ${lastRevision}` : ''}. Review the escape point, actor, and any remaining questions above.`}
        </p>
      )}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={state === 'loading'}
        className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60"
      >
        {state === 'loading'
          ? (pt ? 'Reanalisando…' : 'Reanalyzing…')
          : (pt ? 'Adicionar evidência e reanalisar' : 'Add evidence and reanalyze')}
      </button>
    </section>
  )
}
