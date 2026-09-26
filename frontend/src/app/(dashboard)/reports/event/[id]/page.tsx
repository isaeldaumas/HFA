'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { PrintReportButton } from '@/components/product/PrintReportButton'
import { apiCall } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { describeErcValue, buildErcContainmentNotice } from '@/lib/risk-profile/erc-containment'
import type { SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { inferOccurrenceDateFromNarrative } from '@/lib/sera-vnext/occurrence-date'
import { useI18n } from '@/lib/i18n'
import { localizeActor, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildExecutiveSummary, computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel } from '@/lib/sera-vnext/presentation'
import { CanonicalTreeDiagram } from '@/components/sera-vnext/CanonicalTreeDiagram'

type Recommendation = {
  related_code?: string | null
  title?: string | null
  description?: string | null
}

type Precondition = {
  code?: string | null
  name?: string | null
  justification?: string | null
}

type AnalysisPayload = {
  id: string
  created_at?: string | null
  summary?: string | null
  event_summary?: string | null
  event_date?: string | null
  operation_type?: string | null
  perception_code?: string | null
  perception_name?: string | null
  objective_code?: string | null
  objective_name?: string | null
  action_code?: string | null
  action_name?: string | null
  erc_level?: number | null
  preconditions?: Precondition[] | null
  recommendations?: Recommendation[] | null
  engine_id?: string | null
  motor_version?: string | null
  generated_by_type?: string | null
  validation_status?: string | null
}

const GENERATED_BY_LABEL_PT: Record<string, string> = {
  deterministic_engine: 'motor determinístico',
  llm_suggestion: 'sugestão de IA (não validada por humano)',
  human_analyst: 'analista humano',
  imported_legacy: 'importado (legado)',
  migration: 'migração',
  unknown_legacy: 'origem legada não rastreada',
}

const VALIDATION_LABEL_PT: Record<string, string> = {
  not_validated: 'não validado',
  pending_review: 'revisão pendente',
  validated: 'validado por humano',
  rejected: 'rejeitado',
}

type EventPayload = {
  id: string
  title?: string | null
  status?: string | null
  operation_type?: string | null
  created_at?: string | null
  occurred_at?: string | null
  deleted_at?: string | null
  raw_input?: string | null
  analyses?: AnalysisPayload | null
  vnext_analysis?: {
    id: string
    status?: string | null
    review_status?: string | null
    engine_version?: string | null
    engine_runtime_version?: string | null
    source_flow?: string | null
    engine_output?: SeraVNextEngineOutput | null
  } | null
}

function formatDate(value: string | null | undefined, locale: 'pt-BR' | 'en') {
  const missing = locale === 'pt-BR' ? 'Não informado' : 'Not provided'
  if (!value) return missing
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return missing
  return date.toLocaleDateString(locale === 'pt-BR' ? 'pt-BR' : 'en-US')
}

function canonicalQuestionLabel(nodeId: string, fallback: string, englishAnchor: string | undefined, pt: boolean): string {
  if (!pt) return englishAnchor ?? fallback
  return SERA_PT_V1_TREE.nodes.find((node) => node.nodeId === nodeId)?.question ?? fallback
}

function preconditionCategoryLabel(value: string, pt: boolean): string {
  const map: Record<string, [string, string]> = {
    PHYSICAL_CAPABILITY: ['Capacidade física / ergonomia', 'Physical capability / ergonomics'],
    SENSORY_LIMITATION: ['Limitação sensorial', 'Sensory limitation'],
    KNOWLEDGE_TRAINING: ['Conhecimento / treinamento', 'Knowledge / training'],
    TIME_PRESSURE: ['Pressão de tempo', 'Time pressure'],
    ATTENTION_WORKLOAD_CONTEXT: ['Atenção / carga de trabalho', 'Attention / workload'],
    COMMUNICATION_INFORMATION: ['Comunicação / informação', 'Communication / information'],
    PROCEDURAL_MONITORING: ['Monitoramento / procedimento', 'Monitoring / procedure'],
    FEEDBACK_VERIFICATION: ['Feedback / verificação', 'Feedback / verification'],
    INTENT_AWARENESS: ['Intenção / consciência', 'Intent / awareness'],
    TEAM_COORDINATION: ['Coordenação de equipe', 'Team coordination'],
    ENVIRONMENTAL_CONTEXT: ['Contexto ambiental', 'Environmental context'],
    TECHNICAL_CONTEXT: ['Contexto técnico', 'Technical context'],
    ORGANIZATIONAL_CONTEXT: ['Contexto organizacional / supervisão', 'Organizational / supervision context'],
  }
  const item = map[value]
  return item ? item[pt ? 0 : 1] : value
}

function preconditionRelationshipLabel(value: string, pt: boolean): string {
  const map: Record<string, [string, string]> = {
    CONTEXTUAL_PRECONDITION: ['pré-condição contextual', 'contextual precondition'],
    ENABLING_PRECONDITION: ['pré-condição facilitadora', 'enabling precondition'],
    DIRECT_ESCAPE_POINT: ['ponto de fuga direto', 'direct escape point'],
    POST_ESCAPE_CONSEQUENCE: ['consequência pós-ponto de fuga', 'post-escape consequence'],
    UNRELATED_OR_UNSUPPORTED: ['hipótese indicada, não confirmada causalmente', 'indicated hypothesis, not causally confirmed'],
  }
  const item = map[value]
  return item ? item[pt ? 0 : 1] : value
}

export default function EventReportPage() {
  const { locale } = useI18n()
  const pt = locale === 'pt-BR'
  const L = (ptText: string, enText: string) => pt ? ptText : enText
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const eventId = params?.id ?? ''
  const scope = searchParams?.get('scope') === 'deleted' ? 'deleted' : 'active'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventData, setEventData] = useState<EventPayload | null>(null)
  const [token, setToken] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        setToken(token ?? '')

        if (!token || !eventId) {
          setEventData(null)
          setLoading(false)
          return
        }

        const payload = (await apiCall(`/events/${eventId}?scope=${scope}`, {}, token)) as EventPayload
        setEventData(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : (pt ? 'Falha ao carregar evento' : 'Failed to load event'))
        setEventData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [eventId, scope, pt])

  const analysis = eventData?.analyses ?? null
  const vnextAnalysis = eventData?.vnext_analysis ?? null
  const vnextOutput = vnextAnalysis?.engine_output ?? null

  const emittedAt = useMemo(() => new Date().toLocaleDateString(pt ? 'pt-BR' : 'en-US'), [pt])
  // Contenção F-04 (docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md): os dois valores
  // abaixo vêm de mecanismos ERC incompatíveis (escalas invertidas, entradas diferentes) e
  // NUNCA devem ser apresentados como o mesmo indicador. describeErcValue identifica cada um.
  const motorErc = describeErcValue('MOTOR_HEURISTIC_V1', analysis?.erc_level ?? null)
  const armsErc = analysis
    ? describeErcValue('ARMS_CODE_MATRIX_V1', {
        p: analysis.perception_code ?? null,
        o: analysis.objective_code ?? null,
        a: analysis.action_code ?? null,
      })
    : null

  const eventTitle = eventData?.title ?? analysis?.summary ?? `${L('Evento', 'Event')} ${eventId}`

  const eventDate = eventData?.occurred_at ?? inferOccurrenceDateFromNarrative(eventData?.raw_input ?? null) ?? analysis?.event_date ?? eventData?.created_at

  const eventType = analysis?.operation_type ?? eventData?.operation_type ?? L('Não informado', 'Not provided')

  const summaryText = vnextOutput
    ? buildExecutiveSummary({ title: eventTitle, occurredAt: eventDate, output: vnextOutput, pt })
    : analysis?.summary ?? analysis?.event_summary ?? L('Resumo não disponível. Consulte o registro original do evento quando necessário.', 'Summary unavailable. Consult the original event record when necessary.')
  const candidateAttention = vnextOutput
    ? computeCandidateAttention(vnextOutput.axes.perception.proposedCode, vnextOutput.axes.objective.proposedCode, vnextOutput.axes.action.proposedCode)
    : null

  const preconditions = analysis?.preconditions ?? []
  const vnextPreconditions = vnextOutput?.preconditions ?? []
  const supportedVnextPreconditions = vnextPreconditions.filter((item) =>
    item.relationship === 'CONTEXTUAL_PRECONDITION' || item.relationship === 'ENABLING_PRECONDITION',
  )
  const hypothesisVnextPreconditions = vnextPreconditions.filter((item) =>
    item.relationship !== 'CONTEXTUAL_PRECONDITION' && item.relationship !== 'ENABLING_PRECONDITION',
  )
  const recommendations = analysis?.recommendations ?? []
  const operationalObservations = (vnextOutput?.factualExtraction.evidence ?? [])
    .filter((item) =>
      item.sourceSection === 'REPORT_ANALYSIS' &&
      item.assertionStatus === 'AFFIRMED' &&
      /\b(reconfirma[cç][aã]o|c[oó]digo 9p|cross-check|checklist|barreira|monitoramento|monitoring|verification|coordena[cç][aã]o|coordination)\b/i.test(item.statement),
    )
    .map((item) => item.statement)
    .filter((item, index, all) => all.indexOf(item) === index)
    .slice(0, 6)

  async function downloadMethodologicalPdf() {
    if (!vnextAnalysis?.id || !token) return
    setPdfBusy(true)
    setPdfError(null)
    try {
      const response = await fetch(`/api/sera/analyses/${vnextAnalysis.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `HFA_SERA_${eventId}.pdf`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : L('Falha ao gerar PDF', 'Failed to generate PDF'))
    } finally {
      setPdfBusy(false)
    }
  }

  if (loading) {
    return <div className="p-8 text-slate-400">{L('Carregando relatório do evento...', 'Loading event report...')}</div>
  }

  return (
    <div className="report-page p-8 max-w-5xl mx-auto space-y-6">
      <div className="screen-only flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{L('Relatório individual de evento', 'Individual event report')}</h1>
          <p className="text-slate-400 mt-1">{L('Resumo para impressão, análise técnica, reuniões e auditorias internas.', 'Print-friendly summary for technical analysis, meetings, and internal audits.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {vnextAnalysis?.id ? (
            <button
              type="button"
              onClick={() => void downloadMethodologicalPdf()}
              disabled={pdfBusy || !token}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {pdfBusy ? L('Gerando PDF…', 'Generating PDF…') : L('Baixar PDF formatado', 'Download formatted PDF')}
            </button>
          ) : (
            <PrintReportButton />
          )}
          <Link
            href={scope === 'deleted' ? '/events/deleted' : `/events/${eventId}`}
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {scope === 'deleted' ? L('Voltar aos excluídos', 'Back to deleted events') : L('Voltar ao evento', 'Back to event')}
          </Link>
        </div>
      </div>
      {pdfError && <div className="screen-only rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{L('Falha ao gerar o PDF', 'Failed to generate PDF')}: {pdfError}</div>}

      <article className="report-shell bg-white text-black rounded-lg p-8 shadow">
        <header className="border-b border-slate-300 pb-4 mb-6 space-y-2">
          <h2 className="text-2xl font-bold">{L('Relatório Individual de Evento', 'Individual Event Report')}</h2>
          <p className="text-sm text-slate-700">{L('Data de emissão', 'Issue date')}: {emittedAt}</p>
          <p className="text-sm text-slate-700">{L('Identificação', 'Identification')}: {eventId || L('Não informada', 'Not provided')}</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            {L('Documento de apoio à análise técnica. Não substitui investigação formal, validação humana de Safety Issues ou avaliação completa de risco operacional.', 'Technical-analysis support document. It does not replace a formal investigation, human validation of Safety Issues, or a complete operational-risk assessment.')}
          </p>
        </header>

        {!eventData && (
          <section className="report-section">
            <p className="report-note">
              {L('Dados indisponíveis para este relatório.', 'Data unavailable for this report.')}
            </p>
            {error && <p className="report-note mt-1">{L('Motivo técnico', 'Technical reason')}: {error}</p>}
          </section>
        )}

        {eventData?.deleted_at && (
          <section className="report-section">
            <p className="report-note">
              {L('Este evento está em recuperação e não integra listas ativas, dashboard ou Perfil de Risco.', 'This event is in recovery and is not included in active lists, the dashboard, or the Risk Profile.')}
            </p>
          </section>
        )}

        <section className="report-section">
          <h3 className="report-title">1. {L('Resumo do evento', 'Event summary')}</h3>
          <div className="report-box space-y-2">
            <p><strong>{L('Título', 'Title')}:</strong> {eventTitle}</p>
            <p><strong>{L('Data', 'Date')}:</strong> {formatDate(eventDate, locale)}</p>
            <p><strong>{L('Tipo/categoria', 'Type/category')}:</strong> {eventType}</p>
            <div>
              <p><strong>{L('Resumo técnico', 'Technical summary')}:</strong></p>
              <p className="mt-1 leading-relaxed">{summaryText}</p>
            </div>
            {vnextOutput && vnextOutput.escapePoint.supportingEvidence.length > 0 && (
              <div className="mt-3">
                <p><strong>{L('Fatos-chave considerados', 'Key facts considered')}:</strong></p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {vnextOutput.escapePoint.supportingEvidence.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="report-section">
          <h3 className="report-title">2. {L('Classificação SERA', 'SERA classification')}</h3>
          {vnextOutput ? (
            <>
              <div className="report-box space-y-1">
                <p><strong>{L('Ponto de fuga', 'Escape point')}:</strong> {vnextOutput.escapePoint.statement ?? L('Não estabelecido', 'Not established')}</p>
                <p><strong>{L('Ator direto', 'Direct actor')}:</strong> {localizeActor(vnextOutput.directActor.actor, locale) ?? L('Não resolvido', 'Unresolved')}</p>
                <p><strong>{L('Percepção', 'Perception')}:</strong> {vnextOutput.axes.perception.proposedCode ?? L('Não resolvida', 'Unresolved')}</p>
                <p><strong>{L('Objetivo', 'Objective')}:</strong> {vnextOutput.axes.objective.proposedCode ?? L('Não resolvido', 'Unresolved')}</p>
                <p><strong>{L('Ação', 'Action')}:</strong> {vnextOutput.axes.action.proposedCode ?? L('Não resolvida', 'Unresolved')}</p>
              </div>
              <p className="report-note">
                {L('Análise produzida pelo motor SERA 0.3. A liberação formal dos códigos permanece condicionada à revisão humana.', 'Analysis produced by SERA engine 0.3. Formal code release remains subject to human review.')}
              </p>
              <p className="report-note">
                <strong>{L('Motor', 'Engine')}:</strong> SERA 0.3 {vnextAnalysis?.engine_runtime_version ?? vnextAnalysis?.engine_version ?? ''}
                {pt ? ' — fluxo ' : ' — flow '}{vnextAnalysis?.source_flow ?? 'VNEXT_CANONICAL'}
                {pt ? ' — revisão ' : ' — review '}{vnextAnalysis?.review_status ?? 'NOT_REVIEWED'}
              </p>
              {vnextOutput.evidenceSufficiency.status === 'NEEDS_CLARIFICATION' && vnextOutput.evidenceSufficiency.questions.length > 0 ? (
                <div className="report-box mt-3 space-y-3">
                  <p><strong>{L('Análise incompleta — dados adicionais necessários', 'Incomplete analysis — additional information required')}</strong></p>
                  {vnextOutput.evidenceSufficiency.questions.map((question, index) => (
                    <div key={question.id} className={index > 0 ? 'border-t border-slate-200 pt-3' : ''}>
                      <p><strong>{index + 1}. {question.question}</strong></p>
                      <p className="text-sm text-slate-700 mt-1">{L('Por que é necessário', 'Why it is needed')}: {question.whyNeeded}</p>
                      {question.linkedNodeId ? <p className="text-sm text-slate-700 mt-1">{L('Nó bloqueado', 'Blocked node')}: {question.linkedNodeId}</p> : null}
                      {question.requestedEvidence.length > 0 ? <p className="text-sm text-slate-700 mt-1">{L('Evidência solicitada', 'Requested evidence')}: {question.requestedEvidence.join(' | ')}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="report-box space-y-1">
                <p><strong>Percepcao:</strong> {analysis?.perception_code ?? 'Nao disponivel'}</p>
                <p><strong>Objetivo:</strong> {analysis?.objective_code ?? 'Nao disponivel'}</p>
                <p><strong>Acao:</strong> {analysis?.action_code ?? 'Nao disponivel'}</p>
              </div>
              <p className="report-note">
                A classificacao depende da evidencia disponivel no relato analisado e requer revisao humana antes de qualquer conclusao formal.
              </p>
              <p className="report-note">
                <strong>Motor:</strong> {analysis?.engine_id ?? 'não identificado'}
                {analysis?.motor_version ? ` v${analysis.motor_version}` : ''}
                {' — '}
                {GENERATED_BY_LABEL_PT[analysis?.generated_by_type ?? ''] ?? 'origem não identificada'}
                {' — '}
                {VALIDATION_LABEL_PT[analysis?.validation_status ?? ''] ?? 'status de validação desconhecido'}
              </p>
            </>
          )}
        </section>

        <section className="report-section">
          <h3 className="report-title">3. {L('Avaliação de risco (apoio à triagem)', 'Risk assessment (triage support)')}</h3>
          {vnextOutput ? (
            <>
              <div className="report-box space-y-2">
                {candidateAttention ? (
                  <>
                    <p><strong>{L('Índice HFA de atenção operacional', 'HFA operational-attention index')}:</strong> {candidateAttention.score}/100 — {pt ? candidateAttention.labelPt : candidateAttention.labelEn}</p>
                    <p className="text-sm text-slate-700">{L('Eixos com falha ativa identificada', 'Axes with identified active failure')}: {candidateAttention.activeAxes.length ? candidateAttention.activeAxes.join(', ') : L('nenhum', 'none')}.</p>
                  </>
                ) : <p>{L('Dados insuficientes para o índice preliminar.', 'Insufficient data for the preliminary index.')}</p>}
              </div>
              <p className="report-note">{L('Indicador provisório de priorização baseado nos candidatos P/O/A. Não é ERC/ARMS canônico, não estima probabilidade de acidente e não substitui a avaliação operacional de risco. O valor deve ser lido junto com as ações corretivas e a revisão humana.', 'Provisional prioritization indicator based on P/O/A candidates. It is not canonical ERC/ARMS, does not estimate accident probability, and does not replace operational risk assessment. Read it together with corrective actions and human review.')}</p>
            </>
          ) : (
            <>
              <div className="report-box space-y-1">
                <p>{motorErc.label}</p>
                <p>{armsErc?.label ?? L('Matriz ARMS a partir dos códigos: não disponível', 'ARMS matrix from codes: unavailable')}</p>
              </div>
              <p className="report-note">{buildErcContainmentNotice()}</p>
            </>
          )}
        </section>

        <section className="report-section">
          <h3 className="report-title">4. {L('Pré-condições e hipóteses contextuais', 'Preconditions and contextual hypotheses')}</h3>
          {vnextOutput && vnextPreconditions.length > 0 ? (
            <div className="space-y-4">
              {supportedVnextPreconditions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">{L('Pré-condições sustentadas pela evidência', 'Preconditions supported by the evidence')}</p>
                  {supportedVnextPreconditions.map((item) => (
                    <div key={item.id} className="report-box">
                      <p><strong>{preconditionCategoryLabel(item.category, pt)}:</strong> {item.description}</p>
                      <p className="text-sm text-slate-700 mt-1">{L('Relação', 'Relationship')}: {preconditionRelationshipLabel(item.relationship, pt)}</p>
                      {item.evidence.length > 0 ? <p className="text-sm text-slate-700 mt-1">{L('Evidência', 'Evidence')}: {item.evidence.join(' | ')}</p> : null}
                    </div>
                  ))}
                </div>
              )}
              {hypothesisVnextPreconditions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-amber-800">{L('Hipóteses preservadas — não confirmadas causalmente', 'Retained hypotheses — not causally confirmed')}</p>
                  <p className="text-xs text-slate-600">{L('Estes itens aparecem porque foram mencionados ou sugeridos no material-fonte, mas não entram como pré-condições confirmadas nem no Perfil de Risco.', 'These items appear because they were mentioned or suggested in the source material, but they do not count as confirmed preconditions or enter the Risk Profile.')}</p>
                  {hypothesisVnextPreconditions.map((item) => (
                    <div key={item.id} className="report-box bg-amber-50">
                      <p><strong>{preconditionCategoryLabel(item.category, pt)}:</strong> {item.description}</p>
                      <p className="text-sm text-slate-700 mt-1">{L('Relação', 'Relationship')}: {preconditionRelationshipLabel(item.relationship, pt)}</p>
                      {item.evidence.length > 0 ? <p className="text-sm text-slate-700 mt-1">{L('Evidência contextual', 'Contextual evidence')}: {item.evidence.join(' | ')}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : preconditions.length > 0 ? (
            <div className="space-y-2">
              {preconditions.map((item, idx) => (
                <div key={(item.code ?? 'factor') + '-' + String(idx)} className="report-box">
                  <p><strong>{item.code ?? L('Sem código', 'No code')}:</strong> {item.name ?? L('Fator observado', 'Observed factor')}</p>
                  {item.justification ? <p className="text-sm text-slate-700 mt-1">{item.justification}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="report-box">
              <p>{L('Fatores específicos dependem da análise concluída e da evidência registrada no evento.', 'Specific factors depend on the completed analysis and evidence recorded for the event.')}</p>
            </div>
          )}
        </section>

        {vnextOutput && operationalObservations.length > 0 && (
          <section className="report-section">
            <h3 className="report-title">5. {L('Barreiras e observações operacionais', 'Operational barriers and observations')}</h3>
            <div className="report-box">
              <p className="text-sm text-slate-700">{L('Itens explicitamente registrados pela investigação e preservados para revisão humana, sem transformá-los automaticamente em pré-condições causais.', 'Items explicitly recorded by the investigation and retained for human review without automatically converting them into causal preconditions.')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {operationalObservations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </section>
        )}

        <section className="report-section">
          <h3 className="report-title">{vnextOutput ? '6' : '5'}. {L('Recomendações e ações sugeridas', 'Recommendations and suggested actions')}</h3>
          {vnextOutput ? (
            <div className="report-box">
              <p>{L('Recomendações automáticas não são liberadas pela análise SERA antes da revisão humana. Ações devem ser definidas após validação do ponto de fuga e dos eixos P/O/A.', 'Automatic recommendations are not released by SERA analysis before human review. Actions should be defined after validation of the escape point and P/O/A axes.')}</p>
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.map((item, idx) => (
                <div key={`${item.related_code ?? 'rec'}-${idx}`} className="report-box">
                  <p><strong>{item.title ?? L('Recomendação SERA', 'SERA recommendation')}</strong></p>
                  {item.description ? <p className="text-sm text-slate-700 mt-1">{item.description}</p> : null}
                  {item.related_code ? <p className="text-xs text-slate-600 mt-1">{L('Código relacionado', 'Related code')}: {item.related_code}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="report-box">
              <p>{L('Dados indisponíveis. Use o módulo de ações para rastrear tratativas quando houver recomendações registradas.', 'Data unavailable. Use the actions module to track follow-up when recommendations are recorded.')}</p>
            </div>
          )}
        </section>

        {vnextOutput && (
          <section className="report-section">
            <h3 className="report-title">7. {L('Como o sistema chegou à classificação', 'How the system reached the classification')}</h3>
            <p className="report-note mb-3">{L('A árvore mostra todos os caminhos possíveis do SERA. O percurso usado nesta análise aparece destacado e os ramos não seguidos permanecem visíveis; abaixo ficam pergunta, resposta e justificativa.', 'The tree shows every possible SERA path. The route used in this analysis is highlighted while paths not taken remain visible; question, answer, and rationale follow below.')}</p>
            <div className="space-y-4">
              {vnextOutput.canonicalTraversal.paths.map((path) => (
                <div key={path.axis} className="report-box">
                  <p><strong>{path.axis === 'P' ? L('Percepção', 'Perception') : path.axis === 'O' ? L('Objetivo', 'Objective') : L('Ação', 'Action')} — {L('resultado', 'result')} {path.candidateCode ?? L('não resolvido', 'unresolved')}</strong></p>
                  <div className="mt-3 rounded-xl bg-slate-950 p-3">
                    <CanonicalTreeDiagram path={path} pt={pt} />
                  </div>
                  <div className="mt-4 space-y-3">
                    {path.answers.map((node, index) => (
                      <div key={`${path.axis}-${node.nodeId}-detail`} className={index > 0 ? 'border-t border-slate-200 pt-3' : ''}>
                        <p><strong>{L('Etapa', 'Step')} {index + 1} — {friendlyNodeLabel(node.nodeId, pt)}</strong></p>
                        <p className="mt-1 text-sm">{canonicalQuestionLabel(node.nodeId, node.question, node.exactQuestionTextENAnchor, pt)}</p>
                        <p className="mt-1 text-sm"><strong>{L('Resposta', 'Answer')}:</strong> {friendlyAnswerLabel(node.answer, pt)}</p>
                        {node.rationale ? <p className="mt-1 text-sm text-slate-700"><strong>{L('Por que', 'Why')}:</strong> {localizeRationale(node.rationale, locale)}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="report-section">
          <h3 className="report-title">{vnextOutput ? '8' : '6'}. {L('Limitações da análise', 'Analysis limitations')}</h3>
          <ul className="report-list">
            <li>{L('A análise depende da qualidade e completude da evidência registrada.', 'The analysis depends on the quality and completeness of the recorded evidence.')}</li>
            <li>{L('Ausência de informação pode reduzir a precisão classificatória.', 'Missing information may reduce classification precision.')}</li>
            <li>{L('A classificação SERA não substitui investigação formal da ocorrência.', 'SERA classification does not replace a formal occurrence investigation.')}</li>
            <li>{L('A avaliação de risco requer contexto operacional, exposição e revisão humana.', 'Risk assessment requires operational context, exposure, and human review.')}</li>
          </ul>
        </section>

        <section className="report-section">
          <h3 className="report-title">{vnextOutput ? '9' : '7'}. {L('Próximos passos sugeridos', 'Suggested next steps')}</h3>
          <ul className="report-list">
            <li>{L('Revisar evidências e complementar informações faltantes.', 'Review evidence and complete missing information.')}</li>
            <li>{L('Transformar recomendações em ações corretivas rastreáveis.', 'Convert recommendations into traceable corrective actions.')}</li>
            <li>{L('Validar tecnicamente candidatos e hipóteses com a equipe responsável.', 'Technically validate candidates and hypotheses with the responsible team.')}</li>
            <li>{L('Acompanhar recorrência e sinais organizacionais no Risk Profile.', 'Monitor recurrence and organizational signals in the Risk Profile.')}</li>
          </ul>
        </section>
      </article>

      <div className="screen-only flex flex-wrap gap-2">
        <Link
          href="/events"
          className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {L('Ver eventos', 'View events')}
        </Link>
        <Link
          href="/risk-profile"
          className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {L('Ver Risk Profile', 'View Risk Profile')}
        </Link>
      </div>

      <style jsx global>{`
        @media print {
          .screen-only {
            display: none !important;
          }
          body {
            background: #ffffff !important;
          }
          .report-page {
            margin: 0 !important;
            max-width: 100% !important;
            padding: 0 !important;
          }
          .report-shell {
            box-shadow: none !important;
            border-radius: 0 !important;
            margin: 0 !important;
            padding: 0.5in !important;
          }
          .report-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
        .report-section {
          margin-top: 1.25rem;
        }
        .report-title {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .report-list {
          margin: 0.5rem 0 0 1rem;
          font-size: 0.9rem;
          line-height: 1.5;
          color: #334155;
        }
        .report-box {
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          padding: 0.625rem;
          font-size: 0.9rem;
          line-height: 1.5;
          color: #334155;
        }
        .report-note {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #475569;
        }
        .report-flow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
        }
        .report-flow-item {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .report-flow-node {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.15rem 0.4rem;
          align-items: center;
          min-width: 8.8rem;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          border-radius: 0.5rem;
          padding: 0.45rem 0.55rem;
        }
        .report-step { grid-row: 1 / 3; font-weight: 700; color: #1d4ed8; }
        .report-flow-label { font-size: 0.72rem; font-weight: 700; color: #1e3a5f; }
        .report-flow-answer { font-size: 0.68rem; color: #475569; }
        .report-arrow { color: #64748b; font-weight: 700; }
      `}</style>
    </div>
  )
}
