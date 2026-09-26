'use client'

import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { useI18n } from '@/lib/i18n'
import { localizeActor, localizeAssuranceText } from '@/lib/sera-vnext/engine-v0/localization'
import { CanonicalDecisionJourney } from './CanonicalDecisionJourney'
import { CandidateRiskCard } from './CandidateRiskCard'

function statusLabel(value: string, pt: boolean): string {
  const ptLabels: Record<string, string> = {
    CANDIDATE: 'Candidato',
    NO_FAILURE: 'Sem falha independente',
    INSUFFICIENT_EVIDENCE: 'Evidência insuficiente',
    UNRESOLVED: 'Não resolvido',
    PROGRESSIVE_ZONE: 'Zona progressiva',
    NO_HUMAN_ESCAPE_POINT: 'Sem ponto de fuga humano',
  }
  const enLabels: Record<string, string> = {
    CANDIDATE: 'Candidate',
    NO_FAILURE: 'No independent failure',
    INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
    UNRESOLVED: 'Unresolved',
    PROGRESSIVE_ZONE: 'Progressive zone',
    NO_HUMAN_ESCAPE_POINT: 'No human escape point',
  }
  return (pt ? ptLabels : enLabels)[value] ?? value
}

function confidenceLabel(value: string | null | undefined, pt: boolean): string {
  if (value === 'HIGH') return pt ? 'Alta' : 'High'
  if (value === 'MEDIUM') return pt ? 'Média' : 'Medium'
  if (value === 'LOW') return pt ? 'Baixa' : 'Low'
  return value ?? '-'
}

function axisTitle(axis: string, pt: boolean): string {
  if (axis === 'P') return pt ? 'Percepção' : 'Perception'
  if (axis === 'O') return pt ? 'Objetivo' : 'Objective'
  return pt ? 'Ação' : 'Action'
}

function stageLabel(value: string, pt: boolean): string {
  const ptLabels: Record<string, string> = {
    PERCEPTION: 'PERCEPÇÃO',
    OBJECTIVE: 'OBJETIVO',
    ACTION: 'AÇÃO',
    SAFE_OPERATION: 'OPERAÇÃO SEGURA',
    ESCAPE_POINT: 'PONTO DE FUGA',
    DIRECT_ACTOR: 'ATOR DIRETO',
  }
  const enLabels: Record<string, string> = {
    PERCEPTION: 'PERCEPTION',
    OBJECTIVE: 'OBJECTIVE',
    ACTION: 'ACTION',
    SAFE_OPERATION: 'SAFE OPERATION',
    ESCAPE_POINT: 'ESCAPE POINT',
    DIRECT_ACTOR: 'DIRECT ACTOR',
  }
  return (pt ? ptLabels : enLabels)[value] ?? value
}

function relationshipLabel(value: string, pt: boolean): string {
  const ptLabels: Record<string, string> = {
    CONTEXTUAL_PRECONDITION: 'pré-condição contextual',
    ENABLING_PRECONDITION: 'pré-condição facilitadora',
    DIRECT_ESCAPE_POINT: 'ponto de fuga direto',
    POST_ESCAPE_CONSEQUENCE: 'consequência pós-ponto de fuga',
    UNRELATED_OR_UNSUPPORTED: 'hipótese indicada, não confirmada causalmente',
  }
  const enLabels: Record<string, string> = {
    CONTEXTUAL_PRECONDITION: 'contextual precondition',
    ENABLING_PRECONDITION: 'enabling precondition',
    DIRECT_ESCAPE_POINT: 'direct escape point',
    POST_ESCAPE_CONSEQUENCE: 'post-escape consequence',
    UNRELATED_OR_UNSUPPORTED: 'indicated hypothesis, not causally confirmed',
  }
  return (pt ? ptLabels : enLabels)[value] ?? value
}

