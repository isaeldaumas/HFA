'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { TrialUsageCard } from '@/components/product/TrialUsageCard'
import { OrgScoreCard } from '@/components/sera/OrgScoreCard'
import { AiInsightPanel } from '@/components/sera/AiInsightPanel'
import { useT } from '@/lib/i18n'
import type { RiskProfileSummary } from '@/lib/risk-profile/types'

const CODE_INFO: Record<string, { name: string; def: string; example: string }> = {
  'P-A': { name: 'Sem Falha de Percepção', def: 'O operador percebeu a situação corretamente. A falha está em outro nível.', example: 'Piloto sabia da condição adversa mas decidiu prosseguir mesmo assim.' },
  'P-B': { name: 'Falha Sensorial', def: 'Limitação física ou ambiental impediu a detecção de estímulos essenciais.', example: 'Piloto não viu obstáculo por névoa intensa.' },
  'P-C': { name: 'Falha de Conhecimento', def: 'Operador detectou o sinal mas não tinha conhecimento para interpretá-lo.', example: 'Piloto em adaptação não reconheceu comportamento do flight director.' },
  'P-D': { name: 'Atenção — Pressão de Tempo Externa', def: 'Situação impôs urgência que capturou a atenção impedindo percepção de informações críticas.', example: 'Piloto focado em localizar plataforma não monitorou velocidade.' },
  'P-E': { name: 'Gerenciamento de Tempo', def: 'Operador criou a própria pressão de tempo por ansiedade ou impaciência.', example: 'Piloto apressado criou urgência para decolar em condições adversas.' },
  'P-F': { name: 'Informação Ilusória ou Ambígua', def: 'O ambiente forneceu informações enganosas ou contraditórias.', example: 'Desorientação espacial — piloto percebeu voo nivelado enquanto curvava.' },
  'P-G': { name: 'Falha de Atenção', def: 'Informação disponível e correta foi ignorada por distração ou viés.', example: 'Piloto ignorou indicadores que contrariavam sua avaliação inicial.' },
  'P-H': { name: 'Falha de Comunicação', def: 'Informação necessária não chegou ou chegou incorreta.', example: 'Piloto não recebeu atualização meteorológica correta.' },
  'O-A': { name: 'Sem Falha de Objetivo', def: 'Intenção era correta e conservativa. Falha está em P ou A.', example: 'Piloto tentou arremeter corretamente mas falhou na execução.' },
  'O-B': { name: 'Violação Rotineira', def: 'Desvio habitual normalizado pela cultura operacional.', example: 'Piloto que habitualmente decolava abaixo dos mínimos.' },
  'O-C': { name: 'Violação Excepcional/Circunstancial', def: 'Desvio consciente, pontual e não rotineiro de regra, procedimento ou expectativa operacional.', example: 'Operador que decide pular uma etapa de verificação uma única vez por achar que não haveria problema.' },
  'O-D': { name: 'Intenção Não Conservativa', def: 'Objetivo formalmente válido mas operador escolheu opção mais arriscada.', example: 'Piloto escolheu pousar pelo lado mais difícil quando havia opção mais segura.' },
  'A-A': { name: 'Sem Falha de Ação', def: 'Execução correta. Falha está em P ou O.', example: 'Piloto executou manobra corretamente mas objetivo era errado.' },
  'A-B': { name: 'Deslize, Lapso ou Omissão', def: 'Ação não executada como planejada por erro involuntário.', example: 'Piloto que planejava acionar sistema A acionou B por confusão.' },
  'A-C': { name: 'Falha de Feedback na Execução', def: 'Ação iniciada corretamente mas operador não percebeu o desvio.', example: 'Piloto não percebeu que manobra produzia resultado diferente do esperado.' },
  'A-D': { name: 'Inabilidade Física', def: 'Operador sabia o que fazer mas fisicamente não conseguiu executar.', example: 'Força necessária superava capacidade física do piloto no momento.' },
  'A-E': { name: 'Falha de Conhecimento na Ação', def: 'Operador não sabia qual ação executar — escolheu por analogia incorreta.', example: 'Piloto em adaptação usou procedimento da aeronave anterior.' },
  'A-F': { name: 'Seleção de Ação Errada', def: 'Com capacidade e sem pressão excessiva, operador escolheu plano incorreto.', example: 'Piloto escolheu lado mais arriscado da plataforma sem pressão de tempo.' },
  'A-G': { name: 'Falha de Feedback na Decisão', def: 'Operador não monitorou resultado da ação para verificar o efeito.', example: 'Operador ajustou parâmetro e não verificou se produziu o efeito pretendido.' },
  'A-H': { name: 'Gerenciamento de Tempo na Ação', def: 'Sob pressão real, operador priorizou incorretamente suas atenções.', example: 'Piloto preocupado com plataforma não monitorou instrumentos.' },
  'A-I': { name: 'Seleção de Ação sob Pressão', def: 'Pressão de tempo foi determinante na escolha incorreta.', example: 'Piloto na urgência selecionou procedimento de emergência errado.' },
  'A-J': { name: 'Feedback por Pressão de Tempo', def: 'Pressão impediu que operador verificasse se ação estava correta.', example: 'Operador executou correção mas não teve tempo de confirmar resposta do sistema.' },
}

