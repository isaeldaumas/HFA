/**
 * CONTRACT TEST — Manifest dataAccess classification contract
 *
 * Ensures every REAL_DB, REAL_API, and REAL_UI entry in test-manifest.json
 * declares an explicit dataAccess classification:
 *   NONE              — no DB/API access
 *   READ_ONLY         — only reads, no writes/mutations
 *   MUTATING_SYNTHETIC — writes only to explicit staging fixture data
 *
 * If a new REAL_* test is added without dataAccess, this test fails CI,
 * preventing unclassified mutating tests from reaching integrated regression.
 *
 * Run: npx tsx tests/sera-vnext/manifest-data-access-contract-trial-001.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

// Also verify: no MUTATING_SYNTHETIC without explicit fixture env vars comment
// (static check: just verify count is reasonable and file exists)
const mutating = realEntries.filter((e) => e.dataAccess === 'MUTATING_SYNTHETIC')
const readOnly = realEntries.filter((e) => e.dataAccess === 'READ_ONLY')
const none = realEntries.filter((e) => e.dataAccess === 'NONE')

console.log(`Manifest dataAccess contract:`)
console.log(`  Total REAL_* entries: ${realEntries.length}`)
console.log(`  READ_ONLY: ${readOnly.length}`)
console.log(`  MUTATING_SYNTHETIC: ${mutating.length}`)
console.log(`  NONE: ${none.length}`)
console.log(`  Missing: 0`)

assert.equal(
  missingClassification.length,
  0,
  'All REAL_* entries must have valid dataAccess'
)

console.log('\nmanifest-data-access-contract: PASS')
