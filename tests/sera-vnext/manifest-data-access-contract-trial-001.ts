/**
 * CONTRACT TEST — Manifest dataAccess classification + guard coverage contract
 *
 * Ensures every REAL_DB, REAL_API, and REAL_UI entry in test-manifest.json
 * declares an explicit dataAccess classification:
 *   NONE              — no DB/API access
 *   READ_ONLY         — only reads, no writes/mutations
 *   MUTATING_SYNTHETIC — writes only to explicit staging fixture data
 *
 * Additionally ensures every MUTATING_SYNTHETIC entry:
 *   1. Has a corresponding file that exists
 *   2. Calls assertSafeTestEnvironment( — not just imports it
 *
 * If a new REAL_* test is added without dataAccess, this test fails CI.
 * If a MUTATING_SYNTHETIC test is added without the runtime guard, this test fails CI.
 *
 * Run: npx tsx tests/sera-vnext/manifest-data-access-contract-trial-001.ts
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const MANIFEST_PATH = join(ROOT, 'tests', 'sera-vnext', 'test-manifest.json')

type ManifestEntry = {
  path: string
  type: string
  requiredForRegression: boolean
  requiredEnvironment: string[]
  expectedExit: number
  expectedStatus: string
  dataAccess?: string
}

const VALID_DATA_ACCESS = new Set(['NONE', 'READ_ONLY', 'MUTATING_SYNTHETIC'])
const REAL_TYPES = new Set(['REAL_DB', 'REAL_API', 'REAL_UI'])

const manifest: ManifestEntry[] = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))

// ── Check 1: all REAL_* entries have valid dataAccess ─────────────────────
const realEntries = manifest.filter((e) => REAL_TYPES.has(e.type))
const missingClassification = realEntries.filter(
  (e) => !e.dataAccess || !VALID_DATA_ACCESS.has(e.dataAccess)
)

if (missingClassification.length > 0) {
  console.error(
    `MANIFEST_CONTRACT_VIOLATION: ${missingClassification.length} REAL_* case(s) missing valid dataAccess classification:`
  )
  for (const e of missingClassification) {
    console.error(`  ${e.type} | dataAccess=${JSON.stringify(e.dataAccess ?? 'MISSING')} | ${e.path}`)
  }
  console.error(
    `\nValid values: ${[...VALID_DATA_ACCESS].join(', ')}. ` +
      'Every REAL_DB/REAL_API/REAL_UI case must declare dataAccess.'
  )
  process.exit(1)
}

// ── Check 2: all MUTATING_SYNTHETIC entries call assertSafeTestEnvironment ─
const mutating = realEntries.filter((e) => e.dataAccess === 'MUTATING_SYNTHETIC')
const unguarded: string[] = []

for (const entry of mutating) {
  const filePath = join(ROOT, entry.path)
  if (!existsSync(filePath)) {
    console.error(`MANIFEST_CONTRACT_VIOLATION: MUTATING_SYNTHETIC file not found: ${entry.path}`)
    unguarded.push(entry.path + ' (FILE_MISSING)')
    continue
  }
  const source = readFileSync(filePath, 'utf8')
  // Must have a call to assertSafeTestEnvironment( — not just an import
  // Detect: assertSafeTestEnvironment( with optional whitespace before (
  if (!source.match(/assertSafeTestEnvironment\s*\(/)) {
    unguarded.push(entry.path)
  }
}

if (unguarded.length > 0) {
  console.error(
    `MANIFEST_CONTRACT_VIOLATION: ${unguarded.length} MUTATING_SYNTHETIC test(s) do not call assertSafeTestEnvironment(...):`
  )
  for (const p of unguarded) {
    console.error(`  ${p}`)
  }
  console.error(
    '\nEvery MUTATING_SYNTHETIC test must call assertSafeTestEnvironment(...) before any write. ' +
      'Import alone is not sufficient.'
  )
  process.exit(1)
}

// ── Summary ────────────────────────────────────────────────────────────────
const readOnly = realEntries.filter((e) => e.dataAccess === 'READ_ONLY')
const none = realEntries.filter((e) => e.dataAccess === 'NONE')

console.log(`Manifest dataAccess contract:`)
console.log(`  Total REAL_* entries: ${realEntries.length}`)
console.log(`  READ_ONLY: ${readOnly.length}`)
console.log(`  MUTATING_SYNTHETIC: ${mutating.length}`)
console.log(`  NONE: ${none.length}`)
console.log(`  Missing classification: 0`)
console.log(`  Unguarded MUTATING_SYNTHETIC: 0`)
console.log(`  All ${mutating.length} MUTATING_SYNTHETIC tests call assertSafeTestEnvironment(`)

assert.equal(missingClassification.length, 0, 'All REAL_* entries must have valid dataAccess')
assert.equal(unguarded.length, 0, 'All MUTATING_SYNTHETIC tests must call assertSafeTestEnvironment')

console.log('\nmanifest-data-access-contract: PASS')
console.log(`HFA_MUTATING_REAL_TESTS_RUNTIME_GUARDED_${mutating.length}_OF_${mutating.length}`)
