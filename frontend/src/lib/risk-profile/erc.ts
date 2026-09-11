/**
 * ⚠ MECANISMO ERC EM MANUTENÇÃO RESTRITA (D3-b aprovado 2026-09-11) ⚠
 * ARMS_CODE_MATRIX_V1 permanece CONGELADA: não é ERC canônico do vNext.
 * UNRESOLVED nunca gera ERC. Qualquer exibição deve passar por describeErcValue.
 * Não alterar valores/fórmula sem nova decisão autoral pós-D3-b.
 */
import type { HfaErcCategory } from '@/lib/sera/erc-conversion'

const ARMS_SEVERITY_ROW: Record<string, 'A' | 'B' | 'C' | 'D'> = {
  'P-B': 'B',
  'P-F': 'B',
  'P-A': 'D',
}

const ARMS_ERC: Record<string, HfaErcCategory> = {
  A1: 5, A2: 5, A3: 4, A4: 3,
  B1: 4, B2: 4, B3: 3, B4: 2,
  C1: 3, C2: 3, C3: 2, C4: 1,
  D1: 2, D2: 2, D3: 1, D4: 1,
}

function barrierLevel(
  perceptionCode: string | null | undefined,
  objectiveCode: string | null | undefined,
  actionCode: string | null | undefined,
): 1 | 2 | 3 | 4 {
  const fails = [
    perceptionCode && perceptionCode !== 'P-A',
    objectiveCode && objectiveCode !== 'O-A',
    actionCode && actionCode !== 'A-A',
  ].filter(Boolean).length

  if (fails >= 3) return 1
  if (fails === 2) return 2
  if (fails === 1) return 3
  return 4
}

/**
 * Identificador único desta matriz ARMS×código (ver erc-containment.ts / ERC_MECHANISMS).
 * Congelado nesta versão — não alterar sem decisão D3 (docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md).
 */
export const ARMS_CODE_MATRIX_MECHANISM_ID = 'ARMS_CODE_MATRIX_V1' as const
export const ARMS_CODE_MATRIX_VERSION = 'v0.1' as const

/**
 * Expostos para reuso por telas que precisam do detalhe severidade/barreira (ex.: events/[id]).
 * Antes da 3ª etapa da auditoria, este cálculo estava duplicado em events/[id]/page.tsx com
 * uma cópia hardcoded independente da matriz — corrigido para importar daqui (fonte única).
 */
export function getArmsSeverityRow(perceptionCode: string | null | undefined): 'A' | 'B' | 'C' | 'D' {
  if (!perceptionCode) return 'C'
  return ARMS_SEVERITY_ROW[perceptionCode] ?? 'C'
}

export function getArmsBarrierLevel(
  perceptionCode: string | null | undefined,
  objectiveCode: string | null | undefined,
  actionCode: string | null | undefined,
): 1 | 2 | 3 | 4 {
  return barrierLevel(perceptionCode, objectiveCode, actionCode)
}

function isUnresolvedCode(code: string | null | undefined): boolean {
  return typeof code === 'string' && /^unresolved$/i.test(code.trim())
}

/**
 * ARMS×código heurístico legado. D3-b: UNRESOLVED never yields ERC.
 * Not a canonical vNext ERC mechanism — callers must not present this as vNext ERC.
 */
export function computeHfaErcCategoryFromCodes(
  perceptionCode: string | null | undefined,
  objectiveCode: string | null | undefined,
  actionCode: string | null | undefined,
): HfaErcCategory | null {
  if (
    isUnresolvedCode(perceptionCode) ||
    isUnresolvedCode(objectiveCode) ||
    isUnresolvedCode(actionCode)
  ) {
    return null
  }
  if (!perceptionCode) return null
  const severity = ARMS_SEVERITY_ROW[perceptionCode] ?? 'C'
  const barrier = barrierLevel(perceptionCode, objectiveCode, actionCode)
  return ARMS_ERC[`${severity}${barrier}`] ?? null
}

export function describeHfaErcCategory(category: HfaErcCategory | null): {
  code: string | null
  label: string | null
  severity: string | null
} {
  switch (category) {
    case 5:
      return { code: 'ERC 5', label: 'Imediato', severity: 'critical' }
    case 4:
      return { code: 'ERC 4', label: 'Urgente', severity: 'high' }
    case 3:
      return { code: 'ERC 3', label: 'Ação requerida', severity: 'moderate' }
    case 2:
      return { code: 'ERC 2', label: 'Monitorar', severity: 'low' }
    case 1:
      return { code: 'ERC 1', label: 'Aceitável', severity: 'minimal' }
    default:
      return { code: null, label: null, severity: null }
  }
}
