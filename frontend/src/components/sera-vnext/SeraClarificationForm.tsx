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
  const recordedResponses = useMemo(() => {
    const grouped = new Map<string, string[]>()
    for (const item of props.output.factualExtraction.evidence ?? []) {
      if (item.collectionSource !== 'CLARIFICATION_RESPONSE' || !item.linkedQuestionId) continue
      const statement = item.statement?.trim()
      if (!statement) continue
      const current = grouped.get(item.linkedQuestionId) ?? []
      if (!current.includes(statement)) current.push(statement)
      grouped.set(item.linkedQuestionId, current)
    }
    return grouped
  }, [props.output])
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastRevision, setLastRevision] = useState<number | null>(null)

  if (!questions.length) return null

  async function submit() {
    const clarificationResponses = questions
      .map((q) => ({ questionId: q.id, response: (responses[q.id] ?? '').trim() }))
      .filter((item) => item.response.length > 0)
      .filter((item) => !(recordedResponses.get(item.questionId) ?? []).some((recorded) =>
        recorded.trim().toLocaleLowerCase() === item.response.toLocaleLowerCase(),
      ))
    if (!clarificationResponses.length) {
      const hasTypedResponse = questions.some((q) => (responses[q.id] ?? '').trim().length > 0)
      setError(pt
        ? (hasTypedResponse
            ? 'Essa informação já está registrada. Acrescente somente evidência nova ou complementar.'
            : 'Preencha pelo menos uma resposta com informação factual do evento.')
        : (hasTypedResponse
            ? 'That information is already recorded. Add only new or complementary evidence.'
            : 'Provide at least one response with factual event information.'))
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
      {questions.map((question, index) => {
        const recorded = recordedResponses.get(question.id) ?? []
        return (
          <div key={question.id} className="rounded-lg border border-amber-700/40 bg-slate-950/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
              {pt ? 'Pergunta' : 'Question'} {index + 1}
            </p>
            <p className="mt-2 text-sm text-slate-100">{question.question}</p>
            {recorded.length > 0 && (
              <div className="mt-3 rounded-lg border border-emerald-800/60 bg-emerald-950/20 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-300">
                  {pt ? 'Evidência já registrada e incorporada à reanálise' : 'Evidence already recorded and included in reanalysis'}
                </p>
                {recorded.map((statement, responseIndex) => (
                  <p key={`${question.id}-recorded-${responseIndex}`} className="mt-1 text-sm text-emerald-100/90">
                    {statement}
                  </p>
                ))}
                <p className="mt-2 text-xs text-amber-200/80">
                  {pt
                    ? 'Como esta pergunta continua ativa, a evidência acima ainda não resolveu completamente este ponto. Acrescente somente o fato que estiver faltando.'
                    : 'Because this question is still active, the evidence above has not fully resolved this point. Add only the missing factual information.'}
                </p>
              </div>
            )}
            <textarea
              rows={3}
              value={responses[question.id] ?? ''}
              onChange={(e) => setResponses((current) => ({ ...current, [question.id]: e.target.value }))}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500"
              placeholder={recorded.length > 0
                ? (pt ? 'Acrescente somente nova evidência para este ponto.' : 'Add only new evidence for this point.')
                : (pt ? 'Descreva a evidência factual disponível.' : 'Describe the available factual evidence.')}
            />
          </div>
        )
      })}
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
