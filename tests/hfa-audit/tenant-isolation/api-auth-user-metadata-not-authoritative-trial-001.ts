/**
 * AUDIT TEST — api-auth user_metadata not authoritative
 *
 * Proves that frontend/src/lib/server/api-auth.ts does NOT derive
 * tenant or role from user_metadata.
 *
 * This is a static-analysis test: it reads source code and asserts
 * structural properties. No Supabase connection required.
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/api-auth-user-metadata-not-authoritative-trial-001.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const API_AUTH = join(ROOT, 'frontend', 'src', 'lib', 'server', 'api-auth.ts')
const RESOLVER = join(ROOT, 'frontend', 'src', 'lib', 'server', 'authorized-user-context.ts')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

const apiAuthSource = readFileSync(API_AUTH, 'utf8')
const resolverSource = readFileSync(RESOLVER, 'utf8')

// api-auth.ts must not reference user_metadata for tenant or role
check(
  !apiAuthSource.includes('user_metadata?.tenant_id') &&
    !apiAuthSource.includes("user_metadata['tenant_id']") &&
    !apiAuthSource.includes('user_metadata["tenant_id"]'),
  'api-auth.ts: does not read user_metadata.tenant_id'
)

check(
  !apiAuthSource.includes('user_metadata?.role') &&
    !apiAuthSource.includes("user_metadata['role']") &&
    !apiAuthSource.includes('user_metadata["role"]'),
  'api-auth.ts: does not read user_metadata.role'
)

// api-auth.ts must not call updateUserById to sync user_metadata
// (allow mention in comments/jsdoc, but not as a code call)
check(
  !apiAuthSource.match(/^\s*(?:await\s+)?[\w.]+\.updateUserById\(/m),
  'api-auth.ts: does not call updateUserById to sync user_metadata'
)

// api-auth.ts must delegate to the authoritative resolver
check(
  apiAuthSource.includes('resolveAuthorizedUserContext'),
  'api-auth.ts: delegates to resolveAuthorizedUserContext'
)

// Resolver must not USE user_metadata in code (allow doc comments mentioning it)
// Pattern: accessing user_metadata as a property (not in a string/comment)
check(
  !resolverSource.match(/\buser_metadata\s*[?[.]/),
  'authorized-user-context.ts: does not access user_metadata as code'
)

// Resolver must query public.users
check(
  resolverSource.includes("from('users')"),
  'authorized-user-context.ts: queries public.users'
)

// Resolver must check is_active
check(
  resolverSource.includes('is_active'),
  'authorized-user-context.ts: checks is_active'
)

// Resolver must distinguish authUserId from publicUserId
check(
  resolverSource.includes('authUserId') && resolverSource.includes('publicUserId'),
  'authorized-user-context.ts: distinguishes authUserId from publicUserId'
)

// Resolver must use AuthenticatedIdentity (typed input, not bare strings)
check(
  resolverSource.includes('AuthenticatedIdentity'),
  'authorized-user-context.ts: uses typed AuthenticatedIdentity input'
)

// Resolver must require emailConfirmedAt for legacy path
check(
  resolverSource.includes('emailConfirmedAt'),
  'authorized-user-context.ts: requires emailConfirmedAt for legacy email binding'
)

// Resolver must use identityBinding (not isLegacyEmailMatch)
check(
  resolverSource.includes('identityBinding') && !resolverSource.includes('isLegacyEmailMatch'),
  'authorized-user-context.ts: uses identityBinding type (replaces isLegacyEmailMatch)'
)

// Resolver must fail closed when no user found
check(
  resolverSource.includes('status: 403'),
  'authorized-user-context.ts: returns 403 on authorization failure'
)

// api-auth.ts must not fall back to metadata when DB is absent
// (old pattern: `if (!tenantId)` → only consult DB as fallback)
check(
  !apiAuthSource.match(/if\s*\(\s*!tenantId\s*\)/),
  'api-auth.ts: no conditional DB-only fallback (metadata-first pattern eliminated)'
)

if (failures > 0) {
  console.error(`\n${failures} failure(s) — api-auth user_metadata not authoritative: FAIL`)
  process.exit(1)
}
console.log('\napi-auth-user-metadata-not-authoritative: PASS')
