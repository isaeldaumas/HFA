'use client'

import type { SeraCanonicalPath } from '@/lib/sera-vnext/engine-contract'
import { useI18n } from '@/lib/i18n'
import { localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { didacticNodeReason, friendlyAnswerLabel, friendlyNodeLabel } from '@/lib/sera-vnext/presentation'

function axisTitle(axis: string, pt: boolean): string {
  if (axis === 'P') return pt ? 'Percepção' : 'Perception'
  if (axis === 'O') return pt ? 'Objetivo' : 'Objective'
  return pt ? 'Ação' : 'Action'
}

function question(node: SeraCanonicalPath['answers'][number], pt: boolean): string {
  if (!pt) return node.exactQuestionTextENAnchor ?? node.question
  return SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === node.nodeId)?.question ?? node.question
}

function FlowRail({ path, pt }: { path: SeraCanonicalPath; pt: boolean }) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-2">
        {path.answers.map((node, index) => (
          <div key={`${path.axis}-${node.nodeId}`} className="flex items-center gap-2">
            <div className="w-44 rounded-xl border border-cyan-900/60 bg-cyan-950/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">{index + 1}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{friendlyAnswerLabel(node.answer, pt)}</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-snug text-slate-100">{friendlyNodeLabel(node.nodeId, pt)}</p>
              {node.terminalCode && <p className="mt-2 text-[11px] font-bold text-cyan-300">→ {node.terminalCode}</p>}
            </div>
            {index < path.answers.length - 1 && <span aria-hidden className="text-lg text-cyan-700">→</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CanonicalDecisionJourney({ paths }: { paths: SeraCanonicalPath[] }) {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  if (paths.length === 0) return null

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
      <h2 className="text-base font-semibold text-white">{pt ? 'Como o sistema chegou à classificação' : 'How the system reached the classification'}</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
        {pt ? 'O fluxo visual mostra o caminho percorrido. Logo abaixo, cada etapa explica a pergunta, a resposta, a justificativa e a evidência usada.' : 'The visual flow shows the traversed path. Each step below explains the question, answer, rationale, and evidence used.'}
      </p>
      <div className="mt-5 space-y-8">
        {paths.map((path) => (
          <div key={path.axis} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-cyan-950 px-2 py-1 text-xs font-semibold text-cyan-300">{axisTitle(path.axis, pt)}</span>
              <span className="text-xs text-slate-500">{pt ? 'resultado' : 'result'}: <strong className="text-slate-300">{path.candidateCode ?? (pt ? 'não resolvido' : 'unresolved')}</strong></span>
            </div>
            <FlowRail path={path} pt={pt} />
            <div className="grid gap-3 lg:grid-cols-2">
              {path.answers.map((node, index) => (
                <article key={`${path.axis}-${node.nodeId}-detail`} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-cyan-300">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{friendlyNodeLabel(node.nodeId, pt)}</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-300">{question(node, pt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg bg-cyan-950/20 px-3 py-2 text-xs text-cyan-200">
                    <strong>{pt ? 'Resposta' : 'Answer'}:</strong> {friendlyAnswerLabel(node.answer, pt)}
                  </div>
                  {node.rationale && (
                    <p className="mt-3 text-xs leading-relaxed text-slate-400"><strong className="text-slate-300">{pt ? 'Por que' : 'Why'}:</strong> {didacticNodeReason(node.nodeId, node.answer, localizeRationale(node.rationale, locale), pt)}</p>
                  )}
                  {(node.supportingEvidence?.length ?? 0) > 0 && (
                    <details className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-slate-400">{pt ? 'Ver evidências usadas' : 'View supporting evidence'}</summary>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-500">
                        {(node.supportingEvidence ?? []).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </details>
                  )}
                  <details className="mt-2 text-[11px] text-slate-600">
                    <summary className="cursor-pointer">{pt ? 'Detalhes técnicos' : 'Technical details'}</summary>
                    <p className="mt-1">ID: {node.nodeId}{node.nextNodeId ? ` · ${pt ? 'próximo' : 'next'}: ${node.nextNodeId}` : ''}{node.terminalCode ? ` · ${pt ? 'terminal' : 'terminal'}: ${node.terminalCode}` : ''}</p>
                  </details>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