type ModalState = {
  title: string
  sections: { label?: string; content: string }[]
}

type Intelligence = RiskProfileSummary


const distColors = {
  perception: { bar: '#3B82F6', border: 'border-blue-500/40', text: 'text-blue-400' },
  objective: { bar: '#A855F7', border: 'border-purple-500/40', text: 'text-purple-400' },
  action: { bar: '#F97316', border: 'border-orange-500/40', text: 'text-orange-400' },
}

const FAILURE_NAMES: Record<string, string> = {
  'P-A': 'Sem falha de percepção',
  'P-B': 'Falha sensorial',
  'P-C': 'Falha de conhecimento',
  'P-D': 'Atenção c/ pressão externa',
  'P-E': 'Gerenciamento de tempo',
  'P-F': 'Informação ilusória/ambígua',
  'P-G': 'Falha de atenção',
  'P-H': 'Falha de comunicação',
  'O-A': 'Sem falha de objetivo',
  'O-B': 'Violação rotineira',
  'O-C': 'Violação excepcional/circunstancial',
  'O-D': 'Intenção não conservativa',
  'A-A': 'Sem falha de ação',
  'A-B': 'Deslize ou lapso',
  'A-C': 'Falha de feedback na execução',
  'A-D': 'Inabilidade física',
  'A-E': 'Falha de conhecimento',
  'A-F': 'Seleção de ação errada',
  'A-G': 'Falha de feedback na decisão',
  'A-H': 'Gerenciamento de tempo',
  'A-I': 'Seleção de ação sob pressão',
  'A-J': 'Feedback por pressão de tempo',
}

const PRECONDITION_DEFS: Record<string, string> = {
  'P1': 'Estado fisiológico do operador: doença, fadiga física, uso de medicamentos ou condições médicas que afetam o desempenho.',
  'P2': 'Estado psicológico: ansiedade, estresse, atitudes de risco, excesso de confiança ou motivação inadequada.',
  'P3': 'Fatores sociais: pressão de colegas, dinâmica de grupo, dificuldade de comunicação interpessoal.',
  'P4': 'Habilidade do operador: limitações de destreza, coordenação ou capacidade técnica para executar a tarefa.',
  'P5': 'Prontidão pessoal: nível de preparação no momento do evento — descanso, alimentação, estado de alerta.',
  'P6': 'Seleção e treinamento: adequação do processo de seleção e da qualidade do treinamento recebido.',
  'P7': 'Qualificação e autorização: o operador possuía as habilitações e autorizações necessárias para a tarefa?',
  'T1': 'Pressão de tempo sistêmica: demandas de tempo impostas pela organização ou pela natureza da tarefa.',
  'T2': 'Adequação dos objetivos da tarefa: os objetivos definidos eram realistas e compatíveis com os recursos disponíveis?',
  'W1': 'Ambiente tecnológico: design de equipamentos, interfaces, displays, automação e ferramentas utilizadas.',
  'W2': 'Espaço de trabalho: condições do ambiente físico — layout, ergonomia, organização do posto de trabalho.',
  'W3': 'Ambiente operacional: condições externas como clima, visibilidade, ruído, temperatura e terreno.',
  'S1': 'Formulação de intenções: os objetivos foram claramente definidos pelos líderes e eram consistentes com procedimentos?',
  'S2': 'Comunicação de intenções: os objetivos foram claramente comunicados e compreendidos pelos executores?',
  'S3': 'Monitoramento e supervisão: a supervisão assegurou que a equipe estava qualificada e seguia os procedimentos?',
  'O1': 'Missão organizacional: a missão estava dentro da capacidade da organização?',
  'O2': 'Provisão de recursos: a organização forneceu recursos humanos, materiais e financeiros adequados?',
  'O3': 'Regras e regulamentos: as normas eram consistentes com os objetivos declarados e gerenciavam o risco adequadamente?',
  'O4': 'Processos e práticas: existiam procedimentos operacionais padrão e processos formais de gerenciamento de risco?',
  'O5': 'Clima organizacional: a organização valoriza segurança acima de produtividade? Encoraja o reporte de problemas?',
  'O6': 'Vigilância sistêmica: a organização detectava e corrigia desvios sistemáticos de procedimento?',
}

