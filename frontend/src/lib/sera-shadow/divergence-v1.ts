/**
 * SERA_SHADOW_DIVERGENCE_V1 — mechanical legacy×vNext comparison contract.
 *
 * Scope (locked):
 * - Literal P/O/A code equality only (no semantic equivalence).
 * - UNRESOLVED / absent / non-CLASSIFIED axes are OUT of the agreement denominator.
 * - ERC is EXPLICITLY EXCLUDED from this contract.
 * - exactTripletMatch requires all three axes CLASSIFIED and literally equal.
 *
 * This module is preparatory for issue #13. It does NOT enable Shadow Mode.
 */

export const SERA_SHADOW_DIVERGENCE_CONTRACT_ID = 'SERA_SHADOW_DIVERGENCE_V1' as const

export type ShadowPoaAxis = 'perception' | 'objective' | 'action'

export type ShadowAxisCodePair = {
  axis: ShadowPoaAxis
  legacyCode: string | null
  vnextCode: string | null
  /** Engine/status label for vNext axis; CLASSIFIED is the only includable status. */
  vnextStatus: string | null
}

export type ShadowAxisComparison = {
  axis: ShadowPoaAxis
  legacyCode: string | null
  vnextCode: string | null
  vnextStatus: string | null
  /** True only when both sides are CLASSIFIED and codes differ (literal). */
  diverges: boolean
  /** True when both sides are CLASSIFIED and codes are literally equal. */
  agrees: boolean
  /** True when this axis is excluded from the agreement denominator. */
  excludedFromDenominator: boolean
  exclusionReason: string | null
}

export type ShadowDivergenceV1Result = {
  contractId: typeof SERA_SHADOW_DIVERGENCE_CONTRACT_ID
  axes: ShadowAxisComparison[]
  exactTripletMatch: boolean
  comparableAxisCount: number
  agreeingAxisCount: number
  divergingAxisCount: number
  excludedAxisCount: number
  /** Agreement rate over comparable axes only; null when denominator is 0. */
  agreementRate: number | null
  notes: string[]
}

const AXES: ShadowPoaAxis[] = ['perception', 'objective', 'action']

function normalizeCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^unresolved$/i.test(trimmed)) return null
  return trimmed
}

function normalizeStatus(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function isClassified(status: string | null): boolean {
  return status === 'CLASSIFIED'
}

/**
 * Compare one axis under SERA_SHADOW_DIVERGENCE_V1 rules.
 * Literal equality only. ERC never consulted.
 */
export function compareShadowAxisV1(pair: ShadowAxisCodePair): ShadowAxisComparison {
  const legacyCode = normalizeCode(pair.legacyCode)
  const vnextCode = normalizeCode(pair.vnextCode)
  const vnextStatus = normalizeStatus(pair.vnextStatus)

  if (!isClassified(vnextStatus)) {
    return {
      axis: pair.axis,
      legacyCode,
      vnextCode: null,
      vnextStatus,
      diverges: false,
      agrees: false,
      excludedFromDenominator: true,
      exclusionReason: `vNext status '${vnextStatus ?? 'absent'}' is not CLASSIFIED`,
    }
  }

  if (legacyCode === null || vnextCode === null) {
    return {
      axis: pair.axis,
      legacyCode,
      vnextCode,
      vnextStatus,
      diverges: false,
      agrees: false,
      excludedFromDenominator: true,
      exclusionReason: legacyCode === null ? 'legacy code absent/UNRESOLVED' : 'vNext code absent/UNRESOLVED',
    }
  }

  const agrees = legacyCode === vnextCode
  return {
    axis: pair.axis,
    legacyCode,
    vnextCode,
    vnextStatus,
    diverges: !agrees,
    agrees,
    excludedFromDenominator: false,
    exclusionReason: null,
  }
}

export function compareShadowTripletV1(args: {
  perception: Omit<ShadowAxisCodePair, 'axis'>
  objective: Omit<ShadowAxisCodePair, 'axis'>
  action: Omit<ShadowAxisCodePair, 'axis'>
}): ShadowDivergenceV1Result {
  const axes = AXES.map((axis) => compareShadowAxisV1({ axis, ...args[axis] }))
  const comparable = axes.filter((axis) => !axis.excludedFromDenominator)
  const agreeingAxisCount = comparable.filter((axis) => axis.agrees).length
  const divergingAxisCount = comparable.filter((axis) => axis.diverges).length
  const comparableAxisCount = comparable.length
  const excludedAxisCount = axes.length - comparableAxisCount
  const agreementRate =
    comparableAxisCount === 0 ? null : Number((agreeingAxisCount / comparableAxisCount).toFixed(6))

  const exactTripletMatch = axes.every(
    (axis) => !axis.excludedFromDenominator && axis.agrees && axis.legacyCode !== null && axis.vnextCode !== null,
  )

  const notes: string[] = [
    'SERA_SHADOW_DIVERGENCE_V1: literal P/O/A code equality only; no semantic equivalence.',
    'ERC is excluded from this contract and must not be inferred from agreementRate.',
  ]
  if (comparableAxisCount === 0) {
    notes.push('No comparable axes — agreementRate is null (not zero).')
  }
  if (exactTripletMatch) {
    notes.push('exactTripletMatch=true: all three axes CLASSIFIED and literally equal.')
  }

  return {
    contractId: SERA_SHADOW_DIVERGENCE_CONTRACT_ID,
    axes,
    exactTripletMatch,
    comparableAxisCount,
    agreeingAxisCount,
    divergingAxisCount,
    excludedAxisCount,
    agreementRate,
    notes,
  }
}

export type ShadowAggregateMetricsV1 = {
  contractId: typeof SERA_SHADOW_DIVERGENCE_CONTRACT_ID
  runCount: number
  exactTripletMatchCount: number
  exactTripletMatchRate: number | null
  totalComparableAxes: number
  totalAgreeingAxes: number
  axisAgreementRate: number | null
  ercIncluded: false
}

export function aggregateShadowDivergenceV1(
  results: ShadowDivergenceV1Result[],
): ShadowAggregateMetricsV1 {
  const runCount = results.length
  const exactTripletMatchCount = results.filter((result) => result.exactTripletMatch).length
  const totalComparableAxes = results.reduce((sum, result) => sum + result.comparableAxisCount, 0)
  const totalAgreeingAxes = results.reduce((sum, result) => sum + result.agreeingAxisCount, 0)

  return {
    contractId: SERA_SHADOW_DIVERGENCE_CONTRACT_ID,
    runCount,
    exactTripletMatchCount,
    exactTripletMatchRate:
      runCount === 0 ? null : Number((exactTripletMatchCount / runCount).toFixed(6)),
    totalComparableAxes,
    totalAgreeingAxes,
    axisAgreementRate:
      totalComparableAxes === 0 ? null : Number((totalAgreeingAxes / totalComparableAxes).toFixed(6)),
    ercIncluded: false,
  }
}

/** Static guard used by audit tests — must never mention ERC as a compared field. */
export const SERA_SHADOW_DIVERGENCE_V1_EXCLUDED_FIELDS = ['erc', 'erc_level', 'ercLevel', 'risk'] as const
