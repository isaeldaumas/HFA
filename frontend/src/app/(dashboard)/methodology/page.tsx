'use client'

import Link from 'next/link'

const DOES = [
  'Estrutura relatos e evidencias operacionais para analise tecnica.',
  'Classifica mecanismos humanos em Percepcao, Objetivo e Acao (P/O/A).',
  'Exige base textual suficiente antes de aceitar classificacao.',
  'Separa analise causal de avaliacao de risco.',
  'Identifica pre-condicoes sustentadas e separa-as de hipoteses a investigar.',
  'Converte achados validados em propostas de tratamento rastreaveis, com decisao humana.',
  'Constroi um perfil organizacional progressivo, com caveats.',
]

const DOES_NOT = [
  'Nao substitui investigacao humana.',
  'Nao inventa evidencia.',
  'Nao estima probabilidade operacional sem exposicao.',
  'Nao implementa ARMS Risk Index canonico (1-2500).',
  'Nao confirma Safety Issue formal automaticamente.',
  'Nao transforma poucos dados em conclusao definitiva.',
]

const FLOW = [
  { step: '1', title: 'Registrar evento', href: '/events/new', cta: 'Novo evento' },
  { step: '2', title: 'Complementar evidencias', href: '/sera/interview', cta: 'Usar entrevista' },
  { step: '3', title: 'Fechar ponto de fuga e P/O/A', href: '/events', cta: 'Ver analises' },
  { step: '4', title: 'Validar pre-condicoes', href: '/events', cta: 'Revisar evidencias' },
  { step: '5', title: 'Criar e acompanhar acoes', href: '/actions', cta: 'Ver acoes' },
  { step: '6', title: 'Verificar eficacia e risco residual', href: '/actions', cta: 'Ver eficacia' },
  { step: '7', title: 'Gerenciar risco e recorrencia', href: '/risk-profile', cta: 'Ver Risk Profile' },
]

export default function MethodologyPage() {
  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Metodologia HFA/SERA</h1>
          <span className="text-xs font-semibold uppercase tracking-wide text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-full px-3 py-1">
            Metodologia rastreavel
          </span>
        </div>
        <p className="text-slate-400 max-w-5xl">
          O HFA/SERA organiza evidencias de eventos operacionais, aplica uma taxonomia causal de fatores humanos e separa analise causal de avaliacao de risco.
        </p>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-slate-300 text-sm">
            O sistema apoia a investigacao tecnica; nao substitui julgamento profissional nem valida Safety Issues formais sem revisao.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-3">O que o HFA/SERA faz</h2>
          <ul className="space-y-2">
            {DOES.map((item) => (
              <li key={item} className="text-slate-300 text-sm leading-relaxed">• {item}</li>
            ))}
          </ul>
          <p className="text-slate-500 text-sm mt-4 leading-relaxed">
            O HFA/SERA nao tenta adivinhar a verdade do evento. Ele aplica criterios explicitos sobre as evidencias disponiveis.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-3">O que o sistema nao faz</h2>
          <ul className="space-y-2">
            {DOES_NOT.map((item) => (
              <li key={item} className="text-slate-300 text-sm leading-relaxed">• {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Como a classificacao SERA funciona</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Percepcao</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Como a informacao foi detectada, interpretada ou perdida durante o evento.
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Objetivo / Intencao</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Qual era a intencao operacional, meta ou decisao assumida no contexto analisado.
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Acao</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Como a execucao ocorreu e quais desvios de implementacao apareceram.
            </p>
          </div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            P/O/A sao dimensoes causais, nao notas de culpa. Uma classificacao so deve ser aceita quando ha evidencia suficiente.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Evidencia suficiente e insuficiente</h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          O principio central e: classificar quando ha base, registrar incerteza quando falta base, nunca inventar base.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Quando ha evidencia suficiente</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              O relato apresenta fatos observaveis, contexto operacional e elementos consistentes para mapear P/O/A.
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Quando a evidencia e limitada</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              O relato esta ambiguo, incompleto ou sem contexto. Nesse caso, a analise deve sinalizar incerteza e pedir coleta adicional.
            </p>
          </div>
        </div>
        <div>
          <Link
            href="/sera/interview"
            className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Usar entrevista estruturada
          </Link>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Pre-condicoes e fechamento do ciclo de tratamento</h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          Depois de estabelecer ponto de fuga, ator direto e P/O/A, o sistema procura evidencias de pre-condicoes. A Tabela 1 de Hendy orienta onde investigar, mas nao cria causa automaticamente.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">1. Evidencia sustentada</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">A pre-condicao so entra como achado causal quando existe evidencia do evento e vinculo com a cadeia analisada.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">2. Hipotese a investigar</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">Categorias provaveis pela taxonomia aparecem como lacunas de investigacao, claramente separadas de causas confirmadas.</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">3. Tratamento e assurance</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">Achados sustentados geram propostas de controle para validacao humana; depois, a acao recebe responsavel, prazo e status. A conclusao da acao abre a verificacao de eficacia e de risco residual antes de o ciclo ser considerado fechado no Perfil de Risco.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/actions" className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Abrir Acoes Corretivas</Link>
          <Link href="/risk-profile" className="inline-flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">Abrir Perfil de Risco</Link>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Analise causal vs avaliacao de risco</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Camada causal (SERA)</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Responde: que mecanismo humano contribuiu para o evento?
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-white text-sm font-semibold">Camadas de risco e triagem</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Matriz tradicional apoia linguagem SGSO/SMS; HFA ERC Category apoia leitura visual; Safety Issue Candidate sinaliza recorrencia; Data Confidence comunica robustez da base.
            </p>
          </div>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed">
          Essas camadas nao sao a mesma coisa. O sistema evita misturar classificacao causal com risco organizacional futuro.
        </p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Risk Profile Organizacional</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          O Risk Profile e um perfil organizacional preliminar composto por confianca dos dados, indice de cobertura analitica, candidatos a Safety Issue, tendencia qualitativa e matrizes de apoio a triagem.
        </p>
        <p className="text-slate-300 text-sm leading-relaxed">
          Sem exposicao operacional e validacao adicional, o perfil nao deve ser lido como probabilidade futura.
        </p>
        <div>
          <Link
            href="/risk-profile"
            className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Ver Risk Profile
          </Link>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-3">
        <h2 className="text-white font-semibold">Seguranca metodologica</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          As regras metodologicas sao protegidas por testes, baseline, contratos e validacoes deterministicas para reduzir regressao semantica.
        </p>
        <p className="text-slate-300 text-sm leading-relaxed">
          Isso inclui controles para evitar inversao de escala ERC, uso indevido de categorias e confusao entre dado observado, inferencia e risco.
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 space-y-4">
        <h2 className="text-white font-semibold">Fluxo recomendado</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
          {FLOW.map((item) => (
            <div key={item.step} className="bg-slate-900/70 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-bold flex items-center justify-center">
                  {item.step}
                </span>
                <p className="text-white text-sm font-semibold">{item.title}</p>
              </div>
              <Link
                href={item.href}
                className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors"
              >
                {item.cta}
              </Link>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/onboarding" className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors">
            Onboarding
          </Link>
          <Link href="/demo" className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors">
            Demo
          </Link>
          <Link href="/risk-profile" className="inline-flex items-center justify-center text-xs font-medium bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors">
            Risk Profile
          </Link>
        </div>
      </div>
    </div>
  )
}
