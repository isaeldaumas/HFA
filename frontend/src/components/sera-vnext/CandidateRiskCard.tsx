'use client'

import { computeCandidateAttention } from '@/lib/sera-vnext/presentation'
import { useI18n } from '@/lib/i18n'

export function CandidateRiskCard(props: {
  perception?: string | null
  objective?: string | null
  action?: string | null
  reviewStatus?: string | null
}) {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  const result = computeCandidateAttention(props.perception, props.objective, props.action)
  if (!result) return null
  const reviewed = props.reviewStatus === 'REVIEWED' || props.reviewStatus === 'APPROVED' || props.reviewStatus === 'HUMAN_REVIEW_COMPLETED_NON_FINAL'

  return (
    <section className="rounded-xl border border-blue-700/40 bg-blue-950/20 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">{pt ? 'Avaliação preliminar de risco / prioridade' : 'Preliminary risk / priority assessment'}</p>
          <p className="mt-1 text-sm text-slate-300">{pt ? 'Índice HFA de atenção operacional baseado nos eixos P/O/A disponíveis.' : 'HFA operational-attention index based on the available P/O/A axes.'}</p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-blue-200">{result.score}</span>
          <span className="text-sm font-semibold text-blue-300">/100 · {pt ? result.labelPt : result.labelEn}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        {[
          ['P', props.perception], ['O', props.objective], ['A', props.action],
        ].map(([axis, code]) => (
          <div key={axis} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
            <span className="text-slate-500">{axis}</span>{' '}
            <strong className="text-slate-200">{code ?? '—'}</strong>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {pt
          ? `${reviewed ? 'Classificação revisada.' : 'Classificação ainda não revisada: o valor é provisório.'} Este índice ajuda a priorizar acompanhamento; não é ERC/ARMS canônico, não estima probabilidade de acidente e não substitui a avaliação operacional de risco.`
          : `${reviewed ? 'Reviewed classification.' : 'Classification not yet reviewed: this value is provisional.'} This index supports follow-up prioritization; it is not canonical ERC/ARMS, does not estimate accident probability, and does not replace operational risk assessment.`}
      </p>
    </section>
  )
}
