export type AttentionIndexSource = {
  perceptionCode?: string | null
  objectiveCode?: string | null
  actionCode?: string | null
}

export type AttentionIndexActions = {
  openOverdue: number
  openNoOwner: number
  openTotal: number
  totalActions: number
}

function noFailureCode(axis: 'P' | 'O' | 'A'): string {
  return axis === 'P' ? 'P-A' : axis === 'O' ? 'O-A' : 'A-A'
}

export function computeRiskAttentionIndex(
  sources: AttentionIndexSource[],
  actions: AttentionIndexActions,
): { base: number; actionPenalty: number; score: number } {
  let failureWeight = 0
  let availableWeight = 0
  for (const source of sources) {
    const axes = [
      ['P', source.perceptionCode, 1.0],
      ['O', source.objectiveCode, 0.8],
      ['A', source.actionCode, 0.6],
    ] as const
    for (const [axis, code, weight] of axes) {
      if (!code) continue
      availableWeight += weight
      if (code !== noFailureCode(axis)) failureWeight += weight
    }
  }

  const base = availableWeight > 0 ? (failureWeight / availableWeight) * 100 : 0
  let actionPenalty = 0
  if (actions.openOverdue > 0) actionPenalty += Math.min(20, 10 + (actions.openOverdue - 1) * 2)
  if (actions.openNoOwner > 0) actionPenalty += Math.min(10, actions.openNoOwner * 2)
  if (actions.totalActions > 0 && actions.openTotal > 0) {
    actionPenalty += Math.min(10, Math.round((actions.openTotal / actions.totalActions) * 10))
  }

  return {
    base,
    actionPenalty,
    score: Math.min(Math.round(base + actionPenalty), 100),
  }
}
