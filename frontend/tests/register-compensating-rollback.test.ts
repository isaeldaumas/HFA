import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { readFileSync } from 'node:fs'
import { handleRegisterRequest } from '../src/lib/server/register-handler'

type Flags = {
  userInsertFailure?: boolean
  createAuthFailure?: boolean
  reusedUnconfirmedIdentity?: boolean
  deleteTenantFailure?: boolean
  createTenantFailure?: boolean
  userInsertThrows?: boolean
  createAuthThrows?: boolean
  duplicateAuth?: boolean
}

function fakeAdmin(flags: Flags = {}) {
  const calls: string[] = []
  const admin = {
    auth: {
      admin: {
        // Deliberately rejects a paginated user-list scan. Registration must
        // rely on Auth's unique-email constraint rather than a race-prone list.
        listUsers: async () => { throw new Error('Forbidden paginated listUsers') },
        createUser: async () => { throw new Error('UNVERIFIED_CREATE_USER_FORBIDDEN') },
        inviteUserByEmail: async (email: string, options: { redirectTo: string }) => {
          assert.equal(options.redirectTo, 'https://hfa.example.invalid/accept-invite')
          calls.push('auth.inviteUserByEmail')
          calls.push('auth.email:' + email)
          if (flags.createAuthThrows) throw new Error('Simulated auth network crash')
          if (flags.duplicateAuth) return {
            data: { user: null },
            error: { code: 'email_exists', status: 422, message: 'User already registered' },
          }
          return flags.createAuthFailure
            ? { data: { user: null }, error: { message: 'Auth unavailable' } }
            : { data: { user: { id: flags.reusedUnconfirmedIdentity ? 'existing-invited-user-001' : 'auth-user-001' } }, error: null }
        },
        deleteUser: async () => { throw new Error('DELETING_UNPROVEN_INVITEE_FORBIDDEN') },
      },
    },
    from: (table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => {
                calls.push('tenants.insert')
                return flags.createTenantFailure
                  ? { data: null, error: { message: 'Tenant insert failed' } }
                  : { data: { id: 'tenant-001' }, error: null }
              },
            }),
          }),
          delete: () => ({
            eq: async (field: string, id: string) => {
              calls.push('tenants.delete:' + field + ':' + id)
              return { error: flags.deleteTenantFailure ? { message: 'Tenant delete failed' } : null }
            },
          }),
        }
      }
      if (table === 'users') {
        return {
          insert: async () => {
            calls.push('users.insert')
            if (flags.userInsertThrows) throw new Error('Simulated database connection failure')
            return { error: flags.userInsertFailure ? { code: '23505', message: 'Forced fixture failure' } : null }
          },
        }
      }
      throw new Error('Unexpected table: ' + table)
    },
  }
  return { admin, calls }
}

function req(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  full_name: 'Pilot Fixture',
  email: 'hfa-test-registered@example.invalid',
  company_name: 'Fictitious Aviation',
  slug: 'fictitious-aviation',
}

async function invoke(flags: Flags = {}, body = validBody) {
  const fixture = fakeAdmin(flags)
  // Dependency injection prevents any network or production database operation.
  const result = await handleRegisterRequest(req(body), {
    createAdminClient: () => fixture.admin as never,
    verifyChallenge: async () => true,
  })
  return { ...fixture, status: result.status, body: await result.json() as Record<string, unknown> }
}

const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const priorInviteReady = process.env.HFA_REGISTRATION_INVITES_READY
const priorSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'definitely-not-a-real-secret'
process.env.HFA_REGISTRATION_INVITES_READY = 'true'
process.env.NEXT_PUBLIC_SITE_URL = 'https://hfa.example.invalid'

