'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { OrgScoreCard } from '@/components/sera/OrgScoreCard'
import { AiInsightPanel } from '@/components/sera/AiInsightPanel'
import { hfaErcToArmsBarrier } from '@/lib/sera/erc-presentation'
import { isHfaErcCategory } from '@/lib/sera/erc-conversion'
import type { SafetyIssueCandidate } from '@/lib/sera/safety-issue-candidates'
import type { RiskQualityTrendPoint } from '@/lib/sera/risk-quality-trend'
import type { DataConfidence } from '@/lib/sera/data-confidence'
import type { RiskProfileSourceEvent, RiskProfileSummary } from '@/lib/risk-profile/types'

type Intelligence = RiskProfileSummary

// ── Shared mapping constants ──────────────────────────────────────────────────

interface SeverityDef {
  level: number
  label: string
  justificativa: string
  base_cientifica: string
  fonte: string
}

const SEVERITY_MAP: Record<string, SeverityDef> = {
  'P-B': {
    level: 4,
    label: 'Grave',
    justificativa: 'Falha Sensorial (P-B) é classificada como Grave porque o operador não detectou estímulos físicos essenciais — visuais, auditivos ou táteis. Esta ausência de percepção sensorial básica elimina qualquer possibilidade de correção antes da ação, criando trajetória direta para o evento adverso.',
    base_cientifica: 'Segundo Hendy (2003), falhas sensoriais representam o nível mais fundamental de quebra no ciclo perceptual. Quando o input sensorial falha, nenhum processamento cognitivo posterior pode compensar — o operador age sobre uma representação completamente ausente da realidade.',
    fonte: 'Daumas (2018), Tabela 2; Hendy (2003), Annex A'
  },
  'P-C': {
    level: 3,
    label: 'Moderada',
    justificativa: 'Falha de Conhecimento (P-C) é classificada como Moderada porque o operador detectou os estímulos mas não tinha base cognitiva para interpretá-los. Existe potencial de correção via treinamento e experiência acumulada.',
    base_cientifica: 'O modelo de Processamento da Informação (Hendy, 2003) distingue entre falhas de detecção (sensoriais) e falhas de interpretação (conhecimento). Falhas de conhecimento são recuperáveis com intervenção organizacional — treinamento adequado pode eliminar a causa raiz.',
    fonte: 'Daumas (2018), Tabela 5; Hendy (2003), Annex A'
  },
  'P-D': {
    level: 3,
    label: 'Moderada',
    justificativa: 'Falha de Atenção com Pressão de Tempo (P-D) é Moderada porque a pressão temporal foi imposta externamente — a organização pode intervir reduzindo a demanda de processamento ou aumentando o tempo disponível.',
    base_cientifica: 'Hendy (2003) estabelece que Pressão de Tempo = Informação / Tempo. P-D ocorre quando o denominador (tempo) é insuficiente para o numerador (informação). Intervenções organizacionais podem aumentar o tempo disponível ou reduzir a quantidade de informação simultânea.',
    fonte: 'Hendy (2003), Figure 3; Daumas (2018), Tabela 2'
  },
  'P-E': {
    level: 3,
    label: 'Moderada',
    justificativa: 'Gerenciamento de Tempo (P-E) é Moderada porque a pressão foi autoimposta pelo operador. Embora reflita fatores psicológicos individuais, é tratável via avaliação comportamental e cultura organizacional de segurança.',
    base_cientifica: 'Na Teoria do Controle Perceptual (Powers, 1973; Hendy, 2003), P-E revela que o operador priorizou uma meta perceptual (velocidade, eficiência) sobre a meta de segurança. É corrigível mudando as metas organizacionais percebidas.',
    fonte: 'Hendy (2003), Figure 5; Daumas (2018)'
  },
  'P-F': {
    level: 4,
    label: 'Grave',
    justificativa: 'Informação Ilusória (P-F) é classificada como Grave porque o operador agiu racionalmente sobre uma percepção incorreta — o erro era invisível ao próprio operador. Não há mecanismo interno de detecção ou autocorreção.',
    base_cientifica: 'Segundo Hendy (2003) e a Teoria do Controle Perceptual, o operador em P-F compara sua percepção com sua meta e a ação parece correta — porque a percepção está corrompida. Isso torna P-F particularmente perigoso: o operador não tem como saber que está errado. Ilusões sensoriais (como desorientação espacial) eliminam qualquer feedback corretivo interno.',
    fonte: 'Hendy (2003), Annex A; Daumas (2018), Tabela 2'
  },
  'P-G': {
    level: 3,
    label: 'Moderada',
    justificativa: 'Falha de Atenção (P-G) é Moderada porque a informação estava disponível e correta — o operador falhou em selecioná-la. Intervenções de CRM, checklists e design de interface podem mitigar efetivamente.',
    base_cientifica: 'O modelo IP de Hendy (2003) inclui gestão de recursos atencionais como princípio central. P-G reflete má alocação de atenção em ambiente com múltiplos estímulos concorrentes — corrigível via treinamento CRM e redesign de procedimentos.',
    fonte: 'Hendy (2003), Annex A; Daumas (2018)'
  },
  'P-H': {
    level: 2,
    label: 'Menor',
    justificativa: 'Falha de Comunicação (P-H) é classificada como Menor porque a falha está no sistema de transferência de informação — não na capacidade do operador. O problema é externo ao indivíduo e corrigível via procedimentos de comunicação.',
    base_cientifica: 'Hendy (2003) posiciona falhas de comunicação como falhas latentes do sistema, não falhas ativas do operador. A informação necessária existia mas não chegou adequadamente — o operador não poderia ter agido diferente dado o que recebeu.',
    fonte: 'Hendy (2003), Annex A; Daumas (2018), Tabela 2'
  },
  'P-A': {
    level: 1,
    label: 'Negligível',
    justificativa: 'Sem falha de percepção — a contribuição desta etapa para o risco é mínima.',
    base_cientifica: 'A ausência de falha de percepção indica que o ciclo perceptual funcionou adequadamente. O risco deve ser avaliado nas etapas de Objetivo e Ação.',
    fonte: 'Hendy (2003), Annex A'
  },
}

const P_SEVERITY: Record<string, number> = Object.fromEntries(
  Object.entries(SEVERITY_MAP).map(([k, v]) => [k, v.level])
)

const ARMS_SEV_ROW: Record<string, 'A' | 'B' | 'C' | 'D'> = {
  'P-B': 'B', 'P-F': 'B',
  'P-A': 'D',
}

const ARMS_ERC: Record<string, number> = {
  A1: 5, A2: 5, A3: 4, A4: 3,
  B1: 4, B2: 4, B3: 3, B4: 2,
  C1: 3, C2: 3, C3: 2, C4: 1,
  D1: 2, D2: 2, D3: 1, D4: 1,
}

const ERC_COLOR: Record<number, string> = {
  5: '#DC2626', 4: '#EA580C', 3: '#D97706', 2: '#84CC16', 1: '#16A34A',
}

function tCellColor(score: number): string {
  if (score >= 17) return '#7F1D1D'
  if (score >= 10) return '#9A3412'
  if (score >= 5)  return '#854D0E'
  return '#166534'
}

