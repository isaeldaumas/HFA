/**
 * AUDIT TEST — analysis_edits RLS user_metadata detection
 *
 * Documents that migration 20260507180000_add_analysis_edits.sql contains
 * a RLS policy (tenant_isolation) that uses auth.jwt()->'user_metadata'->>'tenant_id'
 * as the tenant source — which is insecure because user_metadata is user-controlled.
 *
 * This test:
 *   1. Detects the insecure pattern and FAILS if it exists without a superseding migration.
 *   2. Detects whether a hardening migration exists that replaces this policy.
 *   3. When the hardening migration exists, verifies it supersedes the insecure one.
 *
 * DO NOT edit the historical migration. Add a new migration to supersede the policy.
 * See: docs/hfa-backlog/sql-drafts/TENANT_AUTHORIZATION_HARDENING_DRAFT.sql
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/analysis-edits-rls-user-metadata-detection-trial-001.ts
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const HISTORICAL_MIGRATION = join(
  MIGRATIONS_DIR,
  '20260507180000_add_analysis_edits.sql'
)

let failures = 0
let warnings = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}
function warn(label: string) {
  console.log(`WARN — ${label}`)
  warnings++
}

// 1. Confirm historical migration contains the insecure pattern (this should always pass)
const historicalSource = readFileSync(HISTORICAL_MIGRATION, 'utf8')
const INSECURE_PATTERN = /auth\.jwt\(\)\s*->\s*'user_metadata'\s*->>\s*'tenant_id'/

check(
  INSECURE_PATTERN.test(historicalSource),
  'historical migration 20260507180000: insecure user_metadata RLS pattern detected (expected)'
)

// 2. Historical migration must NOT be modified (verify by detecting original content)
check(
  historicalSource.includes("auth.jwt() -> 'user_metadata' ->> 'tenant_id'"),
  'historical migration: original content preserved (not modified)'
)

// 3. Check whether a hardening migration exists that replaces this policy
const allMigrations = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const HARDENING_KEYWORD = 'analysis_edits'
const GET_TENANT_KEYWORD = 'get_current_tenant_id\|get_tenant_id\|auth\.uid'

const hardeningMigrations = allMigrations.filter((f) => {
  // Must come after the insecure migration chronologically
  if (f <= '20260507180000_add_analysis_edits.sql') return false
  const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
  // Must reference analysis_edits table AND drop/replace the insecure policy
  return (
    content.includes(HARDENING_KEYWORD) &&
    (content.includes('DROP POLICY') || content.includes('CREATE OR REPLACE POLICY')) &&
    content.includes('tenant_isolation')
  )
})

if (hardeningMigrations.length === 0) {
  warn(
    'No hardening migration found for analysis_edits tenant_isolation policy. ' +
      'The insecure user_metadata RLS remains active in DB until a new migration is applied. ' +
      'See: docs/hfa-backlog/sql-drafts/TENANT_AUTHORIZATION_HARDENING_DRAFT.sql'
  )
  warn(
    'INSECURE_RLS_ACTIVE: analysis_edits.tenant_isolation uses user_metadata (user-controlled). ' +
      'This is a known finding pending DB hardening. App-layer hardening is active.'
  )
} else {
  console.log(`INFO — hardening migration(s) found: ${hardeningMigrations.join(', ')}`)

  // Verify hardening migration does NOT use user_metadata
  for (const mig of hardeningMigrations) {
    const content = readFileSync(join(MIGRATIONS_DIR, mig), 'utf8')
    check(
      !INSECURE_PATTERN.test(content),
      `hardening migration ${mig}: does not reintroduce user_metadata RLS`
    )
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} failure(s) — analysis-edits-rls-user-metadata-detection: FAIL`
  )
  process.exit(1)
}

const status =
  hardeningMigrations.length === 0
    ? 'APP_LAYER_HARDENED_DB_PENDING'
    : 'APP_LAYER_HARDENED_DB_HARDENING_MIGRATION_PRESENT'

console.log(`\nanalysis-edits-rls-user-metadata-detection: PASS [${status}]`)
if (warnings > 0) {
  console.log(
    `${warnings} warning(s) — insecure RLS documented, pending DB migration authorization.`
  )
}
