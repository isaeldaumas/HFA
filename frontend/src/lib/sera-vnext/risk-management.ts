import type { SeraCanonicalPreconditionCategory } from './precondition-taxonomy'

export type SeraRiskConditionLevel = 'LOW' | 'MEDIUM' | 'HIGH'
export type SeraRiskConditionScore = 0 | 5 | 10

const SCORE: Record<SeraRiskConditionLevel, SeraRiskConditionScore> = { LOW: 0, MEDIUM: 5, HIGH: 10 }

export const SERA_TACTICAL_PERSONNEL_FACTORS: SeraCanonicalPreconditionCategory[] = [
  'PHYSIOLOGICAL','PSYCHOLOGICAL','SOCIAL','PHYSICAL_CAPABILITY','PERSONAL_READINESS','TRAINING_SELECTION',
]
export const SERA_TACTICAL_TASK_FACTORS: SeraCanonicalPreconditionCategory[] = ['TIME_PRESSURE','OBJECTIVES']
export const SERA_TACTICAL_WORKING_FACTORS: SeraCanonicalPreconditionCategory[] = ['EQUIPMENT','WORKSPACE','ENVIRONMENT']
export const SERA_STRATEGIC_FACTORS: SeraCanonicalPreconditionCategory[] = [
  'MISSION','PROVISION_RESOURCES','RULES_REGULATIONS','ORGANIZATIONAL_PROCESS_PRACTICES','ORGANIZATIONAL_CLIMATE','OVERSIGHT',
]

function valuesFor(categories: SeraCanonicalPreconditionCategory[], input: Partial<Record<SeraCanonicalPreconditionCategory, SeraRiskConditionLevel>>): number[] {
  return categories.map((category) => SCORE[input[category] ?? 'LOW'])
}
function mean(values: number[]): number { return values.length ? values.reduce((a,b) => a+b, 0) / values.length : 0 }
function max(values: number[]): number { return values.length ? Math.max(...values) : 0 }
function round2(value: number): number { return Math.round(value * 100) / 100 }

export type HendyTacticalRiskResult = {
  model: 'HENDY_2003_TACTICAL_PROTOTYPE'
  validationStatus: 'NOT_VALIDATED_PROTOTYPE'
  qualificationAuthorization: 'GO' | 'NO_GO' | 'UNKNOWN'
  personnel: { max: number; mean: number }
  task: { max: number; mean: number }
  workingConditions: { max: number; mean: number }
  risk0to10: number | null
  formula: string
  caveat: string
}

export function computeHendyTacticalRisk(input: {
  qualificationAuthorized: boolean | null
  levels: Partial<Record<SeraCanonicalPreconditionCategory, SeraRiskConditionLevel>>
}): HendyTacticalRiskResult {
  const p = valuesFor(SERA_TACTICAL_PERSONNEL_FACTORS, input.levels)
  const t = valuesFor(SERA_TACTICAL_TASK_FACTORS, input.levels)
  const w = valuesFor(SERA_TACTICAL_WORKING_FACTORS, input.levels)
  const qualificationAuthorization = input.qualificationAuthorized === true ? 'GO' : input.qualificationAuthorized === false ? 'NO_GO' : 'UNKNOWN'
  const risk0to10 = input.qualificationAuthorized === false
    ? null
    : round2((1.4 * (max(p) + mean(p)) + 0.8 * (max(t) + mean(t) + max(w) + mean(w))) / 6)
  return {
    model: 'HENDY_2003_TACTICAL_PROTOTYPE', validationStatus: 'NOT_VALIDATED_PROTOTYPE', qualificationAuthorization,
    personnel: { max: max(p), mean: round2(mean(p)) }, task: { max: max(t), mean: round2(mean(t)) },
    workingConditions: { max: max(w), mean: round2(mean(w)) }, risk0to10,
    formula: '[1.4(Max(P)+Mean(P)) + 0.8(Max(T)+Mean(T)+Max(W)+Mean(W))] / 6',
    caveat: 'Hendy presents this mathematical form as a notional demonstration requiring validation before operational use.',
  }
}

export type HendyStrategicRiskResult = {
  model: 'HENDY_2003_STRATEGIC_PROTOTYPE'
  validationStatus: 'NOT_VALIDATED_PROTOTYPE'
  max: number
  mean: number
  risk0to10: number
  formula: string
  caveat: string
}

export function computeHendyStrategicRisk(levels: Partial<Record<SeraCanonicalPreconditionCategory, SeraRiskConditionLevel>>): HendyStrategicRiskResult {
  const values = valuesFor(SERA_STRATEGIC_FACTORS, levels)
  return {
    model: 'HENDY_2003_STRATEGIC_PROTOTYPE', validationStatus: 'NOT_VALIDATED_PROTOTYPE',
    max: max(values), mean: round2(mean(values)), risk0to10: round2((max(values) + mean(values)) / 2),
    formula: '[Max(f1..f6) + Mean(f1..f6)] / 2',
    caveat: 'Hendy presents this mathematical form as a notional demonstration requiring validation before operational use.',
  }
}

export type SeraObservedRiskSignature = {
  status: 'DESCRIPTIVE_OBSERVED_PROFILE'
  totalAnalyses: number
  activeFailureCounts: Record<string, number>
  preconditionCounts: Record<string, number>
  failurePreconditionPairs: Array<{ failure: string; precondition: string; count: number }>
  caveat: string
}

export function buildObservedSeraRiskSignature(events: Array<{ codes: Array<string | null | undefined>; preconditions: string[] }>): SeraObservedRiskSignature {
  const activeFailureCounts: Record<string, number> = {}
  const preconditionCounts: Record<string, number> = {}
  const pairCounts: Record<string, number> = {}
  for (const event of events) {
    const active = [...new Set(event.codes.filter((code): code is string => Boolean(code) && !['P-A','O-A','A-A'].includes(code as string)))]
    const pcs = [...new Set(event.preconditions)]
    for (const code of active) activeFailureCounts[code] = (activeFailureCounts[code] ?? 0) + 1
    for (const pc of pcs) preconditionCounts[pc] = (preconditionCounts[pc] ?? 0) + 1
    for (const code of active) for (const pc of pcs) pairCounts[`${code}|||${pc}`] = (pairCounts[`${code}|||${pc}`] ?? 0) + 1
  }
  return {
    status: 'DESCRIPTIVE_OBSERVED_PROFILE', totalAnalyses: events.length, activeFailureCounts, preconditionCounts,
    failurePreconditionPairs: Object.entries(pairCounts).map(([key,count]) => { const [failure, precondition] = key.split('|||'); return { failure, precondition, count } }).sort((a,b) => b.count-a.count),
    caveat: 'Observed frequencies describe the analysed event set. They are not operational probabilities without exposure denominators.',
  }
}