test('successful signup only acknowledges after public users insert', async () => {
    const result = await invoke()
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.invite_requested, true)
    assert.equal(result.body.delivery_confirmed, false)
    assert.equal(result.body.tenant_id, undefined)
    assert.deepEqual(result.calls, ['tenants.insert','auth.inviteUserByEmail','auth.email:hfa-test-registered@example.invalid','users.insert'])
  })

  test('public users insert failure returns 500 and preserves invite identity while deleting provisional tenant', async () => {
    const result = await invoke({ userInsertFailure: true })
    assert.equal(result.status, 500)
    assert.equal(result.body.ok, undefined)
    assert.match(String(result.body.detail), /suporte/)
    assert.deepEqual(result.calls, [
      'tenants.insert','auth.inviteUserByEmail','auth.email:hfa-test-registered@example.invalid','users.insert',
      'tenants.delete:id:tenant-001',
    ])
  })

  test('reinvited pending Auth user is never deleted when public row insert fails', async () => {
    const result = await invoke({ userInsertFailure: true, reusedUnconfirmedIdentity: true })
    assert.equal(result.status, 500)
    assert.match(String(result.body.detail), /suporte/)
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
    assert.ok(!result.calls.some((c) => c.includes('deleteUser')))
  })

  test('tenant cleanup failure after public users failure is visible as incomplete', async () => {
    const result = await invoke({ userInsertFailure: true, deleteTenantFailure: true })
    assert.equal(result.status, 500)
    assert.match(String(result.body.detail), /suporte/)
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
  })

  test('auth creation failure cleans tenant and never inserts public user', async () => {
    const result = await invoke({ createAuthFailure: true })
    assert.equal(result.status, 400)
    assert.equal(result.body.ok, undefined)
    assert.ok(!result.calls.includes('users.insert'))
    assert.ok(!result.calls.some(c => c.startsWith('auth.deleteUser:')))
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
  })

  test('auth creation failure with failed cleanup returns 500 instead of false recovery', async () => {
    const result = await invoke({ createAuthFailure: true, deleteTenantFailure: true })
    assert.equal(result.status, 500)
    assert.match(String(result.body.detail), /suporte/)
  })

  test('unexpected public user API exception cleans provisional tenant only', async () => {
    const result = await invoke({ userInsertThrows: true })
    assert.equal(result.status, 500)
    assert.equal(result.body.ok, undefined)
    assert.deepEqual(result.calls.slice(-2), [
      'users.insert',
      'tenants.delete:id:tenant-001',
    ])
  })

  test('unexpected Auth API exception still cleans the tenant', async () => {
    const result = await invoke({ createAuthThrows: true })
    assert.equal(result.status, 500)
    assert.equal(result.body.ok, undefined)
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
    assert.ok(!result.calls.some(c => c.startsWith('auth.deleteUser:')))
  })


  test('Auth duplicate rejection returns 409 and rolls back the provisional tenant', async () => {
    const result = await invoke({ duplicateAuth: true })
    assert.equal(result.status, 409)
    assert.match(String(result.body.detail), /Já existe uma conta/)
    assert.ok(result.calls.includes('auth.inviteUserByEmail'))
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
    assert.ok(!result.calls.includes('users.insert'))
    assert.ok(!result.calls.some(c => c.startsWith('auth.deleteUser:')))
  })

  test('email normalization happens before Auth persistence', async () => {
    const result = await invoke({}, { ...validBody, email: '  HFA-Test-Registered@EXAMPLE.INVALID  ' })
    assert.equal(result.status, 200)
    assert.ok(result.calls.includes('auth.email:hfa-test-registered@example.invalid'))
  })

  test('legacy password payload rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, password: 12345 } as unknown as typeof validBody)
    assert.equal(result.status, 400)
    assert.deepEqual(result.calls, [])
  })

  test('invalid untrusted slug rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, slug: '../../other-tenant' })
    assert.equal(result.status, 400)
    assert.deepEqual(result.calls, [])
  })

  test('oversized registration rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, full_name: 'z'.repeat(9000) })
    assert.equal(result.status, 413)
    assert.deepEqual(result.calls, [])
  })

  test('invalid email format rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, email: 'not-an-email' })
    assert.equal(result.status, 400)
    assert.deepEqual(result.calls, [])
  })

  test('legacy oversized password rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, password: 'p'.repeat(1200) } as unknown as typeof validBody)
    assert.equal(result.status, 400)
    assert.deepEqual(result.calls, [])
  })

  test('malformed JSON rejected without calling Supabase', async () => {
    const fixture = fakeAdmin()
    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ this is not valid json',
    })
    const response = await handleRegisterRequest(request, {
      createAdminClient: () => fixture.admin as never,
    })
    assert.equal(response.status, 400)
    assert.deepEqual(fixture.calls, [])
  })

  test('declared oversized payload rejected before body parsing or Supabase', async () => {
    const fixture = fakeAdmin()
    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-length': '9000' },
      body: JSON.stringify(validBody),
    })
    const response = await handleRegisterRequest(request, {
      createAdminClient: () => fixture.admin as never,
    })
    assert.equal(response.status, 413)
    assert.deepEqual(fixture.calls, [])
  })

  test('large multibyte payload rejected before Supabase even with no content length', async () => {
    const result = await invoke({}, { ...validBody, full_name: 'ã'.repeat(4300) })
    assert.equal(result.status, 413)
    assert.deepEqual(result.calls, [])
  })

  test('bad registration request cannot create tenant', async () => {
    const result = await invoke({}, { ...validBody, email: '' })
    assert.equal(result.status, 400)
    assert.deepEqual(result.calls, [])
  })

  test('failed tenant creation does not create auth user or report success', async () => {
    const result = await invoke({ createTenantFailure: true })
    assert.equal(result.status, 500)
    assert.ok(!result.calls.includes('auth.inviteUserByEmail'))
    assert.equal(result.body.ok, undefined)
  })


  test('not-ready registration fails closed before tenant or Auth writes', async () => {
    delete process.env.HFA_REGISTRATION_INVITES_READY
    try {
      const r = await invoke()
      assert.equal(r.status, 503)
      assert.deepEqual(r.calls, [])
    } finally {
      process.env.HFA_REGISTRATION_INVITES_READY = 'true'
    }
  })

  test('unsafe or missing invite redirect fails closed', async () => {
    for (const siteUrl of ['', 'http://attacker.example.invalid/', 'https://user:pass@hfa.example.invalid/', 'https://hfa.example.invalid/path']) {
      process.env.NEXT_PUBLIC_SITE_URL = siteUrl
      const r = await invoke()
      assert.equal(r.status, 503)
      assert.deepEqual(r.calls, [])
    }
    process.env.NEXT_PUBLIC_SITE_URL = 'https://hfa.example.invalid'
  })

  test('invite never uses admin.createUser or auto-confirms email', async () => {
    const result = await invoke()
    assert.equal(result.status, 200)
    assert.ok(result.calls.includes('auth.inviteUserByEmail'))
    assert.ok(!result.calls.includes('auth.createUser'))
  })

