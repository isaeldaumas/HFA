/**
 * Non-network security regression for cross-tenant global administrative routes.
 * Explicitly does NOT claim complete authentication or live Supabase E2E.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isPlatformAdminAuthorized } from '../../../frontend/src/lib/server/platform-admin-authority'

const ROOT = path.resolve(__dirname, '../../..')
const GLOBAL_ROUTES = [
  'ai/test/route.ts', 'packages/route.ts', 'packages/[id]/route.ts',
  'payments/transactions/route.ts', 'settings/route.ts', 'settings/password-reset/route.ts',
  'stats/route.ts', 'tenants/route.ts', 'tenants/[id]/route.ts',
]
const OP = '489d4eca-0e89-4adf-80ba-6a16c74d3201'
const CUSTOMER_ADMIN = 'b5ecab49-2d1b-43bf-80aa-88f58b738910'
const check = (authUserId: string, allowlistedAuthUserIds: string | undefined, role = 'admin') =>
  isPlatformAdminAuthorized({ authUserId, role, allowlistedAuthUserIds })

assert.equal(check(CUSTOMER_ADMIN, undefined), false, 'UNCONFIGURED_PLATFORM_ACCESS_MUST_FAIL_CLOSED')
assert.equal(check(CUSTOMER_ADMIN, ''), false, 'EMPTY_PLATFORM_ACCESS_MUST_FAIL_CLOSED')
assert.equal(check(CUSTOMER_ADMIN, OP), false, 'TENANT_ADMIN_NOT_PLATFORM_ADMIN')
assert.equal(check(CUSTOMER_ADMIN, OP + ',malformed'), false, 'MALFORMED_LIST_FAIL_CLOSED')
assert.equal(check(OP, OP + ',' + OP), false, 'DUPLICATE_LIST_FAIL_CLOSED')
assert.equal(check(OP, OP, 'viewer'), false)
assert.equal(check(OP, OP, 'analyst'), false)
assert.equal(check(OP, OP), true)
assert.equal(check(OP.toUpperCase(), OP), true)
assert.equal(check(OP, '  ' + CUSTOMER_ADMIN + ', ' + OP), true)
assert.equal(check('attacker-unsafe-id', OP), false)

const auth = readFileSync(path.join(ROOT,'frontend/src/lib/server/admin-auth.ts'), 'utf8')
assert.match(auth, /const user = await requireAdmin\(req\)/)
assert.match(auth, /authUserId:\s*user\.authUserId/)
assert.match(auth, /process\.env\.HFA_PLATFORM_ADMIN_AUTH_USER_IDS/)
assert.ok(!auth.includes('user_metadata'))

for (const route of GLOBAL_ROUTES) {
  const src = readFileSync(path.join(ROOT, 'frontend/src/app/api/admin', route), 'utf8')
  assert.match(src, /import \{[^}]*requirePlatformAdmin[^}]*\} from '@\/lib\/server\/admin-auth'/)
  assert.match(src, /await requirePlatformAdmin\(req\)/)
  assert.doesNotMatch(src, /await requireAdmin\(req\)/)
}
const stillTenantScoped = readFileSync(path.join(ROOT,
  'frontend/src/app/api/admin/sera-shadow/comparisons/route.ts'), 'utf8')
assert.match(stillTenantScoped, /requireAdmin\(req\)/)
assert.match(stillTenantScoped, /user\.tenantId/)

console.log('PLATFORM_ADMIN_FAIL_CLOSED_REGRESSION_PASS', JSON.stringify({
  protectedGlobalRoutes:GLOBAL_ROUTES.length,
  clientAdminDenied:true,
  missingAllowlistDenied:true,
  liveStagingExecuted:false,
}))
