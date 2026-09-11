/**
 * CONTRACT — READ_ONLY dataAccess must not contain mutation signals.
 *
 * Fail CI if a REAL_* entry classified READ_ONLY uses HTTP mutating methods,
 * Supabase write APIs, or known UI persistence helpers.
 *
 * Run: npx tsx tests/sera-vnext/read-only-data-access-contract-trial-001.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const MANIFEST = join(ROOT, 'tests/sera-vnext/test-manifest.json')

type Entry = {
  path: string
  type: string
  dataAccess?: string
}

const HTTP_MUT = /\bmethod:\s*['"](?:POST|PUT|PATCH|DELETE)['"]|\.(?:post|put|patch|delete)\s*\(/i
const SB_MUT = /\.from\([^)]*\)[\s\S]{0,120}\.(?:insert|update|upsert|delete)\s*\(/
const UI_MUT =
  /\b(?:excludeFromProfile|purge|deleteEvent|restoreEvent|archive|reanalyze|createMagicLinkSession\s*\([\s\S]*?method:\s*['"]POST)/i

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Entry[]
const readOnly = manifest.filter(
  (e) =>
    ['REAL_API', 'REAL_DB', 'REAL_UI'].includes(e.type) && e.dataAccess === 'READ_ONLY'
)

const violations: string[] = []
for (const entry of readOnly) {
  const full = join(ROOT, entry.path)
  if (!existsSync(full)) {
    violations.push(`${entry.path}: missing file`)
    continue
  }
  const src = readFileSync(full, 'utf8')
  const hits: string[] = []
  if (HTTP_MUT.test(src)) hits.push('HTTP_MUTATING_METHOD')
  if (SB_MUT.test(src)) hits.push('SUPABASE_MUTATION')
  if (UI_MUT.test(src)) hits.push('UI_PERSISTENCE_SIGNAL')
  if (hits.length) violations.push(`${entry.path}: ${hits.join(',')}`)
}

console.log(`READ_ONLY REAL_* entries audited: ${readOnly.length}`)
if (violations.length) {
  console.error('READ_ONLY_DATA_ACCESS_CONTRACT_VIOLATION:')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

assert.equal(violations.length, 0)
console.log('read-only-data-access-contract: PASS')
console.log('HFA_READ_ONLY_DATA_ACCESS_CONTRACT_ACTIVE')
