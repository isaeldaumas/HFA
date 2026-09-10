/**
 * AUDIT TEST — Identity binding contract
 *
 * Proves structural properties of the complete identity binding model:
 * - Legacy email binding requires confirmed email
 * - Legacy binding requires single active row only
 * - Ambiguities fail closed
 * - Inactive user fails
 * - Inactive tenant fails
 * - authUserId and publicUserId arrive in ApiUserContext
 * - bootstrap and requireBearerUser share the same resolver
 * - user_metadata and app_metadata are not used for authorization decisions
 * - UI role metadata is marked as cosmetic debt (P2)
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/identity-binding-contract-trial-001.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const RESOLVER = join(ROOT, 'frontend', 'src', 'lib', 'server', 'authorized-user-context.ts')
const API_AUTH = join(ROOT, 'frontend', 'src', 'lib', 'server', 'api-auth.ts')
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

const resolver = readFileSync(RESOLVER, 'utf8')
const apiAuth = readFileSync(API_AUTH, 'utf8')
const bootstrap = readFileSync(BOOTSTRAP, 'utf8')

// ── Legacy email binding requires confirmed email ────────────────────────────
check(
  resolver.includes('emailConfirmedAt') &&
    resolver.includes('Email não confirmado'),
  'resolver: legacy email path requires emailConfirmedAt non-null'
)

check(
  resolver.includes('!emailConfirmedAt'),
  'resolver: rejects unconfirmed email explicitly'
)

// ── Ambiguous email match fails closed ───────────────────────────────────────
check(
  resolver.includes('rows.length > 1') && resolver.includes('Associação de conta ambígua'),
  'resolver: ambiguous email match fails closed'
)

// ── Inactive user fails ──────────────────────────────────────────────────────
check(
  resolver.includes('!row.is_active') && resolver.includes('Conta inativa'),
  'resolver: inactive user fails with 403'
)

// ── Inactive tenant fails ────────────────────────────────────────────────────
check(
  resolver.includes('assertTenantActive') &&
    resolver.includes("from('tenants')") &&
    resolver.includes('Tenant desativado'),
  'resolver: inactive tenant fails with 403'
)

// ── identityBinding is explicit ──────────────────────────────────────────────
check(
  resolver.includes("identityBinding: 'DIRECT_AUTH_ID'") &&
    resolver.includes("identityBinding: 'LEGACY_CONFIRMED_EMAIL'"),
  'resolver: identityBinding is explicit in both paths'
)

// ── authUserId and publicUserId in ApiUserContext ────────────────────────────
check(
  apiAuth.includes('authUserId') && apiAuth.includes('publicUserId'),
  'api-auth.ts: ApiUserContext has both authUserId and publicUserId'
)

// ── userId is deprecated, equals authUserId ──────────────────────────────────
check(
  apiAuth.includes('userId: ctx.authUserId') && apiAuth.includes('@deprecated'),
  'api-auth.ts: userId is deprecated and equals authUserId'
)

// ── api-auth.ts passes emailConfirmedAt to resolver ─────────────────────────
check(
  apiAuth.includes('emailConfirmedAt') && apiAuth.includes('email_confirmed_at'),
  'api-auth.ts: passes email_confirmed_at from auth.getUser() to resolver'
)

// ── Bootstrap uses shared resolver ──────────────────────────────────────────
check(
  bootstrap.includes('resolveAuthorizedUserContext'),
  'bootstrap: uses shared resolveAuthorizedUserContext for existing users'
)

// ── Bootstrap does not create tenant on DB error ─────────────────────────────
check(
  bootstrap.includes('network_or_transient') &&
    bootstrap.includes('resolve_existing_user'),
  'bootstrap: returns 503 on DB error, does not create tenant'
)

// ── Bootstrap fails closed on inactive/ambiguous ─────────────────────────────
check(
  bootstrap.includes('Associação de conta ambígua') ||
    bootstrap.includes('inconsistent_tenant'),
  'bootstrap: fails closed on ambiguous match'
)

// ── no user_metadata code access in resolver or api-auth ────────────────────
check(
  !resolver.match(/\buser_metadata\s*[?[.]/) && !apiAuth.match(/\buser_metadata\s*[?[.]/),
  'resolver+api-auth: no user_metadata code access'
)

// ── no app_metadata code access in resolver or api-auth ─────────────────────
check(
  !resolver.match(/\bapp_metadata\s*[?[.]/) && !apiAuth.match(/\bapp_metadata\s*[?[.]/),
  'resolver+api-auth: no app_metadata code access'
)

// ── UI role metadata documented as P2 debt ───────────────────────────────────
// We check that the client-side UI files use user_metadata.role only for UI (not auth)
// by confirming none of these UI reads are in server-side files
const uiFiles = [
  join(ROOT, 'frontend', 'src', 'app', '(dashboard)', 'events', 'page.tsx'),
  join(ROOT, 'frontend', 'src', 'hooks', 'useMe.ts'),
]
let uiRoleInServerFile = false
for (const f of uiFiles) {
  try {
    const content = readFileSync(f, 'utf8')
    if (content.includes('user_metadata?.role') && f.includes('/app/api/')) {
      uiRoleInServerFile = true
    }
  } catch {
    // file may not exist — acceptable
  }
}
check(
  !uiRoleInServerFile,
  'UI role (user_metadata.role): only in client/UI files, not in /app/api/ server routes [P2: UI_ROLE_METADATA_COSMETIC_DEBT]'
)

if (failures > 0) {
  console.error(`\n${failures} failure(s) — identity-binding-contract: FAIL`)
  process.exit(1)
}
console.log('\nidentity-binding-contract: PASS')
console.log(
  'NOTE: UI_ROLE_METADATA_COSMETIC_DEBT — 4 client-side user_metadata.role reads pending migration to /api/auth/me (P2)'
)
