import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ensurePublicUserRow } from '../../../frontend/src/lib/server/tenant-user'
import type { ApiUserContext } from '../../../frontend/src/lib/server/api-auth'

const AUTH = '10000000-aaaa-4000-a000-000000000001'
const PUBLIC = '30000000-cccc-4000-a000-000000000003'
const TENANT = '40000000-dddd-4000-a000-000000000004'
const OTHER_TENANT = '50000000-eeee-4000-a000-000000000005'
const OTHER_AUTH = '20000000-bbbb-4000-b000-000000000002'
const EMAIL = 'synthetic@example.invalid'

type MockRow = {
  id: string
  tenant_id: string
  auth_user_id: string | null
  role: string
  is_active: boolean
  email: string
}

function context(overrides: Partial<ApiUserContext> = {}): ApiUserContext {
  return {
    authUserId: AUTH,
    publicUserId: PUBLIC,
    userId: AUTH,
    email: EMAIL,
    tenantId: TENANT,
    role: 'admin',
    accessToken: 'test-only-validated-token',
    identityBinding: 'EXPLICIT_AUTH_LINK',
    ...overrides,
  }
}

function row(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: PUBLIC,
    tenant_id: TENANT,
    auth_user_id: AUTH,
    role: 'admin',
    is_active: true,
    email: EMAIL,
    ...overrides,
  }
}

function mockAdmin(rows: MockRow[], options: { error?: boolean } = {}) {
  const calls: Array<{ table: string; fields: string; conditions: Record<string, string> }> = []
  const builder = {
    fields: '',
    conditions: {} as Record<string, string>,
    select(fields: string) { this.fields = fields; return this },
    eq(field: string, value: string) { this.conditions[field] = value; return this },
    async maybeSingle() {
      calls.push({ table: 'users', fields: this.fields, conditions: { ...this.conditions } })
      if (options.error) return { data: null, error: { message: 'synthetic failure' } }
      return { data: rows.find(r =>
        Object.entries(this.conditions).every(([field, value]) =>
          r[field as keyof MockRow] === value)) ?? null, error: null }
    },
  }
  const client = {
    from(table: string) {
      assert.equal(table, 'users')
      return { ...builder, conditions: {} }
    },
  }
  return { client: client as never, calls }
}

test('resolves only a DB-confirmed explicit Auth link in the correct tenant', async () => {
  const db = mockAdmin([row()])
  assert.equal(await ensurePublicUserRow(db.client, context()), PUBLIC)
  assert.deepEqual(db.calls[0].conditions, { id: PUBLIC, tenant_id: TENANT })
  assert.ok(db.calls[0].fields.includes('auth_user_id'))
})

test('direct Auth ID is accepted only for its matching public row', async () => {
  const db = mockAdmin([row({ id: AUTH })])
  const result = await ensurePublicUserRow(db.client,
    context({ publicUserId: AUTH, identityBinding: 'DIRECT_AUTH_ID' }))
  assert.equal(result, AUTH)
})

test('a direct-bound role may not be reinterpreted as explicit-bound identity', async () => {
  const db = mockAdmin([row()])
  await assert.rejects(
    ensurePublicUserRow(db.client, context({ identityBinding: 'DIRECT_AUTH_ID' })),
    /PUBLIC_USER_BINDING_CONFLICT/,
  )
})

test('cross-tenant rows are denied without any fallback', async () => {
  const db = mockAdmin([row({ tenant_id: OTHER_TENANT })])
  await assert.rejects(ensurePublicUserRow(db.client, context()),
    /PUBLIC_USER_BINDING_INVALID/)
  assert.equal(db.calls.length, 1)
})

test('inactive and role-changed rows are denied before writing', async () => {
  for (const bad of [{ is_active: false }, { role: 'viewer' }]) {
    const db = mockAdmin([row(bad)])
    await assert.rejects(ensurePublicUserRow(db.client, context()),
      /PUBLIC_USER_BINDING_INVALID/)
  }
})