function categoryLabel(value: string, pt: boolean): string {
  const ptLabels: Record<string, string> = {
    PHYSICAL_CAPABILITY: 'Capacidade física / ergonomia',
    SENSORY_LIMITATION: 'Limitação sensorial',
    KNOWLEDGE_TRAINING: 'Conhecimento / treinamento',
    TIME_PRESSURE: 'Pressão de tempo',
    ATTENTION_WORKLOAD_CONTEXT: 'Atenção / carga de trabalho',
    COMMUNICATION_INFORMATION: 'Comunicação / informação',
    PROCEDURAL_MONITORING: 'Monitoramento / procedimento',
    FEEDBACK_VERIFICATION: 'Feedback / verificação',
    INTENT_AWARENESS: 'Intenção / consciência',
    TEAM_COORDINATION: 'Coordenação de equipe',
    ENVIRONMENTAL_CONTEXT: 'Contexto ambiental',
    TECHNICAL_CONTEXT: 'Contexto técnico',
    ORGANIZATIONAL_CONTEXT: 'Contexto organizacional / supervisão',
  }
  const enLabels: Record<string, string> = {
    PHYSICAL_CAPABILITY: 'Physical capability / ergonomics',
    SENSORY_LIMITATION: 'Sensory limitation',
    KNOWLEDGE_TRAINING: 'Knowledge / training',
    TIME_PRESSURE: 'Time pressure',
    ATTENTION_WORKLOAD_CONTEXT: 'Attention / workload',
    COMMUNICATION_INFORMATION: 'Communication / information',
    PROCEDURAL_MONITORING: 'Monitoring / procedure',
    FEEDBACK_VERIFICATION: 'Feedback / verification',
    INTENT_AWARENESS: 'Intent / awareness',
    TEAM_COORDINATION: 'Team coordination',
    ENVIRONMENTAL_CONTEXT: 'Environmental context',
    TECHNICAL_CONTEXT: 'Technical context',
    ORGANIZATIONAL_CONTEXT: 'Organizational / supervision context',
  }
  return (pt ? ptLabels : enLabels)[value] ?? value
}

