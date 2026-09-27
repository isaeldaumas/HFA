import assert from 'node:assert/strict'
import { buildObservedSeraRiskSignature, computeHendyStrategicRisk, computeHendyTacticalRisk, SERA_STRATEGIC_FACTORS, SERA_TACTICAL_PERSONNEL_FACTORS, SERA_TACTICAL_TASK_FACTORS, SERA_TACTICAL_WORKING_FACTORS } from '../../frontend/src/lib/sera-vnext/risk-management'

const tacticalFactors = [...SERA_TACTICAL_PERSONNEL_FACTORS, ...SERA_TACTICAL_TASK_FACTORS, ...SERA_TACTICAL_WORKING_FACTORS]
const allMedium = Object.fromEntries(tacticalFactors.map((k) => [k, 'MEDIUM'])) as never
const tactical = computeHendyTacticalRisk({ qualificationAuthorized: true, levels: allMedium })
assert.equal(tactical.risk0to10, 5)
assert.equal(tactical.validationStatus, 'NOT_VALIDATED_PROTOTYPE')
assert.match(tactical.caveat, /validation/i)
assert.equal(computeHendyTacticalRisk({ qualificationAuthorized: false, levels: allMedium }).risk0to10, null)
const strategicHigh = Object.fromEntries(SERA_STRATEGIC_FACTORS.map((k) => [k, 'HIGH'])) as never
assert.equal(computeHendyStrategicRisk(strategicHigh).risk0to10, 10)
assert.equal(computeHendyStrategicRisk({}).risk0to10, 0)
const observed = buildObservedSeraRiskSignature([
  { codes: ['P-G','O-A','A-A'], preconditions: ['PSYCHOLOGICAL','ENVIRONMENT'] },
  { codes: ['P-G','O-D','A-F'], preconditions: ['PSYCHOLOGICAL','TIME_PRESSURE'] },
])
assert.equal(observed.activeFailureCounts['P-G'], 2)
assert.equal(observed.preconditionCounts['PSYCHOLOGICAL'], 2)
assert.match(observed.caveat, /not operational probabilities/i)
console.log('PASS Hendy risk-management contracts')
