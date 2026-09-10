/**
 * ⚠ DEPRECATED / NÃO USAR SEM PASSAR PELA CONTENÇÃO ERC (auditoria HFA, 3ª etapa) ⚠
 * Esta função não está atualmente ligada a nenhuma tela ou rota. Deriva de
 * `analyses.erc_level` (mecanismo MOTOR_HEURISTIC_V1), incompatível com o mecanismo
 * ARMS_CODE_MATRIX_V1 usado hoje pelo perfil de risco. Ver
 * frontend/src/lib/risk-profile/erc-containment.ts e
 * docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md antes de reintroduzir.
 *
 * Modal ERC category calculation — RISK v0.8-B
 *
 * Computes the modal (most frequent) HFA ERC category from a list of raw
 * motor ERC level values (as stored in analyses.erc_level).
 *
 * Tie-breaker: when two or more categories share the highest frequency,
 * the highest (most critical) HFA category wins.
 *
 * Reference: docs/RISK_ERC_MODAL_v0.8-B.md
 */

import { coerceMotorErcToHfaCategory, type HfaErcCategory } from '@/lib/sera/erc-conversion'

export function calculateModalHfaErcCategory(values: unknown[]): HfaErcCategory | null {
  const counts = new Map<HfaErcCategory, number>()

  for (const value of values) {
    const category = coerceMotorErcToHfaCategory(value)
    if (category === null) continue
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  let modal: HfaErcCategory | null = null
  let modalCount = 0

  for (const [category, count] of counts.entries()) {
    if (modal === null || count > modalCount || (count === modalCount && category > modal)) {
      modal = category
      modalCount = count
    }
  }

  return modal
}
