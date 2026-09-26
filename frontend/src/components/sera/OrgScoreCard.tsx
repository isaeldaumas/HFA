'use client'

interface OrgScoreCardProps {
  score: number
  level: 'critical' | 'warning' | 'ok'
  label: string
  actions: {
    total: number
    open_total: number
    open_overdue: number
    open_no_owner: number
    resolution_rate: number
  }
}

const COLORS = {
  critical: '#EF4444',
  warning: '#F59E0B',
  ok: '#22C55E',
}

const ATTENTION_LABEL: Record<'critical' | 'warning' | 'ok', string> = {
  critical: 'Atenção alta',
  warning: 'Atenção moderada',
  ok: 'Baixa atenção',
}

export function OrgScoreCard({ score, level, actions }: OrgScoreCardProps) {
  const color = COLORS[level]
  const attentionLabel = ATTENTION_LABEL[level]
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-4
      flex items-center gap-8">

      {/* Índice número */}
      <div className="flex-shrink-0 flex flex-col gap-0.5">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
          Índice HFA de Atenção Operacional
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold tabular-nums"
            style={{ color, lineHeight: 1 }}>
            {score}
          </span>
          <span className="text-sm font-semibold" style={{ color }}>
            {attentionLabel}
          </span>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="flex-1 min-w-0">
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full"
            style={{ width: `${score}%`, background: color,
              transition: 'width 0.6s ease' }} />
        </div>
        <p className="text-xs text-slate-600 mt-1.5">
          {actions.total > 0
            ? 'Combina a proporção ponderada de eixos P/O/A com falha ativa, pendências de ações corretivas e, quando há histórico suficiente, aumento recente do volume de eventos. É um indicador de priorização, não uma probabilidade de acidente nem ERC/ARMS canônico.'
            : 'O índice considera os padrões P/O/A dos eventos elegíveis. Nenhuma ação corretiva está vinculada aos eventos atualmente considerados, portanto não existe penalidade por ações pendentes neste momento. É um indicador de priorização, não uma probabilidade de acidente nem ERC/ARMS canônico.'}
        </p>
      </div>

      {/* 3 métricas */}
      <div className="flex gap-5 flex-shrink-0 pl-6
        border-l border-slate-800">
        {[
          { value: actions.open_total, label: 'Ações abertas' },
          { value: actions.open_overdue, label: 'Ações vencidas' },
          { value: actions.open_no_owner, label: 'Sem responsável' },
          { value: actions.total > 0 ? `${actions.resolution_rate}%` : '—', label: 'Taxa resolução' },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-2xl font-bold text-white tabular-nums">
              {m.value}
            </p>
            <p className="text-xs text-slate-500 whitespace-nowrap">
              {m.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
