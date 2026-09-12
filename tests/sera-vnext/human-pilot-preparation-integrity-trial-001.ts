import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextCanonicalTreePath } from './protected-path-contract'

const rootDir = path.resolve(__dirname, '..', '..')
const docDir = path.join(rootDir, 'docs', 'sera-vnext', 'human-pilot-preparation')

const requiredDocs = [
  'SERA_VNEXT_CURRENT_STATE_FOR_HUMAN_PILOT.md',
  'SERA_VNEXT_HUMAN_PILOT_CASE_BANK.csv',
  'SERA_VNEXT_HUMAN_PILOT_PRACTICE_CASES.csv',
  'SERA_VNEXT_HUMAN_PILOT_ASSIGNMENT_PLAN.csv',
  'SERA_VNEXT_HUMAN_PILOT_SHARED_CASES_PLAN.csv',
  'SERA_VNEXT_REVIEWER_QUICKSTART.md',
  'SERA_VNEXT_REVIEWER_CHECKLIST.md',
  'SERA_VNEXT_HUMAN_REVIEWER_RESULT_TEMPLATE.csv',
  'SERA_VNEXT_HUMAN_REVIEWER_DECISION_GUIDE_SIMPLE.md',
  'SERA_VNEXT_HUMAN_PILOT_FAQ.md',
  'SERA_VNEXT_HUMAN_PILOT_ACTIVATION_RUNBOOK.md',
  'SERA_VNEXT_HUMAN_PILOT_ROLLBACK_RUNBOOK.md',
  'SERA_VNEXT_HUMAN_PILOT_PREPARATION_FINAL_DECISION.md',
  'SERA_VNEXT_HUMAN_PILOT_PREPARATION_NEXT_STEPS.md',
  'SERA_VNEXT_HUMAN_PILOT_TRACKING_REPORT.md',
]

for (const doc of requiredDocs) {
  assert.ok(fs.existsSync(path.join(docDir, doc)), `required doc missing: ${doc}`)
}

const caseBankRows = fs
  .readFileSync(path.join(docDir, 'SERA_VNEXT_HUMAN_PILOT_CASE_BANK.csv'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith('case_id'))
assert.ok(caseBankRows.length >= 24, `expected at least 24 case bank rows, got ${caseBankRows.length}`)

const practiceRows = fs
  .readFileSync(path.join(docDir, 'SERA_VNEXT_HUMAN_PILOT_PRACTICE_CASES.csv'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith('practice_case_id'))
assert.equal(practiceRows.length, 5, `expected exactly 5 practice rows, got ${practiceRows.length}`)

const sharedRows = fs
  .readFileSync(path.join(docDir, 'SERA_VNEXT_HUMAN_PILOT_SHARED_CASES_PLAN.csv'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith('shared_case_id'))
assert.ok(sharedRows.length >= 5, `expected at least 5 shared-case rows, got ${sharedRows.length}`)

const finalDecision = fs.readFileSync(path.join(docDir, 'SERA_VNEXT_HUMAN_PILOT_PREPARATION_FINAL_DECISION.md'), 'utf8')
assert.ok(finalDecision.includes('HUMAN_REVIEWER_PILOT_READY_FOR_EXECUTION'))
assert.ok(finalDecision.includes('HUMAN_REVIEWER_PILOT_NOT_YET_EXECUTED'))

const changed = execSync('git diff --name-only && git diff --cached --name-only', { cwd: rootDir, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const protectedPrefixes = [
  'frontend/src/lib/sera/',
  'frontend/src/lib/sera-vnext/canonical-tree/',
  'frontend/src/lib/sera-vnext/engine-v0/',
  'tests/sera/fixtures/',
  'tests/reports/baseline/',
  'supabase/migrations/',
]
for (const file of changed) {
  for (const prefix of protectedPrefixes) {
    if (file.startsWith(prefix) && (isAllowedSeraVNextCanonicalTreePath(rootDir, file) || isAllowedA4R190LegacyMethodologyPath(rootDir, file))) continue
    assert.equal(file.startsWith(prefix), false, `protected path changed: ${file}`)
  }
}

console.log('HUMAN_PILOT_PREPARATION_INTEGRITY_OK')
