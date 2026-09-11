/**
 * ERC containment layer — RISK v0.9-F + author decision D3-b (2026-09-11)
 *
 * D3-b (author-approved):
 * - no new canonical numeric ERC for SERA vNext until a validated/versioned mechanism exists;
 * - legacy/historical ERC preserved with provenance (not reinterpreted as vNext ERC);
 * - UNRESOLVED never yields ERC;
 * - mixed legacy+vNext profiles do not present consolidated numeric ERC;
 * - deliberate vNext ERC absence must not alone reduce data-confidence.
 *
 * This layer does NOT invent a new ERC formula.
 */

import { computeHfaErcCategoryFromCodes, describeHfaErcCategory } from './erc'
import { coerceMotorErcToHfaCategory, type HfaErcCategory } from '@/lib/sera/erc-conversion'

export type ErcScaleDirection = '1_IS_CRITICAL' | '5_IS_CRITICAL'

export type ErcMechanismId = 'MOTOR_HEURISTIC_V1' | 'ARMS_CODE_MATRIX_V1'

export type ErcMechanismDescriptor = {
  id: ErcMechanismId
  version: string
  shortLabel: string
  description: string
  scaleDirection: ErcScaleDirection
  sourceStatus: 'HEURISTIC_NOT_VALIDATED'
  inputs: string
}

/** Author decision id — D3-b approved 2026-09-11. */
export const D3_DECISION_ID = 'D3_B' as const

export type ErcPresentationMode =
  | 'LEGACY_ARMS_MODAL'
  | 'SUPPRESSED_D3B_MIXED'
  | 'SUPPRESSED_D3B_VNEXT_ONLY'
  | 'NO_LEGACY_ERC'

/**
 * Registro fechado dos mecanismos ERC atualmente vivos no sistema.
 * Nenhum é ERC canônico do vNext sob D3-b.
 */
export const ERC_MECHANISMS: Record<ErcMechanismId, ErcMechanismDescriptor> = {
  MOTOR_HEURISTIC_V1: {
    id: 'MOTOR_HEURISTIC_V1',
    version: 'v0.1',
    shortLabel: 'Estimativa heurística do motor',
    description:
      'Valor produzido pelo LLM e por heurísticas de palavra-chave do motor legado ' +
      '(analyses.erc_level). Escala 1=crítico … 5=mínimo. Não validado cientificamente. ' +
      'Proveniência legada — não é ERC canônico do vNext (D3-b).',
    scaleDirection: '1_IS_CRITICAL',
    sourceStatus: 'HEURISTIC_NOT_VALIDATED',
    inputs: 'narrativa (texto) + códigos P/O/A',
  },
  ARMS_CODE_MATRIX_V1: {
    id: 'ARMS_CODE_MATRIX_V1',
    version: 'v0.1',
    shortLabel: 'Matriz ARMS a partir dos códigos',
    description:
      'Valor recomputado a partir de uma matriz de severidade×barreira inspirada no ARMS, ' +
      'aplicada apenas aos códigos P/O/A legados (risk-profile/erc.ts). Escala 5=crítico … 1=aceitável. ' +
      'Não é ERC canônico do vNext (D3-b).',
    scaleDirection: '5_IS_CRITICAL',
    sourceStatus: 'HEURISTIC_NOT_VALIDATED',
    inputs: 'apenas códigos P/O/A',
  },
}

export type DescribedErcValue = {
  mechanismId: ErcMechanismId
  mechanismVersion: string
  scaleDirection: ErcScaleDirection
  category: HfaErcCategory | null
  rawValue: unknown
  label: string
  caveat: string
}

const SHARED_CAVEAT =
  'Estimativa heurística não validada cientificamente. Não representa probabilidade ' +
  'operacional nem conclusão de risco isolada. Decisão autoral D3-b: sem ERC numérico ' +
  'canônico para o SERA vNext até mecanismo validado/versionado.'