test('conflicting auth_user_id cannot impersonate a public user', async () => {
  const db = mockAdmin([row({ auth_user_id: OTHER_AUTH })])
  await assert.rejects(ensurePublicUserRow(db.client, context()),
    /PUBLIC_USER_BINDING_CONFLICT/)
})

test('confirmed legacy binding is limited to its unique, unbound and matching row', async () => {
  const db = mockAdmin([row({ auth_user_id: null })])
  assert.equal(await ensurePublicUserRow(db.client, context({
    identityBinding: 'LEGACY_CONFIRMED_EMAIL',
  })), PUBLIC)
})

test('legacy email fallback fails on another email or an explicitly bound row', async () => {
  for (const altered of [row({ auth_user_id: null, email: 'other@example.invalid' }),
    row({ auth_user_id: AUTH })]) {
    const db = mockAdmin([altered])
    await assert.rejects(ensurePublicUserRow(db.client, context({
      identityBinding: 'LEGACY_CONFIRMED_EMAIL',
    })), /PUBLIC_USER_BINDING_CONFLICT/)
  }
})

test('unrecognized identity binding and missing user context fail closed', async () => {
  const db = mockAdmin([row()])
  await assert.rejects(ensurePublicUserRow(db.client, context({
    identityBinding: 'unknown' as never,
  })), /PUBLIC_USER_BINDING_INVALID/)
  await assert.rejects(ensurePublicUserRow(db.client,
    context({ publicUserId: '' })), /PUBLIC_USER_BINDING_MISSING/)
})

test('DB lookup errors are distinct from missing identity; no writes follow', async () => {
  const db = mockAdmin([], { error: true })
  await assert.rejects(ensurePublicUserRow(db.client, context()),
    /PUBLIC_USER_BINDING_LOOKUP_FAILED/)
})

test('all write callers use authoritative user context and no email-based enrollment', () => {
  const repoRoot = resolve(__dirname, '../../..')
  const paths = [
    'frontend/src/app/api/events/route.ts',
    'frontend/src/app/api/analyze/route.ts',
    'frontend/src/app/api/events/[eventId]/risk/route.ts',
    'frontend/src/app/api/events/[eventId]/triage/route.ts',
    'frontend/src/app/api/events/[eventId]/clarifications/route.ts',
    'frontend/src/app/api/sera/analyses/[analysisId]/pdf/route.ts',
    'frontend/src/lib/sera-vnext-product/api-handlers.ts',
  ]
  for (const path of paths) {
    const code = readFileSync(resolve(repoRoot, path), 'utf8')
    assert.ok(code.includes('ensurePublicUserRow('), 'Missing canonical identity use in ' + path)
    assert.ok(!code.includes('ensurePublicUserRow(admin, user.tenantId'),
      'Legacy user-reprovisioning call remains in ' + path)
  }
  const helper = readFileSync(resolve(repoRoot, 'frontend/src/lib/server/tenant-user.ts'), 'utf8')
  const identitySection = helper.split('export async function debitCreditForEvent')[0]
  assert.ok(!identitySection.includes(".eq('email'"))
  assert.ok(!identitySection.includes(".insert("))
  assert.ok(!identitySection.includes('is_active: true'))
})

test('auth/me and tenant-admin verification are restricted to resolved tenant and fail on missing row', () => {
  const root = resolve(__dirname, '../../..')
  for (const path of [
    'frontend/src/app/api/auth/me/route.ts',
    'frontend/src/lib/server/admin-auth.ts',
  ]) {
    const code = readFileSync(resolve(root, path), 'utf8')
    assert.match(code, /\.eq\('tenant_id', user\.tenantId\)/)
    assert.match(code, /userRow\.error|userRes\.error/)
    assert.match(code, /!userRow\.data|!userRes\.data/)
  }
})