function buildScoreModal(score: Intelligence['score']): ModalState {
  return {
    title: 'Score de Risco Operacional',
    sections: [
      { label: 'O que é', content: 'Índice calculado com base nos padrões de falha identificados nas análises SERA do seu tenant.' },
      { label: 'Como é calculado', content: 'Combina falhas de Percepção (peso 1.0), Objetivo (peso 0.8) e Ação (peso 0.6) pelo total de análises, acrescido de penalidades por ações vencidas e picos de eventos.' },
      { label: 'Faixas', content: '0–39 → Normal\n40–69 → Atenção (monitoramento recomendado)\n70–100 → Crítico (intervenção imediata)' },
      { label: 'Score atual', content: `${score.value} — ${score.label}` },
    ],
  }
}

function buildAlertModal(alert: string): ModalState {
  if (alert.includes('vencida') || alert.includes('vencido')) {
    return {
      title: 'Ações Corretivas Vencidas',
      sections: [
        { label: 'O que significa', content: 'Existem ações corretivas cujo prazo já expirou e ainda não foram concluídas.' },
        { label: 'O que fazer', content: 'Acesse o módulo de Ações Corretivas, atualize o status ou renegocie prazos com os responsáveis.' },
      ],
    }
  }
  if (alert.includes('representa') && alert.includes('%')) {
    return {
      title: 'Concentração de Falha',
      sections: [
        { label: 'O que significa', content: 'Um único código de falha concentra parcela significativa das análises, indicando padrão recorrente.' },
        { label: 'O que fazer', content: 'Investigue as causas raiz deste código e priorize ações preventivas específicas.' },
      ],
    }
  }
  if (alert.includes('eventos este mês')) {
    return {
      title: 'Frequência de Eventos',
      sections: [
        { label: 'O que significa', content: 'Comparação entre eventos registrados neste mês e a média mensal dos últimos 90 dias.' },
        { label: 'O que fazer', content: 'Se acima da média, revise condições operacionais recentes e reforce o monitoramento preventivo.' },
      ],
    }
  }
  if (alert.includes('recomendaç')) {
    return {
      title: 'Recomendações Pendentes',
      sections: [
        { label: 'O que significa', content: 'Existem recomendações geradas em análises SERA sem ações corretivas associadas.' },
        { label: 'O que fazer', content: 'Acesse as análises e crie ações corretivas para as recomendações identificadas.' },
      ],
    }
  }
  return {
    title: 'Alerta Operacional',
    sections: [
      { content: alert },
      { label: 'O que fazer', content: 'Revise as condições operacionais e tome as medidas necessárias.' },
    ],
  }
}

function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-600 text-slate-400 text-[10px] hover:border-slate-400 hover:text-white transition-colors flex-shrink-0"
      aria-label="Ajuda"
    >
      ?
    </button>
  )
}

