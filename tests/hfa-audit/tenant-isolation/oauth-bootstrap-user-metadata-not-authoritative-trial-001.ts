/**
 * AUDIT TEST — OAuth bootstrap user_metadata not authoritative
 *
 * Proves that frontend/src/app/api/auth/oauth/bootstrap/route.ts does NOT
 * contain a fast-path that accepts tenant membership from user_metadata.
 *
 * Specifically: the old pattern read user_metadata?.tenant_id and, if the
 * tenant existed in the DB, returned 200 without verifying public.users
 * membership. Existence of a tenant is NOT proof of membership.
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/oauth-bootstrap-user-metadata-not-authoritative-trial-001.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const BOOTSTRAP = join(
  ROOT,
  'frontend',
  'src',
  'app',
  'api',
  'auth',
  'oauth',
  'bootstrap',
  'route.ts'
)

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

const source = readFileSync(BOOTSTRAP, 'utf8')

// Must not read user_metadata.tenant_id
check(
  !source.includes('user_metadata?.tenant_id') &&
    !source.includes("user_metadata['tenant_id']") &&
    !source.includes('user_metadata["tenant_id"]'),
  'bootstrap: does not read user_metadata.tenant_id'
)

// Must not use user_metadata for any fast-path authorization
check(
  !source.includes('currentTenant = user.user_metadata'),
  'bootstrap: no currentTenant derived from user_metadata'
)

// Must resolve user from public.users by id
check(
  source.includes(".eq('id', user.id)"),
  'bootstrap: resolves user from public.users by auth id'
)

// Must not return early based solely on metadata tenant existence
// Old pattern: `currentTenant = user.user_metadata?.tenant_id` → tenantCheck → return ok
// The specific smell: reading tenant_id from user_metadata then immediately returning 200
const metadataFastPathPattern =
  /user_metadata\?\.tenant_id[\s\S]{0,400}return\s+NextResponse\.json\s*\(\s*\{[^}]*ok\s*:\s*true/
check(
  !metadataFastPathPattern.test(source),
  'bootstrap: no user_metadata.tenant_id → immediate return fast-path'
)

// Must not READ user_metadata for authorization (writing to app_metadata is allowed)
check(
  !source.match(/=\s*user\.user_metadata\??\.(tenant_id|role)/),
  'bootstrap: does not read user_metadata.tenant_id or .role for authorization'
)

// Must still create public.users row for new users
check(
  source.includes("from('users').insert"),
  'bootstrap: inserts into public.users for new registrations'
)

// Must still resolve by email for legacy compat (acceptable)
check(
  source.includes("eq('email', email)"),
  'bootstrap: legacy email resolution path present'
)

if (failures > 0) {
  console.error(
    `\n${failures} failure(s) — oauth-bootstrap user_metadata not authoritative: FAIL`
  )
  process.exit(1)
}
console.log('\noauth-bootstrap-user-metadata-not-authoritative: PASS')
