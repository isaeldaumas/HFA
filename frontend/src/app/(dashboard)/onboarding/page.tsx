'use client'

import Link from 'next/link'
import { TrialUsageCard } from '@/components/product/TrialUsageCard'

const RECOMMENDED_FLOW = [
  {
    step: '1',
    title: 'Comparar uma ocorrência já investigada',
    description: 'Comece com um caso histórico da sua empresa e compare a análise HFA com a investigação já concluída.',
    cta: 'Ir para novo evento',
    href: '/events/new',
  },
  {
    step: '2',
    title: 'Usar entrevista estruturada',
    description: 'Quando o relato estiver incompleto, use perguntas guiadas para melhorar a evidência.',
    cta: 'Iniciar entrevista',
    href: '/sera/interview',
  },
  {
    step: '3',
    title: 'Revisar recomendações e ações',
    description: 'Transforme recomendações SERA em ações corretivas ou preventivas acompanháveis.',
    cta: 'Ver ações',
    href: '/actions',
  },
  {
    step: '4',
    title: 'Acompanhar perfil organizacional',
    description: 'Com várias análises, acompanhe confiança dos dados, padrões recorrentes e tendência qualitativa.',
    cta: 'Ver Risk Profile',
    href: '/risk-profile',
  },
]

const SYSTEM_DOES = [
  'Aplica classificação SERA P/O/A com base em evidência textual.',
  'Separa análise causal de avaliação de risco.',
  'Identifica candidatos a padrões recorrentes.',
  'Apresenta tendência qualitativa observada.',
  'Ajuda a gerar ações corretivas.',
  'Comunica limitações e confiança dos dados.',
]

const SYSTEM_DOES_NOT = [
  'Não substitui investigação humana.',
  'Não inventa evidência.',
  'Não confirma Safety Issue formal sem revisão.',
  'Não estima probabilidade operacional sem exposição.',
  'Não é ARMS Risk Index canônico.',
  'Não transforma poucos dados em conclusão definitiva.',
]

export default function OnboardingPage() {
  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">Comece pela análise assistida de fatores humanos</h1>
        <p className="text-slate-400 max-w-4xl">
          O HFA/SERA organiza relatos de eventos, aplica a metodologia SERA, gera hipóteses estruturadas para revisão humana e consolida dados descritivos da organização.
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5 space-y-2">
        <p className="text-blue-300 text-sm font-semibold uppercase tracking-wide">Piloto guiado · 60 dias · até 15 análises · sem cartão</p>
        <p className="text-slate-300 text-sm leading-relaxed">
          Comece por uma ocorrência histórica já investigada para comparar os resultados. Depois, use o HFA em eventos reais durante o piloto e acompanhe os padrões organizacionais que começam a emergir.
        </p>
        <p className="text-slate-400 text-xs">
          O piloto não exige compromisso de contratação. Análises e dados permanecem rastreáveis para revisão humana e avaliação interna da empresa.
        </p>
        <div className="pt-2">
          <TrialUsageCard compact />
        </div>
        <div className="pt-2">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/demo"
              className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors"
            >
              Ver demonstracao com dados ficticios
            </Link>
            <Link
              href="/methodology"
              className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors"
            >
              Entender a metodologia
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-white font-semibold">Fluxo recomendado</h2>
          <p className="text-slate-500 text-sm mt-1">
            Evento → Análise SERA → Ações → Perfil Organizacional.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {RECOMMENDED_FLOW.map((item) => (
            <div key={item.step} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-xs font-bold flex items-center justify-center shrink-0">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-white text-sm font-semibold">{item.title}</h3>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{item.description}</p>
                </div>
              </div>
              <div>
                <Link
                  href={item.href}
                  className="inline-flex items-center justify-center text-xs font-medium bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  {item.cta}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-3">O que o sistema faz</h2>
          <ul className="space-y-2">
            {SYSTEM_DOES.map((item) => (
              <li key={item} className="text-slate-300 text-sm leading-relaxed">
                • {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-3">O que o sistema não faz</h2>
          <ul className="space-y-2">
            {SYSTEM_DOES_NOT.map((item) => (
              <li key={item} className="text-slate-300 text-sm leading-relaxed">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
