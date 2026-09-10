// frontend/src/lib/sera/risk-quality-trend.ts
//
// ⚠ DEPRECATED / NÃO USAR SEM PASSAR PELA CONTENÇÃO ERC (auditoria HFA, 3ª etapa) ⚠
// Esta função não está atualmente ligada a nenhuma tela ou rota (auditoria HFA,
// docs/auditoria-hfa/segunda-etapa/05-auditoria-erc.md, mecanismo MOTOR_HEURISTIC_V1).
// Ela deriva a categoria HFA ERC a partir de `analyses.erc_level` (escala motor,
// 1=crítico), que é INCOMPATÍVEL com o mecanismo ARMS_CODE_MATRIX_V1
// (frontend/src/lib/risk-profile/erc.ts, escala 5=crítico) usado hoje pelo card e
// pela tendência de risco em `lib/risk-profile/server.ts`.
// Reintroduzir esta função em qualquer tela SEM passar por
// `@/lib/risk-profile/erc-containment.ts` (describeErcValue) reproduz o achado F-04
// (dois números incompatíveis apresentados como o mesmo indicador). Ver decisão D3
// pendente antes de qualquer novo uso: docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md.
//
// Pure helper — no Supabase, no React, no browser APIs.
// Builds a qualitative risk trend from SERA analyses by grouping
// HFA ERC Categories per calendar month.
//
// This describes observed distribution — NOT future probability,
// operational rate, or adjusted risk level.
// Volume change ≠ risk change; always consider reporting culture,
// exposure, and analytical completeness.
//
// RISK v0.9-D

import { coerceMotorErcToHfaCategory } from './erc-conversion'
import type { HfaErcCategory } from './erc-conversion'

export type RiskQualityTrendInput = {
  created_at: string | null | undefined
  erc_level: unknown
}

export type RiskQualityTrendPoint = {
  month: string
  total: number
  hfa_erc: {
    c1: number
    c2: number
    c3: number
    c4: number
    c5: number
  }
  dominant_hfa_erc_category: HfaErcCategory | null
  critical_or_high_count: number
  critical_or_high_share: number
}

function extractMonth(created_at: string | null | undefined): string | null {
  if (!created_at || typeof created_at !== 'string') return null
  const m = created_at.match(/^(\d{4}-\d{2})/)
  return m ? m[1] : null
}

function dominantCategory(counts: Record<HfaErcCategory, number>): HfaErcCategory | null {
  const total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5]
  if (total === 0) return null

  const maxCount = Math.max(counts[1], counts[2], counts[3], counts[4], counts[5])
  // Among tied categories pick the highest (most critical) — conservative tie-breaker.
  const categories: HfaErcCategory[] = [5, 4, 3, 2, 1]
  for (const c of categories) {
    if (counts[c] === maxCount) return c
  }
  return null
}

export function buildRiskQualityTrend(
  analyses: RiskQualityTrendInput[],
): RiskQualityTrendPoint[] {
  const monthMap = new Map<string, Record<HfaErcCategory, number>>()

  for (const a of analyses) {
    const month = extractMonth(a.created_at)
    if (!month) continue

    const hfa = coerceMotorErcToHfaCategory(a.erc_level)
    if (hfa === null) continue

    if (!monthMap.has(month)) {
      monthMap.set(month, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
    }
    monthMap.get(month)![hfa]++
  }

  const result: RiskQualityTrendPoint[] = []

  for (const [month, counts] of monthMap) {
    const c4c5 = counts[4] + counts[5]
    const total = counts[1] + counts[2] + counts[3] + counts[4] + counts[5]
    result.push({
      month,
      total,
      hfa_erc: {
        c1: counts[1],
        c2: counts[2],
        c3: counts[3],
        c4: counts[4],
        c5: counts[5],
      },
      dominant_hfa_erc_category: dominantCategory(counts),
      critical_or_high_count: c4c5,
      critical_or_high_share: total > 0 ? c4c5 / total : 0,
    })
  }

  result.sort((a, b) => a.month.localeCompare(b.month))
  return result
}