/**
 * Descreve um valor ERC bruto identificando explicitamente seu mecanismo de origem.
 * Nunca retorna um valor "consolidado" — cada chamada corresponde a um único mecanismo.
 */
export function describeErcValue(
  mechanismId: 'MOTOR_HEURISTIC_V1',
  rawMotorErcLevel: unknown
): DescribedErcValue
export function describeErcValue(
  mechanismId: 'ARMS_CODE_MATRIX_V1',
  codes: { p: string | null | undefined; o: string | null | undefined; a: string | null | undefined }
): DescribedErcValue
export function describeErcValue(
  mechanismId: ErcMechanismId,
  input: unknown
): DescribedErcValue {
  const mechanism = ERC_MECHANISMS[mechanismId]

  let category: HfaErcCategory | null
  if (mechanismId === 'MOTOR_HEURISTIC_V1') {
    category = coerceMotorErcToHfaCategory(input)
  } else {
    const codes = input as { p: string | null | undefined; o: string | null | undefined; a: string | null | undefined }
    category = computeHfaErcCategoryFromCodes(codes.p, codes.o, codes.a)
  }

  const described = describeHfaErcCategory(category)
  const label = category != null
    ? `${mechanism.shortLabel} (${mechanism.id} ${mechanism.version}): ${described.label ?? described.code ?? category}`
    : `${mechanism.shortLabel} (${mechanism.id} ${mechanism.version}): não disponível`

  return {
    mechanismId,
    mechanismVersion: mechanism.version,
    scaleDirection: mechanism.scaleDirection,
    category,
    rawValue: input,
    label,
    caveat: SHARED_CAVEAT,
  }
}

/** D3-b: no vNext numeric ERC escape via consolidated product view. */
export function isVNextNumericErcAllowed(): boolean {
  return false
}

export function resolveErcPresentationMode(args: {
  legacyCount: number
  vnextCount: number
  legacyErcPresent: boolean
}): ErcPresentationMode {
  const { legacyCount, vnextCount, legacyErcPresent } = args
  if (legacyCount > 0 && vnextCount > 0) return 'SUPPRESSED_D3B_MIXED'
  if (legacyCount === 0 && vnextCount > 0) return 'SUPPRESSED_D3B_VNEXT_ONLY'
  if (legacyCount > 0 && legacyErcPresent) return 'LEGACY_ARMS_MODAL'
  return 'NO_LEGACY_ERC'
}

export function shouldSuppressConsolidatedNumericErc(mode: ErcPresentationMode): boolean {
  return mode === 'SUPPRESSED_D3B_MIXED' || mode === 'SUPPRESSED_D3B_VNEXT_ONLY'
}

/**
 * Consolidated single-card ERC remains disabled by default.
 * Enabling still requires explicit env — D3-b does not authorize a new formula.
 */
export function isErcConsolidatedViewEnabled(): boolean {
  return process.env.SERA_ERC_CONSOLIDATED_VIEW_ENABLED?.trim().toLowerCase() === 'true'
}

export function buildErcContainmentNotice(): string {
  return (
    'Decisão autoral D3-b: sem ERC numérico canônico no SERA vNext até mecanismo validado/versionado. ' +
    'Valores legados (motor / ARMS×código) preservam proveniência e não devem ser somados, ' +
    'comparados diretamente ou tratados como indicador consolidado com vNext. ' +
    'UNRESOLVED não gera ERC. Perfis mistos não apresentam ERC numérico consolidado.'
  )
}

export function assertNoSilentErcConsolidation(values: DescribedErcValue[]): void {
  const mechanisms = new Set(values.map((v) => v.mechanismId))
  if (mechanisms.size > 1 && !isErcConsolidatedViewEnabled()) {
    throw new Error(
      'assertNoSilentErcConsolidation: tentativa de tratar múltiplos mecanismos ERC ' +
      `(${[...mechanisms].join(', ')}) como indicador único sem SERA_ERC_CONSOLIDATED_VIEW_ENABLED=true.`
    )
  }
}