function colorBg(hex: string, alpha = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function riskLevelName(score: number): string {
  if (score >= 17) return 'Inaceitável'
  if (score >= 10) return 'Elevado'
  if (score >= 5)  return 'Tolerável'
  return 'Aceitável'
}

function riskMeaning(score: number): string {
  if (score >= 17) return 'Risco Inaceitável — Ação imediata obrigatória. Operação deve ser revista antes de continuar.'
  if (score >= 10) return 'Risco Elevado — Ação corretiva necessária em curto prazo. Priorizar intervenções preventivas.'
  if (score >= 5)  return 'Risco Tolerável — Requer atenção e plano de ação, mas não é urgente. Acompanhar evolução.'
  return 'Risco Aceitável — O risco está dentro dos limites toleráveis. Monitoramento periódico é suficiente.'
}

function acaoRecomendada(score: number): string {
  if (score >= 17) return 'intervenção imediata obrigatória'
  if (score >= 10) return 'ação corretiva prioritária em curto prazo'
  if (score >= 5)  return 'plano de ação planejado em médio prazo'
  return 'monitoramento periódico sem ação imediata'
}

function sevJustification(sev: number): string {
  if (sev === 4) return 'falhas sensoriais e ilusórias com alto potencial de dano'
  if (sev === 3) return 'falhas cognitivas com severidade controlável'
  if (sev === 2) return 'falhas de comunicação com menor impacto direto'
  return 'impacto mínimo na operação'
}

function barrierLevel(score: number): 1 | 2 | 3 | 4 {
  if (score >= 70) return 1
  if (score >= 40) return 2
  if (score >= 20) return 3
  return 4
}

// ── Traditional 5×5 Matrix ───────────────────────────────────────────────────

const CELL_SIZE = 56

const SEV_LABELS = [
  { num: '5', name: 'Catastrófica', desc: 'Fatalidades múltiplas ou perda total do equipamento' },
  { num: '4', name: 'Grave', desc: 'Fatalidade ou incapacidade permanente, dano grave' },
  { num: '3', name: 'Moderada', desc: 'Lesão grave ou dano significativo ao equipamento' },
  { num: '2', name: 'Menor', desc: 'Lesão leve, dano menor, impacto operacional limitado' },
  { num: '1', name: 'Negligível', desc: 'Sem lesão ou dano significativo, impacto mínimo' },
]

const PROB_LABELS = [
  { num: '1', name: 'Improvável', short: 'Impr.', desc: '< 10% das análises com este padrão' },
  { num: '2', name: 'Remoto',     short: 'Rem.',  desc: '10–25% das análises' },
  { num: '3', name: 'Ocasional',  short: 'Ocas.', desc: '25–50% das análises' },
  { num: '4', name: 'Provável',   short: 'Prov.', desc: '50–75% das análises' },
  { num: '5', name: 'Frequente',  short: 'Freq.', desc: '> 75% das análises' },
]

function countToProb(count: number, total: number): number {
  if (total === 0) return 1
  const pct = (count / total) * 100
  if (pct > 75) return 5
  if (pct > 50) return 4
  if (pct > 25) return 3
  if (pct > 10) return 2
  return 1
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function CellModal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-white font-semibold text-lg leading-tight">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white ml-4 flex-shrink-0 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  )
}

// ── Traditional 5×5 component ─────────────────────────────────────────────────

interface TradCellInfo {
  prob: number
  sev: number
  score: number
  cell: { count: number; codes: string[] } | null
}

function TraditionalMatrix({ data }: { data: Intelligence }) {
  const [selected, setSelected] = useState<TradCellInfo | null>(null)

  const topCodes = data.distribution.perception.top_codes ?? []
  const cellMap: Record<string, { count: number; codes: string[] }> = {}
  for (const tc of topCodes) {
    const sev = P_SEVERITY[tc.code] ?? 3
    const prob = countToProb(tc.count, data.total_analyses)
    const key = `${prob}-${sev}`
    if (!cellMap[key]) cellMap[key] = { count: 0, codes: [] }
    cellMap[key].count += tc.count
    cellMap[key].codes.push(tc.code)
  }

  return (
    <div>
      {selected && (
        <CellModal
          title={`Risco ${riskLevelName(selected.score)} — Score ${selected.score}`}
          onClose={() => setSelected(null)}
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">O que significa esta célula</p>
            <p className="text-slate-300 text-sm">{riskMeaning(selected.score)}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Como esta avaliação foi calculada</p>
            <div className="bg-slate-800 rounded-lg p-3 space-y-3">
              <p className="text-xs text-slate-400">
                Os eventos nesta célula foram classificados aqui pelo seguinte raciocínio:
              </p>

              <div>
                <p className="text-xs font-semibold text-white">
                  1. SEVERIDADE {selected.sev} ({SEV_LABELS.find((l) => l.num === String(selected.sev))?.name})
                </p>
                {selected.cell ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Os códigos SERA {selected.cell.codes.join(', ')} indicam {sevJustification(selected.sev)}{' '}
                    segundo o mapeamento SERA → ISO 31000.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    {SEV_LABELS.find((l) => l.num === String(selected.sev))?.desc}
                  </p>
                )}
                {selected.cell && selected.cell.codes.map(code => {
                  const sevDef = SEVERITY_MAP[code]
                  if (!sevDef) return null
                  return (
                    <div key={code}
                      className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
                          {code}
                        </span>
                        <span className="text-xs text-slate-300 font-medium">
                          Severidade {sevDef.level} — {sevDef.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">
                        {sevDef.justificativa}
                      </p>
                      <div className="border-t border-slate-700 pt-2 mt-2">
                        <p className="text-xs text-slate-500 leading-relaxed italic">
                          {sevDef.base_cientifica}
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          Fonte: {sevDef.fonte}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div>
                <p className="text-xs font-semibold text-white">
                  2. PROBABILIDADE {selected.prob} ({PROB_LABELS[selected.prob - 1].name})
                </p>
                {selected.cell ? (
                  <p className="text-xs text-slate-400 mt-1">
                    Na amostra analisada, este padrão apareceu em {selected.cell.count} evento{selected.cell.count !== 1 ? 's' : ''}.
                    Para fins de visualização, essa frequência foi posicionada na faixa {selected.prob} ({PROB_LABELS[selected.prob - 1].name}) da escala ISO 31000.
                    Isso não representa probabilidade operacional real sem dados de exposição e frequência de voo.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    {PROB_LABELS[selected.prob - 1].desc}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-white">
                  3. SCORE {selected.score} = {selected.prob} × {selected.sev}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Este valor coloca o risco na zona{' '}
                  <strong style={{ color: tCellColor(selected.score) }}>{riskLevelName(selected.score)}</strong>,
                  que requer {acaoRecomendada(selected.score)}.
                </p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Eventos nesta célula</p>
            {selected.cell ? (
              <div className="space-y-1">
                {selected.cell.codes.map((code) => (
                  <div key={code} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2">
                    <span className="font-mono text-yellow-400 text-sm font-bold">{code}</span>
                    <span className="text-slate-400 text-xs">código SERA</span>
                  </div>
                ))}
                <p className="text-slate-500 text-xs mt-1">
                  Total: {selected.cell.count} análise{selected.cell.count !== 1 ? 's' : ''}
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Nenhum evento foi classificado nesta célula.</p>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-slate-500 text-xs">
              Referência metodológica: Matriz de risco baseada em ISO 31000:2018 e ICAO Doc 9859 (Safety Management Manual), 4ª edição.
            </p>
          </div>
        </CellModal>
      )}

      <div className="overflow-x-auto">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* SEVERIDADE vertical label + Y labels */}
          <div style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
            <div style={{
              width: 20,
              height: CELL_SIZE * 5 + 4 * 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: 10,
                letterSpacing: '0.15em',
                color: '#64748B',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transform: 'rotate(-90deg)',
                display: 'block',
              }}>SEVERIDADE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 8, flexShrink: 0 }}>
              {SEV_LABELS.map((l) => (
                <div key={l.num} style={{
                  height: CELL_SIZE,
                  width: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8' }}>{l.num}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid + X labels */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(5, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(5, ${CELL_SIZE}px)`,
              gap: 2,
            }}>
              {SEV_LABELS.map((_, row) =>
                PROB_LABELS.map((_, col) => {
                  const prob = col + 1
                  const sev = 5 - row
                  const score = prob * sev
                  const color = tCellColor(score)
                  const key = `${prob}-${sev}`
                  const cell = cellMap[key]
                  return (
                    <div
                      key={`${row}-${col}`}
                      onClick={() => setSelected({ prob, sev, score, cell: cell ?? null })}
                      title={`Score ${score} — clique para detalhes`}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        background: colorBg(color, 0.2),
                        border: '1px solid #1E293B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        transition: 'filter 0.15s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.3)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.filter = '' }}
                    >
                      <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, color, opacity: 0.55 }}>
                        {score}
                      </span>
                      {cell && (
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: color,
                          border: '2px solid white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: 'white' }}>{cell.count}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* X labels */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(5, ${CELL_SIZE}px)`, gap: 2, marginTop: 4 }}>
              {PROB_LABELS.map((l) => (
                <div key={l.num} style={{
                  height: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 4,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', lineHeight: 1.3 }}>{l.num}</span>
                  <span style={{ fontSize: 9, color: '#64748B', textAlign: 'center' }}>{l.short}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: '0.15em', color: '#64748B', fontWeight: 600, marginTop: 4 }}>
              PROBABILIDADE
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4" style={{ fontSize: 11 }}>
        {[
          { color: '#166534', label: 'Aceitável (1–4)' },
          { color: '#854D0E', label: 'Tolerável (5–9)' },
          { color: '#9A3412', label: 'Elevado (10–16)' },
          { color: '#7F1D1D', label: 'Inaceitável (17–25)' },
        ].map((item) => (
          <div key={item.color} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
            <span className="text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>
      <p className="text-slate-600 text-xs mt-2">Referência: ISO 31000:2018 · ICAO Doc 9859 SMM</p>
      <div className="mt-3 bg-amber-500/8 border border-amber-500/20 rounded-lg p-3">
        <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ Limitação metodológica</p>
        <p className="text-slate-400 text-xs leading-relaxed">
          A probabilidade nesta matriz é inferida da frequência relativa dos padrões de falha dentro do banco
          de eventos investigados — não da frequência operacional real. Eventos não investigados ou não
          reportados não estão incluídos, o que pode subestimar o risco real. Para maior precisão, combine
          estes dados com indicadores operacionais da sua organização.
        </p>
      </div>
    </div>
  )
}

// ── ARMS-ERC 4×4 Matrix ──────────────────────────────────────────────────────

interface BarrierDef {
  key: 1 | 2 | 3 | 4
  name: string
  sub: string
  justificativa: string
  base_cientifica: string
  como_calculamos: string
  fonte: string
}

const ARMS_BARRIER_DEFS: BarrierDef[] = [
  {
    key: 1,
    name: 'Nenhuma',
    sub: 'dependeu de sorte',
    justificativa: 'As barreiras de segurança estavam ausentes ou foram completamente neutralizadas. O evento dependeu de fatores externos não controláveis para não resultar em acidente. O sistema de defesa falhou em todas as camadas.',
    base_cientifica: 'No modelo Swiss Cheese de Reason (1990), barreiras nível 1 indicam que todos os "buracos" dos queijos alinharam simultaneamente — não havia nenhuma camada de proteção remanescente. O ARMS Working Group (EASA, 2010) classifica este nível como o mais crítico porque revela vulnerabilidade sistêmica total, não apenas falha pontual.',
    como_calculamos: 'Falhas SERA nas três camadas (percepção, objetivo e ação) simultaneamente, ou violação intencional de procedimento combinada com ausência de barreira técnica — indicam que nenhuma barreira estava efetiva no momento do evento (ARMS Working Group, 2010).',
    fonte: 'Reason (1990); ARMS Working Group, EASA (2010); EU 376/2014',
  },
  {
    key: 2,
    name: 'Mínima',
    sub: 'barreiras mínimas',
    justificativa: 'Existiam barreiras de segurança, mas eram insuficientes ou funcionaram de forma inadequada. O evento foi contido por margem estreita — pequenas variações nas condições poderiam ter resultado em acidente.',
    base_cientifica: 'O ARMS-ERC diferencia barreiras pela sua robustez e redundância, não apenas pela presença. Barreiras mínimas (nível 2) existem no papel mas carecem de profundidade defensiva. Segundo o ARMS Working Group (2010), este nível caracteriza organizações onde as barreiras são mais simbólicas do que funcionais.',
    como_calculamos: 'Falhas SERA em duas das três camadas (percepção, objetivo ou ação) — ou violação de procedimento sem ausência total de barreiras técnicas. Barreiras existem mas são majoritariamente ineficazes no contexto do evento.',
    fonte: 'ARMS Working Group, EASA/Eurocontrol/IATA (2010); Reason (1990)',
  },
  {
    key: 3,
    name: 'Limitada',
    sub: 'efetividade limitada',
    justificativa: 'As barreiras de segurança estavam presentes e funcionaram parcialmente. O evento foi contido, mas a efetividade das defesas foi reduzida por fatores identificáveis — o sistema não operou em sua capacidade plena.',
    base_cientifica: 'Barreiras com efetividade limitada (nível 3) representam o cenário mais comum em organizações com maturidade de segurança intermediária. O ARMS Working Group (2010) identifica que neste nível as barreiras existem e funcionam, mas não foram testadas em sua capacidade máxima ou apresentam degradação conhecida.',
    como_calculamos: 'Falha isolada em uma camada SERA (percepção, objetivo ou ação) sem deslize/lapso puro — as demais camadas de barreira estavam funcionando. Ou falha de comunicação combinada com uma segunda falha.',
    fonte: 'ARMS Working Group, EASA (2010); ICAO Doc 9859 SMM, 4ª ed.',
  },
  {
    key: 4,
    name: 'Efetiva',
    sub: 'barreiras robustas',
    justificativa: 'As barreiras de segurança funcionaram conforme projetado. O evento ocorreu apesar de um sistema de defesa robusto — indica falha residual dentro de um sistema bem gerenciado.',
    base_cientifica: 'Barreiras efetivas (nível 4) caracterizam organizações com alta maturidade de segurança. Segundo o ARMS Working Group (2010), neste nível as defesas são redundantes, testadas regularmente e mantidas adequadamente. O fato de um evento ocorrer mesmo com barreiras efetivas é raro e fornece informação valiosa sobre falhas residuais do sistema.',
    como_calculamos: 'Deslize ou lapso isolado (A-B) com percepção correta e objetivo adequado — ou ausência total de falhas nas três camadas. As barreiras técnicas e procedimentais estavam funcionando; a falha foi pontual e residual.',
    fonte: 'ARMS Working Group, EASA (2010); Reason (1990); ICAO Doc 9859',
  },
]

const ARMS_BARRIER_LABELS = ARMS_BARRIER_DEFS.map(d => ({ key: d.key, name: d.name, sub: d.sub }))

interface ArmsSevDef {
  key: 'A' | 'B' | 'C' | 'D'
  name: string
  sub: string
  justificativa: string
  base_cientifica: string
  como_calculamos: string
  fonte: string
}

const ARMS_SEV_DEFS: ArmsSevDef[] = [
  {
    key: 'A',
    name: 'Catastrófico',
    sub: 'fatalidades múltiplas',
    justificativa: 'O resultado mais provável do evento, caso tivesse escalado completamente, seria fatalidades múltiplas ou perda total de aeronave/instalação. Esta é a categoria de maior impacto irreversível.',
    base_cientifica: 'O ARMS-ERC avalia o "pior resultado crível" — não o resultado real, mas o que provavelmente teria ocorrido sem intervenção. Catastrófico (A) indica que as consequências máximas envolveriam perda de vidas múltiplas, conforme definição do ICAO Doc 9859 e EASA.',
    como_calculamos: 'Códigos SERA como P-B e P-F em contextos de alta consequência (voo, operação offshore em condições adversas) mapeiam para severidade A quando a falha elimina completamente a capacidade de evitar o impacto.',
    fonte: 'ARMS Working Group (2010); ICAO Doc 9859, Table 2.2-1',
  },
  {
    key: 'B',
    name: 'Grave',
    sub: 'fatalidade ou lesão grave',
    justificativa: 'O resultado mais provável seria uma fatalidade individual ou lesão permanentemente incapacitante. Eventos neste nível têm potencial de dano irreversível a pessoas.',
    base_cientifica: 'Severidade B no ARMS-ERC corresponde a eventos onde o mecanismo de falha identificado tem capacidade de causar dano grave mas não necessariamente catastrófico. Falhas de percepção (P-B, P-F) em contextos operacionais típicos da aviação offshore mapeiam para este nível.',
    como_calculamos: 'Os códigos de percepção identificados nas análises SERA indicam falhas que eliminam ou comprometem gravemente a capacidade de resposta do operador, com potencial de dano grave conforme o contexto operacional declarado.',
    fonte: 'ARMS Working Group (2010); EASA AMC 20-8',
  },
  {
    key: 'C',
    name: 'Significativo',
    sub: 'lesão leve, dano sério',
    justificativa: 'O resultado mais provável seria lesão leve a moderada ou dano significativo ao equipamento/operação. Recuperável, mas com impacto operacional e humano relevante.',
    base_cientifica: 'Falhas cognitivas (P-C, P-D, P-E, P-G) geralmente mapeiam para severidade C porque o operador retém alguma capacidade de percepção e resposta — a falha é parcial, não total. Segundo o ARMS Working Group (2010), neste nível existiam alternativas de resposta disponíveis ao operador.',
    como_calculamos: 'Códigos SERA de falha cognitiva indicam que o operador tinha informação parcial disponível — o que tipicamente resulta em consequências limitadas quando comparado a falhas sensoriais completas.',
    fonte: 'ARMS Working Group (2010); ICAO Doc 9859',
  },
  {
    key: 'D',
    name: 'Menor',
    sub: 'sem lesão, dano menor',
    justificativa: 'O resultado mais provável seria sem lesão pessoal ou com dano mínimo e reversível. O evento tem valor preventivo mas impacto real limitado.',
    base_cientifica: 'Falhas de comunicação (P-H) e ausência de falha de percepção (P-A) mapeiam para severidade D porque o problema reside no sistema de transferência de informação — corrigível sem dano pessoal direto. O ARMS Working Group (2010) classifica neste nível eventos onde as barreiras e a competência do operador limitaram efetivamente as consequências.',
    como_calculamos: 'Quando a análise SERA identifica falhas de comunicação ou ausência de falhas de percepção, as consequências potenciais são tipicamente menores e o foco preventivo é nos processos organizacionais.',
    fonte: 'ARMS Working Group (2010); EU 376/2014, Anexo I',
  },
]

const ARMS_SEV_LABELS = ARMS_SEV_DEFS.map(d => ({ key: d.key, name: d.name, sub: d.sub }))

interface ARMSCellInfo {
  cellKey: string
  erc: number
  sevLabel: typeof ARMS_SEV_LABELS[0]
  barLabel: typeof ARMS_BARRIER_LABELS[0]
  cell: { count: number; codes: string[] } | null
  barrierScore: number
}

function ercMeaning(erc: number): string {
  switch (erc) {
    case 5: return 'Risco Inaceitável — ação imediata obrigatória'
    case 4: return 'Risco Urgente — ação corretiva em 24-48h'
    case 3: return 'Ação Requerida — plano de intervenção necessário'
    case 2: return 'Monitorar — acompanhar sem ação imediata'
    default: return 'Aceitável — risco dentro dos parâmetros normais'
  }
}

function ARMSMatrix({ data }: { data: Intelligence }) {
  const [selected, setSelected] = useState<ARMSCellInfo | null>(null)
  const consolidatedSuppressed =
    data.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED' ||
    data.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY'

  const topCodes = data.distribution.perception.top_codes ?? []
  const barrier = isHfaErcCategory(data.modal_erc_level)
    ? hfaErcToArmsBarrier(data.modal_erc_level)
    : consolidatedSuppressed
      ? null
      : barrierLevel(data.score.value)

  if (consolidatedSuppressed || barrier === null) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
        <h3 className="text-white font-semibold text-sm">Matriz ARMS-ERC</h3>
        <p className="text-sm text-slate-400">
          D3-b: ERC numérico consolidado omitido
          {data.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED'
            ? ' (perfil misto legacy/vNext).'
            : data.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY'
              ? ' (somente vNext — sem ERC canônico).'
              : '.'}
        </p>
        <p className="text-xs text-slate-500">
          Decisão autoral D3-b. Não se inventa ERC a partir do índice de cobertura.
        </p>
      </div>
    )
  }

  const cellMap: Record<string, { count: number; codes: string[] }> = {}
  for (const tc of topCodes) {
    const row = ARMS_SEV_ROW[tc.code] ?? 'C'
    const col = barrier
    const key = `${row}${col}`
    if (!cellMap[key]) cellMap[key] = { count: 0, codes: [] }
    cellMap[key].count += tc.count
    cellMap[key].codes.push(tc.code)
  }

  return (
    <div>
      {selected && (
        <CellModal
          title={`ERC ${selected.erc} — ${selected.sevLabel.name} × ${selected.barLabel.name}`}
          onClose={() => setSelected(null)}
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
              O que significa ERC {selected.erc}
            </p>
            <p className="text-slate-300 text-sm">{ercMeaning(selected.erc)}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Como esta avaliação foi calculada</p>
            <div className="space-y-3">
              {/* Severidade */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-300 mb-1">
                  Severidade {selected.sevLabel.key} — {selected.sevLabel.name}
                </p>
                {(() => {
                  const def = ARMS_SEV_DEFS.find(d => d.key === selected.sevLabel.key)
                  if (!def) return null
                  return (
                    <>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{def.justificativa}</p>
                      <p className="text-xs text-slate-500 italic leading-relaxed mb-1">{def.base_cientifica}</p>
                      <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-700 pt-2 mt-2">
                        <strong className="text-slate-400">Como calculamos:</strong>{' '}{def.como_calculamos}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">Fonte: {def.fonte}</p>
                    </>
                  )
                })()}
              </div>

              {/* Efetividade das barreiras */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-300 mb-1">
                  Barreiras nível {selected.barLabel.key} — {selected.barLabel.name}
                </p>
                {(() => {
                  const def = ARMS_BARRIER_DEFS.find(d => d.key === selected.barLabel.key)
                  if (!def) return null
                  return (
                    <>
                      <p className="text-xs text-slate-400 leading-relaxed mb-2">{def.justificativa}</p>
                      <p className="text-xs text-slate-500 italic leading-relaxed mb-1">{def.base_cientifica}</p>
                      <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-700 pt-2 mt-2">
                        <strong className="text-slate-400">Como calculamos:</strong>{' '}{def.como_calculamos}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">Fonte: {def.fonte}</p>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Eventos nesta célula</p>
            {selected.cell ? (
              <div className="space-y-1">
                {selected.cell.codes.map((code) => (
                  <div key={code} className="flex items-center justify-between bg-slate-800 rounded px-3 py-2">
                    <span className="font-mono text-yellow-400 text-sm font-bold">{code}</span>
                    <span className="text-slate-400 text-xs">código SERA</span>
                  </div>
                ))}
                <p className="text-slate-500 text-xs mt-1">
                  Total: {selected.cell.count} análise{selected.cell.count !== 1 ? 's' : ''}
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-sm">Nenhum evento foi classificado nesta célula.</p>
            )}
          </div>

          <div className="border-t border-slate-800 pt-4">
            <p className="text-slate-500 text-xs">
              Referência: ARMS Working Group (EASA/Eurocontrol/IATA, 2010). Aviation Risk Management Solutions.
            </p>
          </div>
        </CellModal>
      )}

      <div className="overflow-x-auto">
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {/* SEVERIDADE label + Y labels */}
          <div style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
            <div style={{
              width: 20,
              height: CELL_SIZE * 4 + 3 * 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: 10,
                letterSpacing: '0.15em',
                color: '#64748B',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                transform: 'rotate(-90deg)',
                display: 'block',
              }}>SEVERIDADE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 8, flexShrink: 0 }}>
              {ARMS_SEV_LABELS.map((l) => (
                <div key={l.key} style={{
                  height: CELL_SIZE,
                  width: 110,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', lineHeight: 1.3 }}>
                    {l.key} — {l.name}
                  </span>
                  <span style={{ fontSize: 9, color: '#64748B' }}>{l.sub}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Grid + X labels */}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(4, ${CELL_SIZE}px)`,
              gridTemplateRows: `repeat(4, ${CELL_SIZE}px)`,
              gap: 2,
            }}>
              {ARMS_SEV_LABELS.map((sevL) =>
                ARMS_BARRIER_LABELS.map((barL) => {
                  const cellKey = `${sevL.key}${barL.key}`
                  const erc = ARMS_ERC[cellKey] ?? 2
                  const color = ERC_COLOR[erc]
                  const cell = cellMap[cellKey]
                  return (
                    <div
                      key={cellKey}
                      onClick={() => setSelected({
                        cellKey,
                        erc,
                        sevLabel: sevL,
                        barLabel: barL,
                        cell: cell ?? null,
                        barrierScore: data.score.value,
                      })}
                      title={`ERC ${erc} — clique para detalhes`}
                      style={{
                        width: CELL_SIZE,
                        height: CELL_SIZE,
                        background: colorBg(color, 0.2),
                        border: '1px solid #1E293B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        transition: 'filter 0.15s',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.filter = 'brightness(1.3)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.filter = '' }}
                    >
                      <span style={{ position: 'absolute', top: 3, right: 4, fontSize: 8, color, opacity: 0.6 }}>
                        ERC{erc}
                      </span>
                      {cell && (
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: color,
                          border: '2px solid white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 'bold', color: 'white' }}>{cell.count}</span>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* X labels */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(4, ${CELL_SIZE}px)`, gap: 2, marginTop: 4 }}>
              {ARMS_BARRIER_LABELS.map((l) => (
                <div key={l.key} style={{
                  height: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  paddingTop: 4,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', lineHeight: 1.3 }}>{l.key}</span>
                  <span style={{ fontSize: 9, color: '#64748B', textAlign: 'center' }}>{l.name}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', fontSize: 10, letterSpacing: '0.15em', color: '#64748B', fontWeight: 600, marginTop: 4 }}>
              EFETIVIDADE DAS BARREIRAS REMANESCENTES
            </div>
          </div>
        </div>
      </div>

      {/* ERC Legend */}
      <div className="flex flex-wrap gap-4 mt-4" style={{ fontSize: 11 }}>
        {[
          { erc: 5, label: 'ERC 5 — Ação imediata' },
          { erc: 4, label: 'ERC 4 — Urgente' },
          { erc: 3, label: 'ERC 3 — Ação requerida' },
          { erc: 2, label: 'ERC 2 — Monitorar' },
          { erc: 1, label: 'ERC 1 — Aceitável' },
        ].map((item) => (
          <div key={item.erc} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ERC_COLOR[item.erc] }} />
            <span className="text-slate-400">{item.label}</span>
          </div>
        ))}
      </div>

      {/* ARMS explanation */}
      <div className="mt-5 bg-slate-800/50 border border-slate-700/50 rounded-lg p-4 text-xs text-slate-400 leading-relaxed space-y-2">
        <p>
          A matriz ARMS-ERC difere da matriz tradicional em um aspecto fundamental: em vez de usar probabilidade
          histórica (quantas vezes esse tipo de evento ocorreu no passado), ela avalia a efetividade das barreiras
          de segurança que estavam presentes no momento do evento.
        </p>
        <p>
          Esta abordagem é mais adequada para eventos de segurança operacional porque captura a condição das
          barreiras no momento do evento — não uma estimativa estatística baseada em dados históricos que podem
          não refletir o contexto específico.
        </p>
        <p className="text-slate-500">
          Desenvolvida pelo ARMS Working Group (EASA, Eurocontrol, IATA, 2007–2010) e adotada pela regulação
          europeia de reporte de ocorrências (EU 376/2014).
        </p>
      </div>
    </div>
  )
}

// ── SERA Reasoning Panel ──────────────────────────────────────────────────────

function SeraReasoningPanel({ data, matrixTab }: { data: Intelligence; matrixTab: 'traditional' | 'arms' }) {
  const topCodes = data.distribution.perception.top_codes ?? []
  if (topCodes.length === 0) return null

  const sevCount: Record<number, number> = {}
  for (const tc of topCodes) {
    const sev = P_SEVERITY[tc.code] ?? 3
    sevCount[sev] = (sevCount[sev] ?? 0) + tc.count
  }
  const dominantSev = Number(
    Object.entries(sevCount).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]
  )

  const topCode = topCodes[0]
  const prob = countToProb(topCode.count, data.total_analyses)
  const pct = data.total_analyses > 0 ? Math.round((topCode.count / data.total_analyses) * 100) : 0
  const score = prob * dominantSev

  if (matrixTab === 'arms') {
    const consolidatedSuppressed =
      data.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED' ||
      data.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY'
    if (consolidatedSuppressed || !isHfaErcCategory(data.modal_erc_level)) {
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <h3 className="text-white font-semibold text-sm">Como a análise chegou aqui</h3>
          <p className="text-sm text-slate-400">
            D3-b: sem ERC numérico consolidado para este perfil
            {data.erc_presentation_mode === 'SUPPRESSED_D3B_MIXED'
              ? ' misto.'
              : data.erc_presentation_mode === 'SUPPRESSED_D3B_VNEXT_ONLY'
                ? ' somente vNext.'
                : ' (sem ERC legado calculável).'}
          </p>
          <p className="text-xs text-slate-500">
            Códigos P/O/A e pré-condições permanecem disponíveis; não se deriva ERC do índice de cobertura.
          </p>
        </div>
      )
    }
    const armsSevKey: 'A' | 'B' | 'C' | 'D' = ARMS_SEV_ROW[topCode.code] ?? 'C'
    const barKey = hfaErcToArmsBarrier(data.modal_erc_level)
    const cellKey = `${armsSevKey}${barKey}`
    const erc = ARMS_ERC[cellKey] ?? 2
    const armsSevDef = ARMS_SEV_DEFS.find(d => d.key === armsSevKey)
    const barDef = ARMS_BARRIER_DEFS.find(d => d.key === barKey)

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-white font-semibold text-sm">Como a análise chegou aqui</h3>
          <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
            Raciocínio SERA → ARMS-ERC
          </span>
        </div>

        {/* BLOCO 1 — Severidade */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Severidade do resultado (eixo Y)</p>
          <div className="flex flex-wrap gap-1.5">
            {topCodes.slice(0, 5).map((tc) => (
              <span
                key={tc.code}
                className="bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-mono px-2 py-0.5 rounded"
              >
                {tc.code} ×{tc.count}
              </span>
            ))}
          </div>
          {armsSevDef && (
            <div className="bg-slate-800/40 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-300">
                Severidade {armsSevDef.key} — {armsSevDef.name}
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">{armsSevDef.justificativa}</p>
              <p className="text-xs text-slate-500 italic leading-relaxed">{armsSevDef.base_cientifica}</p>
              <p className="text-xs text-slate-600 mt-1">Fonte: {armsSevDef.fonte}</p>
            </div>
          )}
        </div>

        {/* BLOCO 2 — Barreiras */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Efetividade das barreiras (eixo X)</p>
          {barDef && (
            <div className="bg-slate-800/40 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-slate-300">
                {data.modal_erc_level
                  ? `Calculada pelas falhas SERA (ARMS-ERC) — nível modal: ${barKey}`
                  : `Estimada pelo índice de cobertura: ${data.score.value} (nenhuma análise com ERC calculado ainda)`}
              </p>
              <p className="text-xs text-slate-400">
                Nível {barKey} — {barDef.name}
              </p>
              {data.modal_erc_level ? (
                <p className="text-xs text-slate-500 leading-relaxed">
                  O nível de efetividade das barreiras é determinado pelos códigos SERA de cada análise
                  (percepção, objetivo, ação), conforme o ARMS Working Group (2010). O valor exibido é
                  o nível mais frequente entre as análises com ERC calculado.
                </p>
              ) : (
                <p className="text-xs text-slate-500 leading-relaxed">{barDef.como_calculamos}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                Índice de Cobertura: <strong className="text-white">{data.score.value}</strong> — informação complementar,
                não determina o nível de efetividade.
              </p>
              <p className="text-xs text-slate-600 mt-1">Fonte: {barDef.fonte}</p>
            </div>
          )}
        </div>

        {/* BLOCO 3 — ERC resultante */}
        <div className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">ERC resultante</p>
          <p className="text-slate-400 text-xs">
            Célula <strong className="text-white font-mono">{cellKey}</strong> → ERC{' '}
            <strong className="text-white">{erc}</strong> —{' '}
            <strong style={{ color: ERC_COLOR[erc] }}>{ercMeaning(erc)}</strong>
          </p>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(erc / 5) * 100}%`, background: ERC_COLOR[erc] }}
            />
          </div>
        </div>

        {/* BLOCO 4 — Nota metodológica */}
        <div className="bg-blue-500/8 border border-blue-500/20 rounded-lg p-3">
          <p className="text-blue-300 text-xs leading-relaxed">
            Na metodologia ARMS-ERC, a pergunta central não é &quot;qual a probabilidade histórica?&quot; mas sim
            &quot;quão efetivas eram as barreiras no momento do evento?&quot; Esta abordagem é mais adequada para
            análise retrospectiva de eventos específicos.
          </p>
          <p className="text-slate-600 text-xs mt-1">
            Fonte: ARMS Working Group, EASA (2010).
          </p>
        </div>

        <p className="text-blue-400 text-xs">
          Clique nas células da matriz para ver detalhes →
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-white font-semibold text-sm">Como a análise chegou aqui</h3>
        <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full flex-shrink-0">
          Raciocínio SERA → Matriz
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Severidade inferida</p>
        <p className="text-slate-400 text-xs">
          Os {data.total_analyses} eventos analisados foram classificados com os seguintes códigos de percepção:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {topCodes.slice(0, 5).map((tc) => (
            <span
              key={tc.code}
              className="bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-mono px-2 py-0.5 rounded"
            >
              {tc.code} ×{tc.count}
            </span>
          ))}
        </div>
        <p className="text-slate-400 text-xs">
          Estes códigos mapeiam para severidade{' '}
          <strong className="text-white">{dominantSev}</strong> na matriz porque:
        </p>
        {topCodes.slice(0, 3).map(tc => {
          const sevDef = SEVERITY_MAP[tc.code]
          if (!sevDef) return null
          return (
            <div key={tc.code} className="bg-slate-800/40 rounded p-2 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs font-bold text-yellow-400">
                  {tc.code}
                </span>
                <span className="text-xs text-slate-400">
                  → Sev. {sevDef.level} ({sevDef.label})
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {sevDef.justificativa}
              </p>
            </div>
          )
        })}
        <p className="text-xs text-slate-600 mt-2 italic">
          Classificação baseada em Hendy (2003) e Daumas (2018).
          Critérios: capacidade de autocorreção, recuperabilidade
          organizacional e potencial de dano direto.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Probabilidade inferida</p>
        <p className="text-slate-400 text-xs">
          A probabilidade foi estimada pela frequência relativa do padrão de falha dentro do banco de eventos
          analisados:{' '}
          <strong className="text-white font-mono">{topCode.code}</strong> apareceu{' '}
          <strong className="text-white">{topCode.count}</strong>{' '}
          {topCode.count === 1 ? 'vez' : 'vezes'} em{' '}
          <strong className="text-white">{data.total_analyses}</strong> análises (
          <strong className="text-white">{pct}%</strong>) → Probabilidade{' '}
          <strong className="text-white">{prob}</strong> ({PROB_LABELS[prob - 1].name})
        </p>
        <p className="text-amber-400/80 text-xs leading-relaxed">
          ⚠️ Nota: esta é uma aproximação baseada em eventos investigados. A frequência operacional real pode
          ser diferente dependendo da taxa de reporte da sua organização.
        </p>
      </div>

      <div className="space-y-2 border-t border-slate-800 pt-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Score resultante</p>
        <p className="text-slate-400 text-xs">
          Score = {prob} × {dominantSev} ={' '}
          <strong className="text-white text-sm">{score}</strong> — Classificação:{' '}
          <strong style={{ color: tCellColor(score) }}>{riskLevelName(score)}</strong>
        </p>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${(score / 25) * 100}%`, background: tCellColor(score) }}
          />
        </div>
      </div>

      <p className="text-blue-400 text-xs">
        Clique nas células da matriz para ver detalhes →
      </p>
    </div>
  )
}

// ── Top Preconditions Panel ───────────────────────────────────────────────────

function TopPreconditionsPanel({ preconditions }: { preconditions: Intelligence['top_preconditions'] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
      <h3 className="text-white font-semibold text-sm">Precondições mais frequentes</h3>
      <div className="space-y-3">
        {preconditions.map((p, i) => (
          <div key={p.code} className="flex items-center gap-3">
            <span className="text-slate-600 text-xs w-4 flex-shrink-0">#{i + 1}</span>
            <span className="font-mono text-yellow-400 text-xs font-bold w-10 flex-shrink-0">{p.code}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-slate-400 text-xs truncate">{p.name}</span>
                <span className="text-white text-xs font-semibold ml-2 flex-shrink-0">{p.pct}%</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-400/60 rounded-full" style={{ width: `${p.pct}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Utility components ────────────────────────────────────────────────────────

const combinationMeaning: Record<string, string> = {
  'P-F': 'falha de percepção por foco',
  'P-M': 'falha de percepção por memória',
  'O-B': 'objetivo baseado em viés',
  'O-A': 'objetivo inadequado',
  'A-I': 'ação incorreta',
  'A-O': 'ação omitida',
}

function combinationDescription(pair: string): string {
  const parts = pair.split(' + ')
  const descriptions = parts.map((p) => combinationMeaning[p] ?? p)
  return descriptions.join(' associada a ')
}

function TrendLine({ trend }: { trend: { month: string; count: number }[] }) {
  if (trend.length < 2) return null
  const maxCount = Math.max(...trend.map((t) => t.count), 1)
  const w = 600
  const h = 100
  const padX = 30
  const padY = 10
  const innerW = w - padX * 2
  const innerH = h - padY * 2
  const points = trend.map((t, i) => {
    const x = padX + (i / (trend.length - 1)) * innerW
    const y = padY + innerH - (t.count / maxCount) * innerH
    return { x, y, ...t }
  })
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  const last3 = trend.slice(-3)
  const trendDir =
    last3.length >= 2
      ? last3[last3.length - 1].count > last3[0].count
        ? '↑ Crescente'
        : last3[last3.length - 1].count < last3[0].count
          ? '↓ Decrescente'
          : '→ Estável'
      : '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-slate-400 text-xs uppercase tracking-wide">Distribuição temporal</h4>
        <span className="text-xs text-slate-400">{trendDir}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full overflow-visible">
        <polyline points={polyline} fill="none" className="stroke-blue-500" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p) => (
          <g key={p.month}>
            <circle cx={p.x} cy={p.y} r={4} className="fill-blue-500" />
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={9} className="fill-white">{p.count}</text>
            <text x={p.x} y={h + 18} textAnchor="middle" fontSize={9} className="fill-slate-400">
              {new Date(Number(p.month.split('-')[0]), Number(p.month.split('-')[1]) - 1)
                .toLocaleString('pt-BR', { month: 'short' })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

// ── Data Confidence Panel ─────────────────────────────────────────────────────

const CONFIDENCE_LEVEL_LABEL: Record<DataConfidence['level'], string> = {
  insufficient: 'Insuficiente',
  limited: 'Limitada',
  moderate: 'Moderada',
  strong: 'Mais consolidada',
}

const CONFIDENCE_LEVEL_COLOR: Record<DataConfidence['level'], string> = {
  insufficient: '#EF4444',
  limited: '#F97316',
  moderate: '#EAB308',
  strong: '#22C55E',
}

function DataConfidencePanel({ confidence }: { confidence: DataConfidence | undefined }) {
  if (!confidence) {
    return null
  }

  const color = CONFIDENCE_LEVEL_COLOR[confidence.level]
  const label = CONFIDENCE_LEVEL_LABEL[confidence.level]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-white font-semibold text-sm">Confiança dos dados</h3>
            <span
              className="px-2 py-0.5 rounded text-xs font-semibold"
              style={{
                background: color + '22',
                color,
                border: `1px solid ${color}44`,
              }}
            >
              {label}
            </span>
          </div>
          <p className="text-slate-500 text-xs mb-3">
            Indica a robustez da base analisada, não o nível de risco.
          </p>

          {confidence.messages.length > 0 && (
            <ul className="space-y-1 mb-3">
              {confidence.messages.map((msg, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-400">
                  <span className="text-slate-600 mt-0.5 shrink-0">•</span>
                  {msg}
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-600 italic">{confidence.caveat}</p>
        </div>

        <div className="flex gap-6 shrink-0 border-l border-slate-800 pl-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-white tabular-nums">
              {confidence.total_analyses}
            </p>
            <p className="text-xs text-slate-500 whitespace-nowrap">Análises</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums" style={{ color }}>
              {Math.round(confidence.valid_erc_share * 100)}%
            </p>
            <p className="text-xs text-slate-500 whitespace-nowrap">ERC válido</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-400 tabular-nums">
              /{confidence.minimum_recommended}
            </p>
            <p className="text-xs text-slate-500 whitespace-nowrap">Mín. rec.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Quality Trend Panel ───────────────────────────────────────────────────────

const HFA_ERC_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: '#EF4444',
  4: '#F97316',
  3: '#EAB308',
  2: '#22C55E',
  1: '#6B7280',
}

const HFA_ERC_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: 'Crítico',
  4: 'Alto',
  3: 'Moderado',
  2: 'Baixo',
  1: 'Aceitável',
}

function QualityTrendPanel({ points }: { points: RiskQualityTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-white font-semibold mb-1">Tendência qualitativa observada</h3>
        <p className="text-slate-500 text-xs mb-4">
          Distribuição mensal por categoria HFA ERC. Não ajustada por exposição operacional;
          volume maior pode refletir maior reporte ou uso da ferramenta.
        </p>
        <p className="text-slate-500 text-sm">
          Ainda não há dados suficientes para tendência qualitativa.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-white font-semibold">Tendência qualitativa observada</h3>
        <p className="text-slate-500 text-xs mt-1">
          Distribuição mensal por categoria HFA ERC. Não ajustada por exposição operacional —
          volume maior pode refletir maior reporte ou uso da ferramenta, não necessariamente
          aumento de risco.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800 text-left">
              <th className="pb-2 font-medium pr-4">Mês</th>
              <th className="pb-2 font-medium pr-4 text-right">Análises c/ ERC</th>
              <th className="pb-2 font-medium pr-4">Dominante</th>
              <th className="pb-2 font-medium pr-4 text-right">Alto/Crítico</th>
              <th className="pb-2 font-medium">Distribuição ERC</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt) => {
              const dom = pt.dominant_hfa_erc_category
              return (
                <tr key={pt.month} className="border-b border-slate-800/50 last:border-0">
                  <td className="py-3 pr-4 font-mono text-slate-300">{pt.month}</td>
                  <td className="py-3 pr-4 text-white font-semibold text-right">{pt.total}</td>
                  <td className="py-3 pr-4">
                    {dom ? (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-semibold"
                        style={{
                          background: HFA_ERC_COLOR[dom] + '22',
                          color: HFA_ERC_COLOR[dom],
                          border: `1px solid ${HFA_ERC_COLOR[dom]}44`,
                        }}
                      >
                        {HFA_ERC_LABEL[dom]}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <span className={pt.critical_or_high_share > 0 ? 'text-orange-400 font-semibold' : 'text-slate-500'}>
                      {Math.round(pt.critical_or_high_share * 100)}%
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex gap-0.5 h-3">
                      {([
                        { cat: 5 as const, count: pt.hfa_erc.c5 },
                        { cat: 4 as const, count: pt.hfa_erc.c4 },
                        { cat: 3 as const, count: pt.hfa_erc.c3 },
                        { cat: 2 as const, count: pt.hfa_erc.c2 },
                        { cat: 1 as const, count: pt.hfa_erc.c1 },
                      ]).map(({ cat, count }) => {
                        const w = pt.total > 0 ? (count / pt.total) * 100 : 0
                        if (w === 0) return null
                        return (
                          <div
                            key={cat}
                            title={`HFA ${cat} (${HFA_ERC_LABEL[cat]}): ${count}`}
                            className="rounded-sm h-full"
                            style={{ width: `${w}%`, background: HFA_ERC_COLOR[cat] }}
                          />
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600 mt-4 italic">
        Esta tendência não estima probabilidade operacional. Descreve a composição qualitativa
        das análises por mês. Considere amostra, reporte, exposição e qualidade dos relatos.
      </p>
    </div>
  )
}

// ── Safety Issue Candidates Panel ────────────────────────────────────────────

const CONFIDENCE_LABEL: Record<'preliminary' | 'moderate', string> = {
  preliminary: 'Preliminar',
  moderate: 'Moderado',
}

const CONFIDENCE_COLOR: Record<'preliminary' | 'moderate', string> = {
  preliminary: '#F59E0B',
  moderate: '#3B82F6',
}

function SafetyIssueCandidatesPanel({ candidates }: { candidates: SafetyIssueCandidate[] }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="mb-4">
        <h3 className="text-white font-semibold">Candidatos a Safety Issue</h3>
        <p className="text-slate-500 text-xs mt-1">
          Padrões recorrentes observados nas análises. Não constituem Safety Issues formais sem revisão de contexto, exposição e barreiras.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="text-slate-500 text-sm">
          Ainda não há recorrência suficiente para sugerir candidatos a Safety Issue.
        </p>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => (
            <div key={c.id} className="bg-slate-800/60 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-mono text-blue-400 font-semibold text-sm">{c.label}</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-300">
                    {c.count}× ({Math.round(c.share * 100)}%)
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: CONFIDENCE_COLOR[c.confidence] + '22',
                      color: CONFIDENCE_COLOR[c.confidence],
                      border: `1px solid ${CONFIDENCE_COLOR[c.confidence]}44`,
                    }}
                  >
                    {CONFIDENCE_LABEL[c.confidence]}
                  </span>
                </div>
              </div>
              <p className="text-slate-400 text-xs">{c.rationale}</p>
              <p className="text-slate-600 text-xs italic">{c.caveat}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SOURCE_LABEL: Record<RiskProfileSourceEvent['source'], string> = {
  legacy_event: 'Evento',
  sera_vnext_analysis: 'SERA vNext',
}

const STATUS_LABEL: Record<RiskProfileSourceEvent['status'], { label: string; tone: string }> = {
  received: { label: 'Recebido', tone: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20' },
  processing: { label: 'Processando', tone: 'text-blue-300 bg-blue-500/10 border-blue-500/20' },
  completed: { label: 'Concluído', tone: 'text-green-300 bg-green-500/10 border-green-500/20' },
  error: { label: 'Erro', tone: 'text-red-300 bg-red-500/10 border-red-500/20' },
  draft: { label: 'Rascunho', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/20' },
  archived: { label: 'Arquivado', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/20' },
}

function sourceDate(source: RiskProfileSourceEvent): string {
  return new Date(source.occurredAt ?? source.createdAt).toLocaleDateString('pt-BR')
}

function sourceDetailHref(source: RiskProfileSourceEvent): string | null {
  if (source.source === 'legacy_event') return `/events/${source.id}`
  return null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RiskProfilePage() {
  const [data, setData] = useState<Intelligence | null>(null)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [matrixTab, setMatrixTab] = useState<'traditional' | 'arms'>('traditional')
  const [showGuide, setShowGuide] = useState(false)
  const [canManageProfile, setCanManageProfile] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) {
          setLoading(false)
          setCanManageProfile(false)
        }
        return
      }
      const t = session.access_token
      if (!cancelled) {
        setToken(t)
      }
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${t}` },
        })
        if (!cancelled) {
          if (meRes.ok) {
            const me = await meRes.json()
            setCanManageProfile(Boolean(me.is_admin) || String(me.role ?? '').toLowerCase() === 'admin')
          } else {
            setCanManageProfile(false)
          }
        }
      } catch (error) {
        console.error('Falha ao carregar /api/auth/me para permissões de UI', error)
        if (!cancelled) setCanManageProfile(false)
      }
      try {
        const res = await fetch('/api/risk-profile', {
          headers: { Authorization: `Bearer ${t}` },
        })
        if (res.ok) {
          const intel = await res.json()
          if (!cancelled && intel?.score) setData(intel)
        }
      } catch {
        // setData stays null → empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [reloadNonce])

  async function excludeSource(source: RiskProfileSourceEvent) {
    if (!token) return
    if (!window.confirm('Desconsiderar este evento do Perfil de Risco? Ele não será apagado e poderá ser restaurado depois.')) {
      return
    }
    const reason = window.prompt('Motivo opcional para desconsiderar este evento do perfil:', source.exclusionReason ?? '') ?? ''
    setActionBusyId(source.id)
    setActionError(null)
    try {
      const res = await fetch('/api/risk-profile/exclusions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sourceType: source.source,
          sourceId: source.id,
          reason: reason.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`)
      }
      setLoading(true)
      setReloadNonce((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionBusyId(null)
    }
  }

  async function restoreSource(source: RiskProfileSourceEvent) {
    if (!token || !source.exclusionId) return
    if (!window.confirm('Restaurar este evento no Perfil de Risco?')) {
      return
    }
    setActionBusyId(source.id)
    setActionError(null)
    try {
      const res = await fetch(`/api/risk-profile/exclusions/${source.exclusionId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${res.status}`)
      }
      setLoading(true)
      setReloadNonce((value) => value + 1)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Carregando perfil de risco...
      </div>
    )
  }

  const totalAnalyses = data?.total_analyses ?? 0
  const totalEvents = data?.total_events ?? 0
  const includedEvents = data?.included_events ?? 0
  const excludedEvents = data?.excluded_events ?? 0
  const errorAnalyses = data?.error_analyses ?? 0
  const hasAnalyses = totalAnalyses > 0
  const isForming = totalAnalyses > 0 && totalAnalyses < 10

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Perfil Organizacional</h1>
          <p className="text-slate-400 mt-1">
            Diagnóstico preliminar baseado em {includedEvents} evento{includedEvents !== 1 ? 's' : ''} considerado{includedEvents !== 1 ? 's' : ''} no perfil
          </p>
          {totalEvents > 0 && (
            <p className="text-slate-500 text-xs mt-1">
              Universo auditado: {totalEvents} registro{totalEvents !== 1 ? 's' : ''} canônico{totalEvents !== 1 ? 's' : ''} · {excludedEvents} desconsiderado{excludedEvents !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          className="bg-slate-800 hover:bg-slate-700 disabled:hover:bg-slate-800 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm rounded-lg px-4 py-2 transition-colors"
          onClick={() => alert('Exportação PDF em desenvolvimento')}
          disabled={!hasAnalyses}
        >
          Exportar Relatório PDF
        </button>
      </div>

      {/* Zero-state: nenhuma análise ainda */}
      {!hasAnalyses && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <div className="max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-2">Seu panorama descritivo está em formação</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Após algumas análises, o sistema começa a revelar padrões de fatores humanos, precondições recorrentes e distribuição por matriz da sua organização.
            </p>
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                <div>
                  <p className="text-white text-sm font-medium">Descreva um evento real</p>
                  <p className="text-slate-500 text-xs mt-0.5">Relate um ocorrido com detalhes de contexto, erro e consequência</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-slate-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                <div>
                  <p className="text-slate-300 text-sm font-medium">A IA gera hipóteses estruturadas</p>
                  <p className="text-slate-500 text-xs mt-0.5">Percepção, Objetivo e Ação — não final até revisão humana</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-700 text-slate-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                <div>
                  <p className="text-slate-300 text-sm font-medium">Padrões organizacionais emergem</p>
                  <p className="text-slate-500 text-xs mt-0.5">Com 10 análises, o perfil mostra confiança da base, candidatos a Safety Issue, tendência qualitativa e matrizes de apoio à triagem</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/events/new"
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Criar primeira análise
              </Link>
              <p className="text-slate-500 text-xs">10 análises gratuitas por empresa</p>
            </div>
          </div>
        </div>
      )}

      {/* Banner "em formação" para 1–9 análises */}
      {isForming && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-blue-300 font-medium text-sm mb-1">Perfil organizacional em formação</p>
              <p className="text-slate-400 text-xs leading-relaxed">
                Continue registrando eventos — o padrão organizacional fica mais claro a cada análise. Os dados abaixo são preliminares.
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>{totalAnalyses} de 10 análises para panorama descritivo</span>
                  <span>{totalAnalyses * 10}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: `${totalAnalyses * 10}%` }} />
                </div>
              </div>
            </div>
            <Link
              href="/events/new"
              className="shrink-0 text-xs font-medium text-blue-400 hover:text-blue-300 border border-blue-800 hover:border-blue-600 px-3 py-2 rounded-lg transition-colors"
            >
              + Nova análise
            </Link>
          </div>
        </div>
      )}

      {/* Como ler este perfil */}
      {hasAnalyses && (
        <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl px-5 py-4">
          <p className="text-blue-300 text-xs font-semibold mb-1">Como ler este perfil</p>
          <p className="text-slate-400 text-xs leading-relaxed">
            O perfil organiza as análises em três leituras:{' '}
            <strong className="text-slate-300">confiança da base</strong>,{' '}
            <strong className="text-slate-300">padrões recorrentes</strong> e{' '}
            <strong className="text-slate-300">tendência qualitativa</strong>.
            As matrizes funcionam como apoio à triagem — não como conclusão isolada.
          </p>
        </div>
      )}

      {actionError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      {hasAnalyses && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Eventos no universo', value: totalEvents, tone: 'text-white' },
            { label: 'Considerados', value: includedEvents, tone: 'text-green-300' },
            { label: 'Desconsiderados', value: excludedEvents, tone: 'text-amber-300' },
            { label: 'Erros fora do cálculo', value: errorAnalyses, tone: 'text-red-300' },
          ].map((item) => (
            <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">{item.label}</p>
              <p className={`text-3xl font-semibold ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Confiança dos dados */}
      {hasAnalyses && (
        <DataConfidencePanel confidence={data?.data_confidence} />
      )}

      {/* Índice de Cobertura Analítica */}
      {data?.score && hasAnalyses && (
        <OrgScoreCard
          score={data.score.value}
          level={data.score.level}
          label={data.score.label}
          actions={data.actions}
        />
      )}

      {/* Candidatos a Safety Issue */}
      {hasAnalyses && (
        <SafetyIssueCandidatesPanel
          candidates={data?.safety_issue_candidates ?? []}
        />
      )}

      {/* Tendência qualitativa observada */}
      {hasAnalyses && (
        <QualityTrendPanel points={data?.quality_trend ?? []} />
      )}

      {/* Matrizes de apoio à triagem */}
      {data && hasAnalyses && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Esquerda: Matriz */}
          <div className="lg:col-span-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-white font-semibold">Matrizes de apoio à triagem</h3>
                <div className="flex rounded-lg overflow-hidden border border-slate-700 text-sm">
                  <button
                    onClick={() => setMatrixTab('traditional')}
                    className={`px-4 py-1.5 transition-colors ${matrixTab === 'traditional' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    ISO 31000 / ICAO
                  </button>
                  <button
                    onClick={() => setMatrixTab('arms')}
                    className={`px-4 py-1.5 transition-colors ${matrixTab === 'arms' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                  >
                    ARMS-ERC
                  </button>
                </div>
              </div>

              {matrixTab === 'traditional' ? (
                <p className="text-slate-500 text-xs">
                  Matriz 5×5 baseada em Probabilidade × Severidade — ISO 31000:2018 e ICAO Doc 9859
                </p>
              ) : (
                <p className="text-slate-500 text-xs">
                  Matriz 4×4 baseada em Severidade do resultado × Efetividade das barreiras — Aviation Risk Management Solutions (EASA, 2010)
                </p>
              )}

              {isForming && (
                <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2">
                  <span className="text-blue-400 text-xs shrink-0 mt-0.5">⚠</span>
                  <p className="text-xs text-blue-300 leading-relaxed">
                    Dados preliminares — com menos de 10 análises, as matrizes indicam sinais iniciais, não perfil consolidado.
                  </p>
                </div>
              )}

              {matrixTab === 'traditional' ? (
                <TraditionalMatrix data={data} />
              ) : (
                <ARMSMatrix data={data} />
              )}

              <div className="border-t border-slate-800 pt-4">
                <button
                  onClick={() => setShowGuide((v) => !v)}
                  className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  <span className={`transition-transform ${showGuide ? 'rotate-90' : ''}`}>▶</span>
                  Qual matriz usar para cada situação?
                </button>
                {showGuide && (
                  <div className="mt-4 grid sm:grid-cols-2 gap-4 text-xs text-slate-400 leading-relaxed">
                    <div className="bg-slate-800/60 rounded-lg p-4 space-y-2">
                      <p className="text-white font-semibold text-sm mb-1">Use a Matriz Tradicional (ISO 31000) quando:</p>
                      <p>• Precisa de comparabilidade com outras organizações</p>
                      <p>• Está fazendo relatório para gestão ou auditoria</p>
                      <p>• Tem dados históricos suficientes para estimar probabilidade</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-lg p-4 space-y-2">
                      <p className="text-white font-semibold text-sm mb-1">Use a Matriz ARMS-ERC quando:</p>
                      <p>• Quer avaliar o risco real de um evento específico</p>
                      <p>• Está triando eventos para priorizar investigações</p>
                      <p>• Opera sob regulação europeia (EU 376/2014)</p>
                      <p>• Prefere uma abordagem baseada em barreiras de segurança</p>
                    </div>
                    <div className="sm:col-span-2 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <p className="text-blue-300 text-xs">
                        Na prática, organizações maduras usam as duas: a tradicional para comunicação executiva e
                        a ARMS-ERC para gestão operacional de riscos.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Direita: Raciocínio SERA + Top 5 Precondições */}
          <div className="lg:col-span-2 space-y-4">
            <SeraReasoningPanel data={data} matrixTab={matrixTab} />
            {data.top_preconditions.length > 0 && (
              <TopPreconditionsPanel preconditions={data.top_preconditions.slice(0, 5)} />
            )}
          </div>
        </div>
      )}

      {/* 4. Combinações de falha */}
      {hasAnalyses && (data?.top_combinations ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Combinações de Falha Mais Frequentes</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 text-left">
                <th className="pb-2 font-medium pr-4">Combinação</th>
                <th className="pb-2 font-medium pr-4">Ocorrências</th>
                <th className="pb-2 font-medium pr-4">%</th>
                <th className="pb-2 font-medium">Significado operacional</th>
              </tr>
            </thead>
            <tbody>
              {data!.top_combinations.map((c) => (
                <tr key={c.pair} className="border-b border-slate-800/50 last:border-0">
                  <td className="py-3 pr-4 font-mono text-blue-400 whitespace-nowrap">{c.pair}</td>
                  <td className="py-3 pr-4 text-white font-semibold">{c.count}</td>
                  <td className="py-3 pr-4 text-slate-400">{c.pct}%</td>
                  <td className="py-3 text-slate-400 text-xs">{combinationDescription(c.pair)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Ranking completo de precondições */}
      {hasAnalyses && (data?.top_preconditions ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Ranking de Precondições</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800 text-left">
                <th className="pb-2 font-medium pr-4">Rank</th>
                <th className="pb-2 font-medium pr-4">Código</th>
                <th className="pb-2 font-medium pr-4">Nome</th>
                <th className="pb-2 font-medium pr-4">Freq.</th>
                <th className="pb-2 font-medium pr-4">%</th>
                <th className="pb-2 font-medium w-32">Visual</th>
              </tr>
            </thead>
            <tbody>
              {data!.top_preconditions.map((p, i) => (
                <tr key={p.code} className="border-b border-slate-800/50 last:border-0">
                  <td className="py-3 pr-4 text-slate-500">#{i + 1}</td>
                  <td className="py-3 pr-4 font-mono text-yellow-400 font-bold">{p.code}</td>
                  <td className="py-3 pr-4 text-slate-300">{p.name}</td>
                  <td className="py-3 pr-4 text-white font-semibold">{p.count}</td>
                  <td className="py-3 pr-4 text-slate-400">{p.pct}%</td>
                  <td className="py-3">
                    <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${p.pct}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasAnalyses && (data?.limitations ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Limitações e exclusões do consolidado</h3>
          <div className="space-y-2">
            {data!.limitations.map((item) => (
              <p key={item} className="text-sm text-slate-400 leading-relaxed">
                {item}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Análise por IA */}
      {data?.score && token && hasAnalyses && (
        <AiInsightPanel intelligenceData={data} token={token} />
      )}

      {/* Volume de análises por mês */}
      {hasAnalyses && (data?.trend ?? []).length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-1">Volume de análises por mês</h3>
          <p className="text-slate-500 text-xs mb-4">Frequência de registros — separada da qualidade/severidade observada.</p>
          <TrendLine trend={data!.trend} />
        </div>
      )}

      {hasAnalyses && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-semibold">Eventos considerados no perfil</h3>
                <p className="text-slate-500 text-xs mt-1">Somente registros concluídos e ativos entram no cálculo.</p>
              </div>
              <span className="text-xs text-slate-400">{includedEvents}</span>
            </div>
            <div className="space-y-3">
              {(data?.source_events_included ?? []).map((source) => {
                const detailHref = sourceDetailHref(source)
                const status = STATUS_LABEL[source.status]
                const title = detailHref ? (
                  <Link href={detailHref} className="text-white font-medium hover:text-blue-300 transition-colors">
                    {source.title}
                  </Link>
                ) : (
                  <span className="text-white font-medium">{source.title}</span>
                )
                return (
                  <div key={`${source.source}:${source.id}`} className="border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {title}
                        <p className="text-slate-500 text-xs mt-1">
                          {SOURCE_LABEL[source.source]} · {sourceDate(source)}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 shrink-0">
                        <span className={`text-xs border rounded-full px-2 py-1 ${status.tone}`}>{status.label}</span>
                        {source.erc?.code && (
                          <span className="text-xs border border-slate-700 text-slate-200 rounded-full px-2 py-1">
                            {source.erc.code} · {source.erc.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {source.perceptionCode && <span className="bg-slate-800 text-slate-200 rounded-full px-2 py-1">{source.perceptionCode}</span>}
                      {source.objectiveCode && <span className="bg-slate-800 text-slate-200 rounded-full px-2 py-1">{source.objectiveCode}</span>}
                      {source.actionCode && <span className="bg-slate-800 text-slate-200 rounded-full px-2 py-1">{source.actionCode}</span>}
                    </div>
                    {(source.preconditions ?? []).length > 0 && (
                      <p className="text-slate-400 text-xs">
                        Preconditions: {(source.preconditions ?? []).slice(0, 3).join(', ')}
                      </p>
                    )}
                    {canManageProfile && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void excludeSource(source)}
                          disabled={actionBusyId === source.id}
                          className="text-xs border border-amber-500/30 bg-amber-500/10 text-amber-200 rounded-lg px-3 py-2 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                        >
                          {actionBusyId === source.id ? 'Atualizando...' : 'Desconsiderar do perfil'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {(data?.source_events_included ?? []).length === 0 && (
                <p className="text-slate-500 text-sm">Nenhum evento concluído está entrando no consolidado neste momento.</p>
              )}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-white font-semibold">Eventos desconsiderados</h3>
                <p className="text-slate-500 text-xs mt-1">Registros fora do cálculo, preservados para restauração posterior.</p>
              </div>
              <span className="text-xs text-slate-400">{excludedEvents}</span>
            </div>
            <div className="space-y-3">
              {(data?.source_events_excluded ?? []).map((source) => {
                const detailHref = sourceDetailHref(source)
                const title = detailHref ? (
                  <Link href={detailHref} className="text-white font-medium hover:text-blue-300 transition-colors">
                    {source.title}
                  </Link>
                ) : (
                  <span className="text-white font-medium">{source.title}</span>
                )
                return (
                  <div key={`${source.source}:${source.id}`} className="border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {title}
                        <p className="text-slate-500 text-xs mt-1">
                          {SOURCE_LABEL[source.source]} · {sourceDate(source)}
                        </p>
                      </div>
                      <span className="text-xs border border-amber-500/30 text-amber-200 bg-amber-500/10 rounded-full px-2 py-1 shrink-0">
                        Excluído
                      </span>
                    </div>
                    {source.exclusionReason && (
                      <p className="text-slate-400 text-xs">Motivo: {source.exclusionReason}</p>
                    )}
                    {canManageProfile && source.exclusionId && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void restoreSource(source)}
                          disabled={actionBusyId === source.id}
                          className="text-xs border border-green-500/30 bg-green-500/10 text-green-200 rounded-lg px-3 py-2 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
                        >
                          {actionBusyId === source.id ? 'Atualizando...' : 'Restaurar no perfil'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {(data?.source_events_excluded ?? []).length === 0 && (
                <p className="text-slate-500 text-sm">Nenhum evento foi desconsiderado do Perfil de Risco.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
