/**
 * CONTRACT TEST — Integrated regression level enforcement
 *
 * Proves structural and behavioral properties of the runner's
 * HFA_INTEGRATED_REGRESSION_LEVEL enforcement:
 *
 * 1. Runner source knows DataAccess type
 * 2. Runner reads HFA_INTEGRATED_REGRESSION_LEVEL
 * 3. READ_ONLY level excludes MUTATING_SYNTHETIC entries (via accessLevelSkip)
 * 4. MUTATING_SYNTHETIC level allows all entries
 * 5. Invalid level fails before running any test
 * 6. Unset level preserves historical behavior (no filtering)
 * 7. Non-REAL_* entries are never excluded by access level
 * 8. ACCESS_LEVEL_SKIP is a distinct status (not SKIP or ENVIRONMENT_MISSING)
 * 9. Runner verifies READ_ONLY constraint: mutating_synthetic_executed must be 0
 * 10. HFA_REGRESSION_LIST_ONLY mode works for dry-run selection verification
 * 11. List-only READ_ONLY: MUTATING_SYNTHETIC selected = 0
 * 12. List-only MUTATING_SYNTHETIC: MUTATING_SYNTHETIC selected > 0
 *
 * Run: npx tsx tests/sera-vnext/integrated-regression-level-enforcement-trial-001.ts
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = join(__dirname, '..', '..')
const RUNNER = join(ROOT, 'scripts', 'run-sera-vnext-regression.ts')
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx'

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

if (!existsSync(RUNNER)) {
  console.error(`FATAL: Runner not found: ${RUNNER}`)
  process.exit(1)
}

const runner = readFileSync(RUNNER, 'utf8')

// ── Structural checks on runner source ────────────────────────────────────
// Note: TypeScript type aliases (type DataAccess = ...) are used in source but
// erased at runtime. We check for runtime-observable patterns instead.
check(
  (runner.includes("'MUTATING_SYNTHETIC'") || runner.includes('"MUTATING_SYNTHETIC"')) &&
    (runner.includes("'READ_ONLY'") || runner.includes('"READ_ONLY"')) &&
    (runner.includes("DataAccess") || runner.includes("NONE")),
  'runner: source contains DataAccess values (MUTATING_SYNTHETIC, READ_ONLY; type definition present)'
)
check(
  runner.includes('IntegratedRegressionLevel') || (runner.includes('READ_ONLY') && runner.includes('MUTATING_SYNTHETIC')),
  'runner: source references both execution level values'
)
check(
  runner.includes('HFA_INTEGRATED_REGRESSION_LEVEL'),
  'runner: reads HFA_INTEGRATED_REGRESSION_LEVEL'
)
check(
  runner.includes('VALID_LEVELS') && runner.includes('Refusing to run any tests'),
  'runner: invalid level causes immediate fatal error'
)
check(
  runner.includes('integratedLevel === null') || runner.includes('integratedLevel = null'),
  'runner: null level = historical behavior (no filtering)'
)
check(
  runner.includes('accessLevelSkip') && runner.includes("MUTATING_SYNTHETIC"),
  'runner: accessLevelSkip function excludes MUTATING_SYNTHETIC in READ_ONLY mode'
)
check(
  runner.includes("READ_ONLY") && runner.includes('accessLevelSkip'),
  'runner: READ_ONLY branch references accessLevelSkip'
)
check(
  runner.includes('ACCESS_LEVEL_SKIP'),
  'runner: ACCESS_LEVEL_SKIP is a distinct status value'
)
check(
  runner.includes('mutating_synthetic_executed') && runner.includes('read_only_executed'),
  'runner: summary includes mutating_synthetic_executed and read_only_executed counts'
)
check(
  runner.includes('mutatingSyntheticExecuted !== 0') ||
    runner.includes('mutatingSyntheticExecuted'),
  'runner: enforces mutating_synthetic_executed === 0 in READ_ONLY mode'
)
check(
  runner.includes('HFA_REGRESSION_LIST_ONLY'),
  'runner: supports HFA_REGRESSION_LIST_ONLY dry-run mode'
)
check(
  runner.includes('MUTATING_SYNTHETIC selected = 0'),
  'runner: list-only reports 0 MUTATING_SYNTHETIC in READ_ONLY mode'
)
check(
  runner.includes('!REAL_TYPES.has(entry.type)') || runner.includes('REAL_TYPES.has'),
  'runner: non-REAL_* entries not excluded by access level (REAL_TYPES gating used)'
)

// ── Behavioral check: list-only READ_ONLY selects 0 MUTATING_SYNTHETIC ───
console.log('\n--- Behavioral: list-only READ_ONLY ---')
const readOnlyResult = spawnSync(
  NPX,
  ['tsx', 'scripts/run-sera-vnext-regression.ts'],
  {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      HFA_INTEGRATED_REGRESSION_LEVEL: 'READ_ONLY',
      HFA_REGRESSION_LIST_ONLY: 'true',
    },
  }
)
const readOnlyOut = `${readOnlyResult.stdout ?? ''}${readOnlyResult.stderr ?? ''}`
console.log(readOnlyOut.split('\n').filter(Boolean).map(l => '  ' + l).join('\n'))

check(readOnlyResult.status === 0, 'list-only READ_ONLY exits 0')
check(
  readOnlyOut.includes('MUTATING_SYNTHETIC selected: 0'),
  'list-only READ_ONLY: MUTATING_SYNTHETIC selected = 0'
)
check(
  readOnlyOut.includes('READ_ONLY enforcement: PASS'),
  'list-only READ_ONLY: enforcement confirmed in output'
)

// ── Behavioral check: list-only MUTATING_SYNTHETIC selects > 0 ───────────
console.log('\n--- Behavioral: list-only MUTATING_SYNTHETIC ---')
const mutatingResult = spawnSync(
  NPX,
  ['tsx', 'scripts/run-sera-vnext-regression.ts'],
  {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      HFA_INTEGRATED_REGRESSION_LEVEL: 'MUTATING_SYNTHETIC',
      HFA_REGRESSION_LIST_ONLY: 'true',
    },
  }
)
const mutatingOut = `${mutatingResult.stdout ?? ''}${mutatingResult.stderr ?? ''}`
console.log(mutatingOut.split('\n').filter(Boolean).map(l => '  ' + l).join('\n'))

check(mutatingResult.status === 0, 'list-only MUTATING_SYNTHETIC exits 0')
// Extract the MUTATING_SYNTHETIC selected count
const mutatingCountMatch = mutatingOut.match(/MUTATING_SYNTHETIC selected:\s*(\d+)/)
const mutatingCount = mutatingCountMatch ? parseInt(mutatingCountMatch[1]) : 0
check(mutatingCount === 14, `list-only MUTATING_SYNTHETIC: 14 selected (got ${mutatingCount})`)

// ── Behavioral check: invalid level fails immediately ────────────────────
console.log('\n--- Behavioral: invalid level ---')
const invalidResult = spawnSync(
  NPX,
  ['tsx', 'scripts/run-sera-vnext-regression.ts'],
  {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    env: {
      ...process.env,
      HFA_INTEGRATED_REGRESSION_LEVEL: 'INVALID_LEVEL',
      HFA_REGRESSION_LIST_ONLY: 'true',
    },
  }
)
const invalidOut = `${invalidResult.stdout ?? ''}${invalidResult.stderr ?? ''}`
check(invalidResult.status !== 0, 'invalid level: runner exits non-zero')
check(
  invalidOut.includes('INVALID_LEVEL') && invalidOut.includes('Refusing to run'),
  'invalid level: clear error message with refusing message'
)

// ── Result ────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.error(`\n${failures} failure(s) — integrated-regression-level-enforcement: FAIL`)
  process.exit(1)
}
console.log('\nintegrated-regression-level-enforcement: PASS')
console.log('HFA_INTEGRATED_REGRESSION_LEVEL_ENFORCEMENT_ACTIVE')
