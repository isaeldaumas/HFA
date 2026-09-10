'use client'

import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { PrintReportButton } from '@/components/product/PrintReportButton'
import { apiCall } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { describeErcValue, buildErcContainmentNotice } from '@/lib/risk-profile/erc-containment'

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
  analyses?: AnalysisPayload | null
}

function formatDate(value?: string | null) {
  if (!value) return 'Nao informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Nao informado'
  return date.toLocaleDateString('pt-BR')
}

export default function EventReportPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const eventId = params?.id ?? ''
  const scope = searchParams?.get('scope') === 'deleted' ? 'deleted' : 'active'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [eventData, setEventData] = useState<EventPayload | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token

        if (!token || !eventId) {
          setEventData(null)
          setLoading(false)
          return
        }

        const payload = (await apiCall(`/events/${eventId}?scope=${scope}`, {}, token)) as EventPayload
        setEventData(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar evento')
        setEventData(null)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [eventId, scope])

  const analysis = eventData?.analyses ?? null

  const emittedAt = useMemo(() => new Date().toLocaleDateString('pt-BR'), [])
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

  const eventTitle = eventData?.title ?? analysis?.summary ?? `Evento ${eventId}`

  const eventDate = analysis?.event_date ?? eventData?.occurred_at ?? eventData?.created_at

  const eventType = analysis?.operation_type ?? eventData?.operation_type ?? 'Nao informado'

  const summaryText = analysis?.summary ?? analysis?.event_summary ?? 'Dados indisponíveis'

  const preconditions = analysis?.preconditions ?? []
  const recommendations = analysis?.recommendations ?? []

  if (loading) {
    return <div className="p-8 text-slate-400">Carregando relatorio do evento...</div>
  }

  return (
    <div className="report-page p-8 max-w-5xl mx-auto space-y-6">
      <div className="screen-only flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Relatorio individual de evento</h1>
          <p className="text-slate-400 mt-1">Resumo print-friendly para analise tecnica, reunioes e auditorias internas.</p>
        </div>
        <div className="flex gap-2">
          <PrintReportButton />
          <Link
            href={scope === 'deleted' ? '/events/deleted' : `/events/${eventId}`}
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {scope === 'deleted' ? 'Voltar aos excluídos' : 'Voltar ao evento'}
          </Link>
        </div>
      </div>

      <article className="report-shell bg-white text-black rounded-lg p-8 shadow">
        <header className="border-b border-slate-300 pb-4 mb-6 space-y-2">
          <h2 className="text-2xl font-bold">Relatorio Individual de Evento</h2>
          <p className="text-sm text-slate-700">Data de emissao: {emittedAt}</p>
          <p className="text-sm text-slate-700">Identificacao: {eventId || 'Nao informada'}</p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Documento de apoio a analise tecnica. Nao substitui investigacao formal, validacao humana de Safety Issues ou avaliacao completa de risco operacional.
          </p>
        </header>

        {!eventData && (
          <section className="report-section">
            <p className="report-note">
              Dados indisponíveis para este relatório.
            </p>
            {error && <p className="report-note mt-1">Motivo tecnico: {error}</p>}
          </section>
        )}

        {eventData?.deleted_at && (
          <section className="report-section">
            <p className="report-note">
              Este evento está em recuperação e não integra listas ativas, dashboard ou Perfil de Risco.
            </p>
          </section>
        )}

        <section className="report-section">
          <h3 className="report-title">1. Resumo do evento</h3>
          <div className="report-box space-y-2">
            <p><strong>Titulo:</strong> {eventTitle}</p>
            <p><strong>Data:</strong> {formatDate(eventDate)}</p>
            <p><strong>Tipo/categoria:</strong> {eventType}</p>
            <p><strong>Relato:</strong> {summaryText}</p>
          </div>
        </section>

        <section className="report-section">
          <h3 className="report-title">2. Classificacao SERA</h3>
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
        </section>

        <section className="report-section">
          <h3 className="report-title">3. Avaliacao de risco (apoio a triagem)</h3>
          <div className="report-box space-y-1">
            <p>{motorErc.label}</p>
            <p>{armsErc?.label ?? 'Matriz ARMS a partir dos códigos: não disponível'}</p>
          </div>
          <p className="report-note">
            {buildErcContainmentNotice()}
          </p>
        </section>

        <section className="report-section">
          <h3 className="report-title">4. Principais fatores humanos observados</h3>
          {preconditions.length > 0 ? (
            <div className="space-y-2">
              {preconditions.map((item, idx) => (
                <div key={`${item.code ?? 'factor'}-${idx}`} className="report-box">
                  <p><strong>{item.code ?? 'Sem codigo'}:</strong> {item.name ?? 'Fator observado'}</p>
                  {item.justification ? <p className="text-sm text-slate-700 mt-1">{item.justification}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="report-box">
              <p>Fatores especificos dependem da analise concluida e da evidencia registrada no evento.</p>
            </div>
          )}
        </section>

        <section className="report-section">
          <h3 className="report-title">5. Recomendacoes e acoes sugeridas</h3>
          {recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.map((item, idx) => (
                <div key={`${item.related_code ?? 'rec'}-${idx}`} className="report-box">
                  <p><strong>{item.title ?? 'Recomendacao SERA'}</strong></p>
                  {item.description ? <p className="text-sm text-slate-700 mt-1">{item.description}</p> : null}
                  {item.related_code ? <p className="text-xs text-slate-600 mt-1">Codigo relacionado: {item.related_code}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="report-box">
              <p>Dados indisponíveis. Use o módulo de ações para rastrear tratativas quando houver recomendações registradas.</p>
            </div>
          )}
        </section>

        <section className="report-section">
          <h3 className="report-title">6. Limitacoes da analise</h3>
          <ul className="report-list">
            <li>A analise depende da qualidade e completude da evidencia registrada.</li>
            <li>Ausencia de informacao pode reduzir precisao classificatoria.</li>
            <li>Classificacao SERA nao substitui investigacao formal de ocorrencia.</li>
            <li>Avaliacao de risco requer contexto operacional, exposicao e revisao humana.</li>
          </ul>
        </section>

        <section className="report-section">
          <h3 className="report-title">7. Proximos passos sugeridos</h3>
          <ul className="report-list">
            <li>Revisar evidencias e complementar informacoes faltantes.</li>
            <li>Transformar recomendacoes em acoes corretivas rastreaveis.</li>
            <li>Validar tecnicamente candidatos e hipoteses com equipe responsavel.</li>
            <li>Acompanhar recorrencia e sinais organizacionais no Risk Profile.</li>
          </ul>
        </section>
      </article>

      <div className="screen-only flex flex-wrap gap-2">
        <Link
          href="/events"
          className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Ver eventos
        </Link>
        <Link
          href="/risk-profile"
          className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Ver Risk Profile
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
      `}</style>
    </div>
  )
}
