import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'

function statusPt(value: string): string {
  const labels: Record<string, string> = {
    CANDIDATE: 'Candidato',
    NO_FAILURE: 'Sem falha independente',
    INSUFFICIENT_EVIDENCE: 'Evidência insuficiente',
    UNRESOLVED: 'Não resolvido',
    PROGRESSIVE_ZONE: 'Zona progressiva',
    NO_HUMAN_ESCAPE_POINT: 'Sem ponto de fuga humano',
  }
  return labels[value] ?? value
}

function confidencePt(value: string | null | undefined): string {
  if (value === 'HIGH') return 'Alta'
  if (value === 'MEDIUM') return 'Média'
  if (value === 'LOW') return 'Baixa'
  return value ?? '-'
}

function axisTitle(axis: string): string {
  if (axis === 'P') return 'Percepção'
  if (axis === 'O') return 'Objetivo'
  return 'Ação'
}

function answerPt(value: string): string {
  const labels: Record<string, string> = {
    START: 'Início',
    SIM: 'Sim',
    'NÃO': 'Não',
    'NÃO_SENSORIAL': 'Não — limitação sensorial',
    'NÃO_CONHECIMENTO': 'Não — conhecimento',
    SIM_ATENCAO: 'Sim — atenção',
    SIM_GERENCIAMENTO: 'Sim — gerenciamento',
    'NÃO_DESLIZE_LAPSO_ERRO': 'Não — deslize/lapso/erro',
    'NÃO_FEEDBACK': 'Não — feedback/verificação',
    'NÃO_INABILIDADE': 'Não — inabilidade',
    'NÃO_SELECAO': 'Não — seleção',
    SIM_SELECAO: 'Sim — seleção',
    SIM_FEEDBACK: 'Sim — feedback',
    INSUFFICIENT_EVIDENCE: 'Evidência insuficiente',
  }
  return labels[value] ?? value
}

export function VNextEventAnalysisPanel({ output }: { output: SeraVNextEngineOutput }) {
  const axes = [output.axes.perception, output.axes.objective, output.axes.action]
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-4">
        <p className="text-sm font-semibold text-amber-300">Hipótese metodológica — não é classificação final</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
          O motor apresenta candidatos e a trilha de decisão. A liberação final permanece bloqueada até revisão humana.
        </p>
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="text-base font-semibold text-white">Ponto de fuga da operação segura</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">{output.escapePoint.statement ?? 'Não estabelecido.'}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-800 p-3"><p className="text-xs text-slate-500">Status</p><p className="mt-1 text-sm text-slate-200">{statusPt(output.escapePoint.status)}</p></div>
          <div className="rounded-lg bg-slate-800 p-3"><p className="text-xs text-slate-500">Ator direto</p><p className="mt-1 text-sm text-slate-200">{output.directActor.actor ?? 'Não resolvido'}</p></div>
          <div className="rounded-lg bg-slate-800 p-3"><p className="text-xs text-slate-500">Confiança</p><p className="mt-1 text-sm text-slate-200">{confidencePt(output.escapePoint.confidence)}</p></div>
        </div>
        {output.escapePoint.supportingEvidence.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidência de suporte</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-300">
              {output.escapePoint.supportingEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {output.escapePoint.excludedPostEscapeEvidence.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidência posterior excluída da causalidade</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
              {output.escapePoint.excludedPostEscapeEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {axes.map((axis) => (
          <div key={axis.axis} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{axisTitle(axis.axis)}</p>
            <p className="mt-2 text-xl font-bold text-white">{axis.proposedCode ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-500">{statusPt(axis.status)} · confiança {confidencePt(axis.confidence)}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{axis.statementAtEscapePoint ?? 'Eixo não resolvido pela evidência disponível.'}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="text-base font-semibold text-white">Fluxo de decisão canônico</h2>
        <p className="mt-1 text-xs text-slate-500">Perguntas e respostas efetivamente percorridas pelo motor.</p>
        <div className="mt-5 space-y-6">
          {output.canonicalTraversal.paths.map((path) => (
            <div key={path.axis}>
              <div className="mb-3 flex items-center gap-2">
                <span className="rounded bg-cyan-950 px-2 py-1 text-xs font-semibold text-cyan-300">{axisTitle(path.axis)}</span>
                <span className="text-xs text-slate-500">código candidato: {path.candidateCode ?? 'não resolvido'}</span>
              </div>
              <div className="space-y-3">
                {path.answers.map((node, index) => (
                  <div key={path.axis + '-' + node.nodeId + '-' + String(index)} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold text-slate-400">Nó {index + 1} · {node.nodeId}</p>
                    <p className="mt-2 text-sm text-slate-200">{node.question}</p>
                    <p className="mt-2 text-xs text-cyan-300">Resposta: {answerPt(node.answer)}</p>
                    {node.rationale && <p className="mt-2 text-xs leading-relaxed text-slate-400">Justificativa: {node.rationale}</p>}
                    {(node.supportingEvidence?.length ?? 0) > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-500">
                        {(node.supportingEvidence ?? []).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    )}
                    <p className="mt-2 text-xs text-slate-600">
                      {node.terminalCode ? 'Código terminal: ' + node.terminalCode : node.nextNodeId ? 'Próximo nó: ' + node.nextNodeId : 'Travessia interrompida'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {output.canonicalTraversal.paths.length === 0 && (
            <p className="text-sm text-slate-500">A travessia P/O/A não foi iniciada porque o ponto de fuga não foi estabelecido com evidência suficiente.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="text-base font-semibold text-white">Pré-condições</h2>
        {output.preconditions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nenhuma pré-condição causal sustentada pela evidência disponível.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {output.preconditions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-slate-200">{item.category}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p>
                <p className="mt-2 text-xs text-slate-500">Relação: {item.relationship} · confiança {confidencePt(item.confidence)}</p>
                {item.evidence.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-500">
                    {item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {(output.uncertainties.length > 0 || output.limitations.length > 0) && (
        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
          <h2 className="text-base font-semibold text-white">Incertezas e limitações</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
            {[...output.uncertainties, ...output.limitations].map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