test('invitation form never collects password and verifies email before allowing account activation', () => {
  const registration = readFileSync(new URL('../src/app/(auth)/register/page.tsx', import.meta.url), 'utf8')
  const acceptance = readFileSync(new URL('../src/app/(auth)/accept-invite/page.tsx', import.meta.url), 'utf8')
  const handler = readFileSync(new URL('../src/lib/server/register-handler.ts', import.meta.url), 'utf8')
  assert.equal(registration.includes('name="password"'), false)
  assert.equal(registration.includes('signInWithPassword'), false)
  assert.equal(handler.includes('email_confirm: true'), false)
  assert.equal(handler.includes('admin.auth.admin.deleteUser'), false)
  assert.match(handler, /inviteUserByEmail\(email/)
  assert.match(acceptance, /email_confirmed_at/)
  assert.match(acceptance, /supabase.auth.updateUser\(\{ password \}\)/)
  assert.match(acceptance, /signOutError/)
})

// Reset process when test runner finishes; isolated CI process.
after(() => {
  if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl
  if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey
  if (priorInviteReady === undefined) delete process.env.HFA_REGISTRATION_INVITES_READY
  else process.env.HFA_REGISTRATION_INVITES_READY = priorInviteReady
  if (priorSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
  else process.env.NEXT_PUBLIC_SITE_URL = priorSiteUrl
})


test('failed server-side anti-bot verification makes zero database calls', async () => {
  const fixture = fakeAdmin()
  const response = await handleRegisterRequest(req({ ...validBody, turnstile_token: 'invalid' }), {
    createAdminClient: () => fixture.admin as never,
    verifyChallenge: async () => false,
  })
  assert.equal(response.status, 403)
  assert.deepEqual(fixture.calls, [])
})