export function VNextEventAnalysisPanel({ output }: { output: SeraVNextEngineOutput }) {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  const axes = [output.axes.perception, output.axes.objective, output.axes.action]
  const actor = localizeActor(output.directActor.actor, locale)
  const operationalObservations = output.factualExtraction.evidence
    .filter((item) =>
      item.sourceSection === 'REPORT_ANALYSIS' &&
      item.assertionStatus === 'AFFIRMED' &&
      /\b(reconfirma[cç][aã]o|c[oó]digo 9p|cross-check|checklist|barreira|monitoramento|monitoring|verification|coordena[cç][aã]o|coordination)\b/i.test(item.statement),
    )
    .map((item) => item.statement)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 6)

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-4">
        <p className="text-sm font-semibold text-amber-300">
          {pt ? 'Análise SERA — revisão humana requerida' : 'SERA analysis — human review required'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
          {pt
            ? 'O motor 0.3 apresenta a classificação metodológica e toda a trilha de decisão. A liberação formal permanece condicionada à revisão humana.'
            : 'Engine 0.3 presents the methodological classification and full decision trace. Formal release remains subject to human review.'}
        </p>
      </div>

      {output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION' && (
        <section className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-5">
          <h2 className="text-base font-semibold text-amber-200">
            {pt ? 'Análise incompleta — dados adicionais necessários' : 'Incomplete analysis — additional information required'}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/80">
            {pt
              ? 'O motor interrompeu a análise porque a evidência disponível não permite avançar sem inferência. Responda às perguntas abaixo e reexecute a análise; nenhum código bloqueado deve ser tratado como conclusão.'
              : 'The engine stopped because the available evidence does not support further traversal without inference. Answer the questions below and rerun the analysis; no blocked code should be treated as a conclusion.'}
          </p>
          <div className="mt-4 space-y-3">
            {output.evidenceSufficiency.questions.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-amber-600/30 bg-slate-950/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">
                  {pt ? 'Pergunta' : 'Question'} {index + 1} · {stageLabel(item.stage, pt)}
                </p>
                <p className="mt-2 text-sm text-slate-100">{item.question}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  {pt ? 'Por que é necessária' : 'Why it is needed'}: {item.whyNeeded}
                </p>
                {item.linkedNodeId && (
                  <p className="mt-1 text-xs text-slate-500">
                    {pt ? 'Nó canônico bloqueado' : 'Blocked canonical node'}: {item.linkedNodeId}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-500">
                  {pt ? 'Evidência solicitada' : 'Requested evidence'}: {item.requestedEvidence.join('; ')}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="text-base font-semibold text-white">
          {pt ? 'Ponto de fuga da operação segura' : 'Safe-operation escape point'}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-200">
          {output.escapePoint.statement ?? (pt ? 'Não estabelecido.' : 'Not established.')}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-xs text-slate-500">{pt ? 'Status' : 'Status'}</p>
            <p className="mt-1 text-sm text-slate-200">{statusLabel(output.escapePoint.status, pt)}</p>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-xs text-slate-500">{pt ? 'Ator direto' : 'Direct actor'}</p>
            <p className="mt-1 text-sm text-slate-200">{actor ?? (pt ? 'Não resolvido' : 'Unresolved')}</p>
          </div>
          <div className="rounded-lg bg-slate-800 p-3">
            <p className="text-xs text-slate-500">{pt ? 'Confiança' : 'Confidence'}</p>
            <p className="mt-1 text-sm text-slate-200">{confidenceLabel(output.escapePoint.confidence, pt)}</p>
          </div>
        </div>
        {output.escapePoint.supportingEvidence.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {pt ? 'Evidência de suporte' : 'Supporting evidence'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-300">
              {output.escapePoint.supportingEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
        {output.escapePoint.excludedPostEscapeEvidence.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {pt ? 'Evidência posterior excluída da causalidade' : 'Post-escape evidence excluded from causality'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
              {output.escapePoint.excludedPostEscapeEvidence.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {axes.map((axis) => {
          const unresolved = !axis.proposedCode || axis.status === 'UNRESOLVED' || axis.status === 'INSUFFICIENT_EVIDENCE'
          const conditionalAlternatives = axis.alternativesConsidered.filter((item) => /^[POA]-[A-Z]$/.test(item))
          return (
            <div key={axis.axis} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">{axisTitle(axis.axis, pt)}</p>
              <p className="mt-2 text-xl font-bold text-white">{axis.proposedCode ?? '—'}</p>
              <p className="mt-1 text-xs text-slate-500">
                {statusLabel(axis.status, pt)}
                {' · '}
                {unresolved
                  ? (pt ? 'confiança da classificação: não aplicável' : 'classification confidence: not applicable')
                  : `${pt ? 'confiança' : 'confidence'} ${confidenceLabel(axis.confidence, pt)}`}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {axis.statementAtEscapePoint ?? (pt ? 'Eixo não resolvido pela evidência disponível.' : 'Axis unresolved by the available evidence.')}
              </p>
              {unresolved && conditionalAlternatives.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs font-semibold text-slate-400">
                    {pt ? 'Hipóteses ainda compatíveis — dependem das respostas' : 'Still-compatible hypotheses — dependent on clarification'}
                  </p>
                  <p className="mt-1 text-sm font-mono text-cyan-300">{conditionalAlternatives.join(' / ')}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pt ? 'Não são códigos concluídos nem liberados.' : 'These are not concluded or released codes.'}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <CandidateRiskCard
        perception={output.axes.perception.proposedCode}
        objective={output.axes.objective.proposedCode}
        action={output.axes.action.proposedCode}
      />

      <CanonicalDecisionJourney paths={output.canonicalTraversal.paths} />

      <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
        <h2 className="text-base font-semibold text-white">{pt ? 'Pré-condições' : 'Preconditions'}</h2>
        {output.preconditions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            {pt ? 'Nenhuma pré-condição causal sustentada pela evidência disponível.' : 'No causal precondition is supported by the available evidence.'}
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {output.preconditions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
                <p className="text-sm font-semibold text-slate-200">{categoryLabel(item.category, pt)}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {pt ? 'Relação' : 'Relationship'}: {relationshipLabel(item.relationship, pt)}
                  {' · '}
                  {pt ? 'confiança' : 'confidence'} {confidenceLabel(item.confidence, pt)}
                </p>
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

      {operationalObservations.length > 0 && (
        <section className="rounded-xl border border-blue-800/50 bg-blue-950/15 p-5">
          <h2 className="text-base font-semibold text-white">{pt ? 'Barreiras e observações operacionais do relatório-fonte' : 'Source-report operational barriers and observations'}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {pt
              ? 'Itens explicitamente registrados pela investigação e úteis para revisão humana. Eles são preservados separadamente das pré-condições para evitar transformar conclusão/recomendação do relatório em causalidade automática.'
              : 'Items explicitly recorded by the investigation and useful for human review. They are kept separate from preconditions to avoid converting report conclusions/recommendations into automatic causality.'}
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-relaxed text-slate-300">
            {operationalObservations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      )}

      {(output.uncertainties.length > 0 || output.limitations.length > 0) && (
        <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-5">
          <h2 className="text-base font-semibold text-white">{pt ? 'Incertezas e limitações' : 'Uncertainties and limitations'}</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
            {[...output.uncertainties, ...output.limitations].map((item) => (
              <li key={item}>{localizeAssuranceText(item, locale)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