function SimpleModal({ state, onClose }: { state: ModalState | null; onClose: () => void }) {
  if (!state) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 gap-4">
          <h3 className="text-white font-semibold text-base leading-snug">{state.title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none flex-shrink-0">×</button>
        </div>
        <div className="space-y-3">
          {state.sections.map((s, i) => (
            <div key={i}>
              {s.label && (
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1">{s.label}</p>
              )}
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{s.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const t = useT()
  const [data, setData] = useState<Intelligence | null>(null)
  const [token, setToken] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const t = session.access_token
      setToken(t)
      try {
        const intelRes = await fetch('/api/risk-profile', { headers: { Authorization: `Bearer ${t}` } })
        const intel = await intelRes.json()
        if (intelRes.ok && intel?.score) {
          setData(intel)
        } else if (!intelRes.ok) {
          setError(intel?.detail ?? `HTTP ${intelRes.status}`)
        }
      } catch (err) {
        console.error('Intelligence fetch error:', err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const subtitleMap = {
    critical: t('dashboard.subtitle_critical'),
    warning: t('dashboard.subtitle_warning'),
    ok: t('dashboard.subtitle_ok'),
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        {t('common.loading')}
      </div>
    )
  }

  const level = data?.score.level ?? 'ok'
  const hasAnalyses = (data?.total_analyses ?? 0) > 0
  const domDist = data
    ? (['perception', 'objective', 'action'] as const).reduce((best, cur) =>
        (data.distribution[cur].count > data.distribution[best].count ? cur : best),
        'perception' as 'perception' | 'objective' | 'action'
      )
    : 'perception'

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <SimpleModal state={modal} onClose={() => setModal(null)} />

      {/* 1. Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">{t('dashboard.title')}</h1>
        <p className="text-slate-400 mt-1">{subtitleMap[level]}</p>
      </div>

      {/* Primeiros passos */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-blue-300 text-sm font-semibold">Primeiros passos no HFA/SERA</p>
          <p className="text-slate-300 text-sm mt-1">
            Use o guia inicial para registrar suas primeiras análises e formar o perfil organizacional.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Comece aqui
          </Link>
          <Link
            href="/methodology"
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Metodologia
          </Link>
          <Link
            href="/reports/executive"
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Relatorio executivo
          </Link>
        </div>
      </div>

      <TrialUsageCard />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-4 text-sm">
          {t('common.error')}: {error}
        </div>
      )}

      {!error && !hasAnalyses && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <h2 className="text-white font-semibold text-lg mb-1">Bem-vindo ao HFA SERA</h2>
          <p className="text-slate-400 text-sm mb-8">
            O dashboard de inteligência operacional será preenchido após a primeira análise concluída.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { step: '1', title: 'Descreva o evento', desc: 'Cole o relato do incidente ou faça upload de um PDF/DOCX.' },
              { step: '2', title: 'IA analisa em ~90s', desc: 'O sistema aplica as 7 etapas da metodologia SERA automaticamente.' },
              { step: '3', title: 'Revise e exporte', desc: 'Edite as classificações, gere o PDF e crie ações corretivas.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600/20 border border-blue-600/30 text-blue-400 text-xs font-bold flex items-center justify-center">
                  {step}
                </span>
                <div>
                  <p className="text-sm font-medium text-white mb-0.5">{title}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Link
            href="/events/new"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            Criar primeira análise
          </Link>
        </div>
      )}

      {/* 2. Score de Risco */}
      {data?.score && hasAnalyses && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-slate-400 text-xs uppercase tracking-wide font-semibold">{t('dashboard.riskScore')}</span>
            <HelpButton onClick={() => setModal(buildScoreModal(data.score))} />
          </div>
          <OrgScoreCard
            score={data.score.value}
            level={data.score.level}
            label={data.score.label}
            actions={data.actions}
          />
        </div>
      )}

      {/* 3. Alertas */}
      {hasAnalyses && (data?.alerts ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data!.alerts.map((alert, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-full px-3 py-1"
            >
              <span>⚠ {alert}</span>
              <HelpButton onClick={() => setModal(buildAlertModal(alert))} />
            </div>
          ))}
        </div>
      )}

      {hasAnalyses && data && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Universo canônico', value: data.total_events, tone: 'text-white' },
            { label: 'Considerados no perfil', value: data.included_events, tone: 'text-green-300' },
            { label: 'Desconsiderados', value: data.excluded_events, tone: 'text-amber-300' },
            { label: 'ERC predominante', value: data.modal_erc_level ? `ERC ${data.modal_erc_level}` : (data.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED' || data.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY' ? 'omitido (D3-b)' : 'n/d'), tone: 'text-blue-300' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">{item.label}</p>
              <p className={`text-2xl font-semibold ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* 4. Distribuição de falhas — top 3 por categoria */}
      {data?.distribution && hasAnalyses && (
        <div>
          <h3 className="text-white font-semibold mb-3">{t('dashboard.failureDistribution')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['perception', 'objective', 'action'] as const).map((key) => {
              const dist = data.distribution[key]
              const c = distColors[key]
              const isDom = key === domDist
              const labels = {
                perception: t('dashboard.perception'),
                objective: t('dashboard.objective'),
                action: t('dashboard.action'),
              }
              const topCodes = dist.top_codes ?? []
              const maxCount = Math.max(...topCodes.map(t => t.count), 1)
              return (
                <div
                  key={key}
                  className={`bg-slate-900 border rounded-xl p-5 ${isDom ? c.border + ' ring-1 ring-inset ' + c.border : 'border-slate-800'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className={`${c.text} text-xs font-semibold uppercase tracking-wide`}>{labels[key]}</p>
                    {isDom && <span className={`text-xs ${c.text} font-semibold`}>{t('dashboard.dominant')}</span>}
                  </div>
                  <p className="text-slate-500 text-xs mb-3">Mais frequentes</p>
                  <div className="space-y-2.5">
                    {topCodes.map((tc) => (
                      <div key={tc.code} className="flex items-center gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold flex-shrink-0 w-8">
                          {tc.code}
                        </span>
                        <span className="text-slate-400 text-xs min-w-0 truncate flex-1">
                          {FAILURE_NAMES[tc.code] ?? tc.code}
                        </span>
                        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${(tc.count / maxCount) * 100}%`,
                            background: c.bar
                          }} />
                        </div>
                        <span className="text-xs text-slate-500 flex-shrink-0 w-6 text-right">
                          {tc.count}x
                        </span>
                      </div>
                    ))}
                    {topCodes.length === 0 && (
                      <p className="text-slate-600 text-xs">Sem dados</p>
                    )}
                  </div>
                  <p className="text-slate-600 text-xs mt-3">
                    {dist.count} {t('dashboard.occurrences')}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 4.5. Padrões Identificados — combinações frequentes */}
      {hasAnalyses && (data?.top_combinations ?? []).length > 0 && (
        <div>
          <h3 className="text-white font-semibold mb-1">{t('dashboard.patterns')}</h3>
          <p className="text-slate-500 text-xs mb-3">{t('dashboard.patternsSubtitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data!.top_combinations.slice(0, 3).map((combo) => {
              const parts = combo.pair.split(' + ')
              const infoA = parts[0] ? CODE_INFO[parts[0]] : null
              const infoB = parts[1] ? CODE_INFO[parts[1]] : null
              const description = infoA && infoB
                ? `${infoA.name} associada a ${infoB.name.toLowerCase()}`
                : infoA
                ? infoA.name
                : combo.pair
              return (
                <div key={combo.pair} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-white text-sm font-semibold">{combo.pair}</span>
                    <span className="text-slate-400 text-xs ml-2 flex-shrink-0">{combo.count}x</span>
                  </div>
                  <p className="text-slate-500 text-xs leading-relaxed">{description}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 5. Análise por IA */}
      {data?.score && token && hasAnalyses && (
        <AiInsightPanel intelligenceData={data} token={token} />
      )}

      {/* 6. Top precondições — gráfico de barras */}
      {hasAnalyses && (data?.top_preconditions ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <PreconditionsChart preconditions={data!.top_preconditions} />
        </div>
      )}

      {/* 7. Tendência SVG */}
      {hasAnalyses && (data?.trend ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">{t('dashboard.trend')}</h3>
          <TrendChart trend={data!.trend} insufficientDataLabel={t('dashboard.insufficientData')} />
        </div>
      )}

      {/* 8. Eventos recentes — via intelligence */}
      {hasAnalyses && (data?.recent_events ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">{t('dashboard.recentEvents')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="text-left pb-2 font-medium">{t('dashboard.date')}</th>
                <th className="text-left pb-2 font-medium">{t('dashboard.title_col')}</th>
                <th className="text-left pb-2 font-medium">P · O · A</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {data!.recent_events.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-800/50 last:border-0">
                  <td className="py-2.5 pr-4 text-slate-400 whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="py-2.5 pr-4 text-white">{ev.title}</td>
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate-400">
                    {[ev.perception_code, ev.objective_code, ev.action_code].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <a href={`/events/${ev.id}`} className="text-blue-400 hover:text-blue-300 text-xs">{t('dashboard.view')}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PreconditionsChart({
  preconditions
}: {
  preconditions: { code: string; count: number; pct: number; name: string }[]
}) {
  const max = Math.max(...preconditions.map(p => p.count), 1)

  function codeColor(code: string): string {
    if (code.startsWith('P')) return '#EAB308'
    if (code.startsWith('S')) return '#3B82F6'
    if (code.startsWith('T')) return '#8B5CF6'
    if (code.startsWith('W')) return '#22C55E'
    return '#F97316'
  }

  return (
    <div>
      <h3 className="text-white font-semibold mb-4">Top Pré-condições</h3>
      <div className="space-y-3">
        {preconditions.map(p => {
          const pct = Math.round((p.count / max) * 100)
          const color = codeColor(p.code)
          return (
            <div key={p.code}>
              <div className="flex items-start gap-2 mb-1">
                <span
                  className="font-mono text-xs font-bold shrink-0 w-7 pt-px"
                  style={{ color }}
                >
                  {p.code}
                </span>
                <span className="text-slate-400 text-xs leading-tight flex-1">
                  {p.name}
                </span>
                <span className="text-slate-300 text-xs font-semibold shrink-0 tabular-nums">
                  {p.count}x
                </span>
              </div>
              <div className="ml-9 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: color, opacity: 0.85 }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-4 mt-4" style={{ fontSize: 11 }}>
        {[
          { color: '#EAB308', label: 'Pessoal (P)' },
          { color: '#3B82F6', label: 'Supervisão (S)' },
          { color: '#8B5CF6', label: 'Tarefa (T)' },
          { color: '#22C55E', label: 'Trabalho (W)' },
          { color: '#F97316', label: 'Organização (O)' },
        ].map(item => (
          <div key={item.color} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
            <span className="text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendChart({ trend, insufficientDataLabel }: { trend: { month: string; count: number }[]; insufficientDataLabel: string }) {
  if (trend.length < 2) {
    return (
      <p className="text-slate-500 text-sm text-center py-8">
        {insufficientDataLabel}
      </p>
    )
  }

  const maxCount = Math.max(...trend.map((t) => t.count), 1)
  const chartH = 120
  const barW = 40
  const gap = 16
  const padX = 12
  const totalW = trend.length * (barW + gap) - gap + padX * 2

  return (
    <svg viewBox={`0 0 ${totalW} ${chartH + 40}`} className="w-full max-h-[200px]" preserveAspectRatio="xMidYMid meet">
      {trend.map((t, i) => {
        const x = padX + i * (barW + gap)
        const barH = Math.min(Math.max((t.count / maxCount) * chartH, 4), chartH)
        const y = chartH - barH
        const [year, month] = t.month.split('-')
        const label = new Date(Number(year), Number(month) - 1).toLocaleString('pt-BR', { month: 'short' })
        return (
          <g key={t.month}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} className="fill-blue-500/70" />
            <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-white text-[10px]" fontSize={11}>
              {t.count}
            </text>
            <text x={x + barW / 2} y={chartH + 18} textAnchor="middle" className="fill-slate-400 text-[10px]" fontSize={10}>
              {label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
