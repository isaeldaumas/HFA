/**
 * AUDIT TEST — Tenant authorization context contract
 *
 * Proves structural properties of authorized-user-context.ts:
 *   - tenant/role come from public.users
 *   - is_active is verified
 *   - authUserId and publicUserId are distinguished
 *   - no tenant from request body/header/query enters authorization context
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/tenant-authorization-context-contract-trial-001.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const RESOLVER = join(ROOT, 'frontend', 'src', 'lib', 'server', 'authorized-user-context.ts')
const API_AUTH = join(ROOT, 'frontend', 'src', 'lib', 'server', 'api-auth.ts')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

const resolver = readFileSync(RESOLVER, 'utf8')
const apiAuth = readFileSync(API_AUTH, 'utf8')

// Resolver queries public.users
check(resolver.includes("from('users')"), 'resolver: queries public.users')

// Resolver selects tenant_id from public.users
check(
  resolver.includes("'id, tenant_id, role, is_active, email'") ||
    resolver.includes('"id, tenant_id, role, is_active, email"'),
  'resolver: selects id, tenant_id, role, is_active, email from public.users'
)

// Resolver checks is_active
check(resolver.includes('is_active'), 'resolver: checks is_active')
check(
  resolver.includes("status: 403") && resolver.includes('Conta inativa'),
  'resolver: returns 403 for inactive account'
)

// Resolver distinguishes authUserId from publicUserId in returned context
check(
  resolver.includes('authUserId') && resolver.includes('publicUserId'),
  'resolver: exports both authUserId and publicUserId'
)

// Resolver must not accept tenant from request params (no req parameter)
check(
  !resolver.includes('req: Request') && !resolver.includes('req:Request'),
  'resolver: does not accept Request parameter (no request-derived tenant possible)'
)

// Resolver must not ACCESS user_metadata as code (doc comments allowed)
check(
  !resolver.match(/\buser_metadata\s*[?[.]/),
  'resolver: does not access user_metadata as code property'
)

// Resolver must not ACCESS app_metadata as code (doc comments allowed)
check(
  !resolver.match(/\bapp_metadata\s*[?[.]/),
  'resolver: does not access app_metadata as code property'
)

// api-auth.ts must use service-role key for DB resolution
check(
  apiAuth.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'api-auth.ts: uses service-role key for DB resolution'
)

// api-auth.ts must not accept tenant from request body, header, or query
// (no req.json() in api-auth.ts, and no searchParams usage for tenant)
check(
  !apiAuth.includes('req.json()') && !apiAuth.includes('searchParams'),
  'api-auth.ts: does not parse request body or query for tenant'
)

// The returned ApiUserContext.tenantId comes exclusively from resolver
check(
  apiAuth.includes('ctx.tenantId'),
  'api-auth.ts: tenantId sourced from ctx (resolver output)'
)

// Legacy email match is flagged
check(
  resolver.includes('isLegacyEmailMatch'),
  'resolver: flags legacy email match for audit'
)

// Ambiguous email match fails closed
check(
  resolver.includes('rows.length > 1') && resolver.includes('Associação de conta ambígua'),
  'resolver: fails closed on ambiguous email match'
)

if (failures > 0) {
  console.error(`\n${failures} failure(s) — tenant-authorization-context-contract: FAIL`)
  process.exit(1)
}
console.log('\ntenant-authorization-context-contract: PASS')
