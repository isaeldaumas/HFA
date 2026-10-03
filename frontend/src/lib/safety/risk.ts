export type SafetyProbability = 'A' | 'B' | 'C' | 'D' | 'E'
export type SafetySeverity = 1 | 2 | 3 | 4 | 5
export type SafetyRiskLevel = 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO'

export const SAFETY_RISK_MATRIX_PROFILE = 'AIRTRUST_SGSO_5X5_V1' as const

export const SAFETY_PROBABILITY_LABELS: Record<SafetyProbability, string> = {
  A: 'Frequente',
  B: 'Provável',
  C: 'Ocasional',
  D: 'Remoto',
  E: 'Improvável',
}

export const SAFETY_SEVERITY_LABELS: Record<SafetySeverity, string> = {
  1: 'Insignificante',
  2: 'Menor',
  3: 'Moderado',
  4: 'Maior',
  5: 'Catastrófico',
}
const PROBABILITY_SCORE: Record<SafetyProbability, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
}

export const SAFETY_RISK_MATRIX: Record<SafetyProbability, Record<SafetySeverity, SafetyRiskLevel>> = {
  A: { 1: 'MEDIO', 2: 'ALTO', 3: 'ALTO', 4: 'CRITICO', 5: 'CRITICO' },
  B: { 1: 'MEDIO', 2: 'MEDIO', 3: 'ALTO', 4: 'ALTO', 5: 'CRITICO' },
  C: { 1: 'BAIXO', 2: 'MEDIO', 3: 'MEDIO', 4: 'ALTO', 5: 'ALTO' },
  D: { 1: 'BAIXO', 2: 'BAIXO', 3: 'MEDIO', 4: 'MEDIO', 5: 'ALTO' },
  E: { 1: 'BAIXO', 2: 'BAIXO', 3: 'BAIXO', 4: 'MEDIO', 5: 'MEDIO' },
}

export function calculateSafetyRisk(
  probability: SafetyProbability,
  severity: SafetySeverity,
): { score: number; level: SafetyRiskLevel } {
  return {
    score: PROBABILITY_SCORE[probability] * severity,
    level: SAFETY_RISK_MATRIX[probability][severity],
  }
}

export function isSafetyProbability(value: unknown): value is SafetyProbability {
  return typeof value === 'string' && ['A', 'B', 'C', 'D', 'E'].includes(value)
}
