import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  SAFETY_RISK_MATRIX,
  calculateSafetyRisk,
} from '../../frontend/src/lib/safety/risk'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

assert.equal(calculateSafetyRisk('A', 1).level, 'MEDIO')
assert.equal(calculateSafetyRisk('A', 2).level, 'ALTO')
assert.equal(calculateSafetyRisk('A', 4).level, 'CRITICO')
assert.equal(calculateSafetyRisk('C', 1).level, 'BAIXO')
assert.equal(calculateSafetyRisk('C', 4).level, 'ALTO')
assert.equal(calculateSafetyRisk('D', 5).level, 'ALTO')
assert.equal(calculateSafetyRisk('E', 4).level, 'MEDIO')
assert.equal(SAFETY_RISK_MATRIX.B[5], 'CRITICO')
assert.equal(calculateSafetyRisk('B', 3).score, 12)

const migration = read('supabase/migrations/20261003001728_safety_risk_actions_v1.sql')
const riskRoute = read('frontend/src/app/api/events/[eventId]/risk/route.ts')
const actionsRoute = read('frontend/src/app/api/actions/route.ts')
assert.match(migration, /create table if not exists public\.event_risk_assessments/)
assert.match(migration, /assessment_type in \('INITIAL', 'RESIDUAL'\)/)
assert.match(migration, /action_kind in \('CORRECTIVE_PREVENTIVE', 'INVESTIGATION', 'GENERAL_SAFETY'\)/)
assert.match(migration, /action_kind = 'GENERAL_SAFETY'/)
assert.match(migration, /enable row level security/)

assert.match(riskRoute, /assessmentType === 'RESIDUAL'/)
assert.match(riskRoute, /Registre a avaliação de risco inicial antes da residual/)
assert.match(riskRoute, /calculateSafetyRisk\(probability, severityNumber as SafetySeverity\)/)
assert.match(riskRoute, /eventType: 'safety_risk_assessment_created'/)

assert.match(actionsRoute, /actionKind === 'GENERAL_SAFETY'/)
assert.match(actionsRoute, /analysis_id: null/)
assert.match(actionsRoute, /sera_vnext_analysis_id: null/)
assert.match(actionsRoute, /linkage_status: 'EVENT_ONLY'/)
assert.match(actionsRoute, /actionKind === 'CORRECTIVE_PREVENTIVE'/)
assert.match(actionsRoute, /precondition_id/)

console.log('Safety risk + actions contract: PASS')
