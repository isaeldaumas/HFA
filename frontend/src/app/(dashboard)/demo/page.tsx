'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, BarChart3, BookOpenCheck, CheckCircle2, ClipboardCheck, Layers, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import {
  demoAnalyses, demoCorrectiveActions, demoDataConfidence,
  demoQualityTrend, demoRecurringPatterns, demoSafetyIssueCandidates,
} from '@/lib/demo/hfa-demo-data'

type DemoSection = 'overview' | 'cases' | 'safety' | 'risk'
type DemoStatus = 'pending' | 'in_progress' | 'closed'

const SECTIONS: Array<{ id: DemoSection; label: string; description: string }> = [
  { id: 'overview', label: 'Visão geral', description: 'Indicadores e padrões' },
  { id: 'cases', label: 'Análises SERA', description: 'Eventos e classificações' },
  { id: 'safety', label: 'Gestão de Safety', description: 'Ações e acompanhamento' },
  { id: 'risk', label: 'Perfil de risco', description: 'Distribuição e tendências' },
]

const STATUS_NAMES: Record<DemoStatus, string> = {
  pending: 'Pendente', in_progress: 'Em andamento', closed: 'Concluída',
}

function DemoMetric({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mt-1 text-sm leading-relaxed text-slate-400">{subtitle}</p></div>
}

function MiniBar({ label, count, total, detail }: { label: string; count: number; total: number; detail?: string }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 break-words text-slate-200">{label}</span><strong className="shrink-0 tabular-nums text-white">{count}</strong></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${total ? Math.max(2, count / total * 100) : 0}%` }}/></div>
      {detail && <p className="text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

export default function DemoPage() {
  const [section, setSection] = useState<DemoSection>('overview')
  const [selectedCase, setSelectedCase] = useState(demoAnalyses[0].id)
  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<Record<string, DemoStatus>>(() => Object.fromEntries(demoCorrectiveActions.map((action) => [action.id, action.status])) as Record<string, DemoStatus>)
  const [riskMonth, setRiskMonth] = useState(demoQualityTrend[demoQualityTrend.length - 1].month)
  const caseData = demoAnalyses.find((item) => item.id === selectedCase) ?? demoAnalyses[0]
  const filteredCases = useMemo(() => demoAnalyses.filter((item) => `${item.title} ${item.context} ${item.perception_code} ${item.objective_code} ${item.action_code}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [search])
  const riskDistribution = useMemo(() => ([1, 2, 3, 4, 5] as const).map((n) => ({ label: `Categoria ${n}`, count: demoAnalyses.filter((item) => item.hfa_erc_category === n).length })), [])
  const openCount = demoCorrectiveActions.filter((item) => statuses[item.id] !== 'closed').length
  const doneCount = demoCorrectiveActions.filter((item) => statuses[item.id] === 'closed').length
  const selectedTrend = demoQualityTrend.find((item) => item.month === riskMonth) ?? demoQualityTrend[0]

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-200">Demonstração · dados fictícios</span>
            <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">Ambiente de apresentação</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Conheça o HFA/SERA na prática</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">Explore um cenário inteiramente simulado, da análise de fatores humanos à gestão de Safety e aos indicadores organizacionais.</p>
        </div>
        <Link href="/dashboard" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-200 hover:border-slate-500">Voltar aos dados reais</Link>
      </div>

      <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-600/35 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-100">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" />
        <p><strong>Simulação isolada:</strong> os 10 casos, indicadores, categorias, sugestões e ações abaixo são exemplos didáticos. Nenhum dado é salvo no banco nem usado no Dashboard real, nos relatórios ou em decisões operacionais. Códigos P/O/A são hipotéticos, não conclusões auditadas.</p>
      </div>

      <nav className="rounded-xl border border-slate-800 bg-slate-900/70 p-1.5" aria-label="Áreas da demonstração">
        <div role="tablist" className="grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          {SECTIONS.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={section === tab.id} aria-controls={section === tab.id ? `demo-panel-${tab.id}` : undefined}
              onClick={() => setSection(tab.id)} className={`min-w-0 rounded-lg border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${section === tab.id ? 'border-cyan-600/60 bg-cyan-600/20 text-white' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
              <span className="block text-sm font-semibold">{tab.label}</span><span className="mt-1 hidden text-xs opacity-80 sm:block">{tab.description}</span>
            </button>
          ))}
        </div>
      </nav>

      {section === 'overview' && (
        <section id="demo-panel-overview" role="tabpanel" className="space-y-6">
          <SectionTitle title="Panorama organizacional" subtitle="Indicadores calculados exclusivamente a partir dos registros fictícios desta apresentação." />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DemoMetric label="Análises simuladas" value={demoAnalyses.length} detail="Eventos de treinamento" />
            <DemoMetric label="Padrões exemplificados" value={demoRecurringPatterns.length} detail="Possíveis recorrências" />
            <DemoMetric label="Ações abertas" value={openCount} detail="Estado local desta demonstração" />
            <DemoMetric label="Ações concluídas" value={doneCount} detail="Estado local desta demonstração" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center gap-2"><Activity className="size-5 text-cyan-300"/><h3 className="font-semibold text-white">Padrões ilustrativos P/O/A</h3></div>
              {demoRecurringPatterns.map((pattern) => <MiniBar key={pattern.id} label={pattern.label} count={pattern.count} total={demoAnalyses.length} detail={pattern.note}/>) }
            </div>
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center gap-2"><Layers className="size-5 text-cyan-300"/><h3 className="font-semibold text-white">Distribuição por categoria ERC fictícia</h3></div>
              {riskDistribution.map((item) => <MiniBar key={item.label} label={item.label} count={item.count} total={demoAnalyses.length} />)}
              <p className="text-xs leading-relaxed text-slate-500">Essas categorias pertencem aos exemplos; não representam ERC calculado ou liberado para eventos reais.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <button type="button" onClick={() => setSection('cases')} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm font-semibold text-white hover:border-cyan-600"><span>Examinar análises SERA</span><BookOpenCheck className="size-5 text-cyan-300"/></button>
            <button type="button" onClick={() => setSection('safety')} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm font-semibold text-white hover:border-cyan-600"><span>Simular tratamento de Safety</span><ClipboardCheck className="size-5 text-cyan-300"/></button>
            <button type="button" onClick={() => setSection('risk')} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4 text-left text-sm font-semibold text-white hover:border-cyan-600"><span>Explorar perfil de risco</span><BarChart3 className="size-5 text-cyan-300"/></button>
          </div>
        </section>
      )}

      {section === 'cases' && (
        <section id="demo-panel-cases" role="tabpanel" className="space-y-5">
          <SectionTitle title="Análises de eventos" subtitle="Escolha um caso fictício para visualizar como o HFA apresenta evidências, candidatos P/O/A e recomendações de investigação." />
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.9fr)_minmax(0,1.6fr)]">
            <div className="min-w-0 space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
              <label htmlFor="demo-filter" className="text-xs font-semibold text-slate-300">Pesquisar caso ou código</label>
              <input id="demo-filter" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: checklist, P-F, offshore" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"/>
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredCases.map((item) => <button key={item.id} type="button" onClick={() => setSelectedCase(item.id)} aria-pressed={selectedCase === item.id}
                  className={`w-full rounded-lg border p-3 text-left transition ${selectedCase === item.id ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-600'}`}>
                  <span className="block text-sm font-medium leading-snug text-white">{item.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{item.perception_code} / {item.objective_code} / {item.action_code}</span>
                </button>)}
                {filteredCases.length === 0 && <p className="p-3 text-sm text-slate-400">Nenhum caso de exemplo corresponde à busca.</p>}
              </div>
            </div>
            <article className="min-w-0 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Análise ilustrativa</p><h3 className="mt-1 text-xl font-semibold text-white">{caseData.title}</h3></div><span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">ERC de exemplo: {caseData.hfa_erc_category}</span></div>
              <div><p className="mb-1 text-xs font-semibold text-slate-400">Contexto do evento fictício</p><p className="text-sm leading-relaxed text-slate-200">{caseData.context}</p></div>
              <div className="grid grid-cols-3 gap-2">{[['Percepção',caseData.perception_code],['Objetivo',caseData.objective_code],['Ação',caseData.action_code]].map(([label, code]) => <div key={label} className="min-w-0 rounded-lg border border-slate-700 bg-slate-950/60 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-cyan-200">{code}</p></div>)}</div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-950/40 p-4"><p className="mb-2 text-xs font-semibold text-slate-400">Síntese ilustrativa</p><p className="text-sm leading-relaxed text-slate-200">{caseData.summary}</p></div>
              <div><p className="mb-2 text-xs font-semibold text-slate-400">Possível medida para avaliação humana</p><p className="text-sm leading-relaxed text-slate-200">{caseData.recommendation}</p></div>
              <p className="border-t border-slate-800 pt-3 text-xs text-amber-200">Cenário inventado: sem documentação de evento, sem ponto de fuga auditado e sem classificação metodológica liberada.</p>
            </article>
          </div>
        </section>
      )}

      {section === 'safety' && (
        <section id="demo-panel-safety" role="tabpanel" className="space-y-5">
          <SectionTitle title="Tratamento de Safety" subtitle="Experimente movimentar as ações fictícias. As mudanças ficam somente nesta página e desaparecem quando ela é recarregada." />
          <div className="grid grid-cols-3 gap-3">
            {([['pending','Pendentes'],['in_progress','Em andamento'],['closed','Concluídas']] as const).map(([state,label]) => <DemoMetric key={state} label={label} value={demoCorrectiveActions.filter((a) => statuses[a.id] === state).length} detail="Exemplo simulado"/>)}
          </div>
          <div className="space-y-3">
            {demoCorrectiveActions.map((action) => {
              const status = statuses[action.id]
              const next: DemoStatus | null = status === 'pending' ? 'in_progress' : status === 'in_progress' ? 'closed' : null
              return <article key={action.id} className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status === 'closed' ? 'border-emerald-700 text-emerald-300' : status === 'in_progress' ? 'border-blue-700 text-blue-300' : 'border-amber-700 text-amber-300'}`}>{STATUS_NAMES[status]}</span><span className="text-xs text-slate-500">Prioridade {action.priority === 'high' ? 'alta' : action.priority === 'medium' ? 'média' : 'baixa'}</span></div>
                <h3 className="break-words font-semibold text-white">{action.title}</h3><p className="text-xs text-slate-400">{action.due_label}</p></div>
                {next ? <button type="button" onClick={() => setStatuses((current) => ({ ...current, [action.id]: next }))} className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500">{next === 'in_progress' ? 'Iniciar ação' : 'Simular conclusão'}</button> : <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-emerald-300"><CheckCircle2 className="size-4" />Concluída na demonstração</span>}
              </article>
            })}
          </div>
          <button type="button" onClick={() => setStatuses(Object.fromEntries(demoCorrectiveActions.map((item) => [item.id, item.status])) as Record<string, DemoStatus>)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"><RotateCcw className="size-4" />Reiniciar simulação de ações</button>
          <p className="text-xs leading-relaxed text-slate-500">Em produção, a criação, execução e verificação de eficácia dependem de pessoas autorizadas e registros de evidência. Este simulador não registra decisões, responsáveis ou verificações reais.</p>
        </section>
      )}

      {section === 'risk' && (
        <section id="demo-panel-risk" role="tabpanel" className="space-y-5">
          <SectionTitle title="Perfil de risco organizacional" subtitle="Uma leitura didática de recorrência, distribuição e evolução temporal, sem substituição de avaliação operacional de risco." />
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-cyan-300"/><h3 className="font-semibold text-white">Distribuição ERC ilustrativa</h3></div>{riskDistribution.map((item) => <MiniBar key={item.label} label={item.label} count={item.count} total={demoAnalyses.length}/>)}</div>
            <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-semibold text-white">Sinais de recorrência hipotética</h3>{demoSafetyIssueCandidates.map((item) => <div key={item.id} className="rounded-lg border border-slate-800 p-3"><p className="flex flex-wrap justify-between gap-2 text-sm font-semibold text-white"><span>{item.label}</span><span className="tabular-nums text-cyan-200">{item.count}/{demoAnalyses.length}</span></p><p className="mt-2 text-xs leading-relaxed text-slate-400">Candidato fictício; não é Safety Issue confirmado.</p></div>)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="font-semibold text-white">Tendência ilustrativa</h3><p className="mt-1 text-xs text-slate-400">Selecione um período para examinar os dados demonstrativos.</p></div><label className="text-xs text-slate-400">Período <select value={riskMonth} onChange={(e) => setRiskMonth(e.target.value)} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{demoQualityTrend.map((item) => <option key={item.month} value={item.month}>{item.month}</option>)}</select></label></div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><p className="text-xs text-slate-400">Categoria predominante de exemplo</p><p className="mt-2 text-2xl font-semibold text-white">{selectedTrend.dominant_hfa_erc_category}</p></div><div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4"><p className="text-xs text-slate-400">Parcela alta/crítica simulada</p><p className="mt-2 text-2xl font-semibold text-white">{Math.round(selectedTrend.critical_or_high_share * 100)}%</p></div></div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${selectedTrend.critical_or_high_share * 100}%` }}/></div><p className="mt-3 text-sm leading-relaxed text-slate-300">{selectedTrend.note}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h3 className="font-semibold text-white">Qualidade da amostra demonstrativa</h3><p className="mt-2 text-sm text-slate-300">{demoDataConfidence.valid_erc_count} de {demoDataConfidence.total_analyses} exemplos têm categoria ERC preenchida no conjunto fictício.</p><p className="mt-2 text-xs leading-relaxed text-slate-500">Preenchimento da amostra não significa qualidade científica ou validação causal. Nenhum resultado mostrado nesta página compõe o perfil real da organização.</p></div>
        </section>
      )}
    </main>
  )
}
