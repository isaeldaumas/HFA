import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { handleRegisterRequest } from '../src/lib/server/register-handler'

type Flags = {
  userInsertFailure?: boolean
  createAuthFailure?: boolean
  deleteAuthFailure?: boolean
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
        createUser: async (attributes: { email: string; password: string }) => {
          calls.push('auth.createUser')
          calls.push('auth.email:' + attributes.email)
          if (flags.createAuthThrows) throw new Error('Simulated auth network crash')
          if (flags.duplicateAuth) return {
            data: { user: null },
            error: { code: 'email_exists', status: 422, message: 'User already registered' },
          }
          return flags.createAuthFailure
            ? { data: { user: null }, error: { message: 'Auth unavailable' } }
            : { data: { user: { id: 'auth-user-001' } }, error: null }
        },
        deleteUser: async (userId: string) => {
          calls.push('auth.deleteUser:' + userId)
          return { error: flags.deleteAuthFailure ? { message: 'Auth delete failed' } : null }
        },
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
  password: 'Just4FixtureOnly!',
  company_name: 'Fictitious Aviation',
  slug: 'fictitious-aviation',
}

async function invoke(flags: Flags = {}, body = validBody) {
  const fixture = fakeAdmin(flags)
  // Dependency injection prevents any network or production database operation.
  const result = await handleRegisterRequest(req(body), {
    createAdminClient: () => fixture.admin as never,
  })
  return { ...fixture, status: result.status, body: await result.json() as Record<string, unknown> }
}

const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.invalid'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'definitely-not-a-real-secret'

test('successful signup only acknowledges after public users insert', async () => {
    const result = await invoke()
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.tenant_id, 'tenant-001')
    assert.deepEqual(result.calls, ['tenants.insert','auth.createUser','auth.email:hfa-test-registered@example.invalid','users.insert'])
  })

  test('public users insert failure returns 500 and cleans auth then tenant', async () => {
    const result = await invoke({ userInsertFailure: true })
    assert.equal(result.status, 500)
    assert.equal(result.body.ok, undefined)
    assert.match(String(result.body.detail), /Tente novamente/)
    assert.deepEqual(result.calls, [
      'tenants.insert','auth.createUser','auth.email:hfa-test-registered@example.invalid','users.insert',
      'auth.deleteUser:auth-user-001','tenants.delete:id:tenant-001',
    ])
  })

  test('auth cleanup failure preserves provisional tenant for support reconciliation', async () => {
    const result = await invoke({ userInsertFailure: true, deleteAuthFailure: true })
    assert.equal(result.status, 500)
    assert.match(String(result.body.detail), /suporte/)
    assert.equal(result.calls.at(-1), 'auth.deleteUser:auth-user-001')
    assert.ok(!result.calls.some(c => c.startsWith('tenants.delete:')),
      'Deleting the tenant while Auth identity remains would orphan an account')
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

  test('unexpected public user API exception cleans auth and tenant', async () => {
    const result = await invoke({ userInsertThrows: true })
    assert.equal(result.status, 500)
    assert.equal(result.body.ok, undefined)
    assert.deepEqual(result.calls.slice(-3), [
      'users.insert',
      'auth.deleteUser:auth-user-001',
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
    assert.ok(result.calls.includes('auth.createUser'))
    assert.equal(result.calls.at(-1), 'tenants.delete:id:tenant-001')
    assert.ok(!result.calls.includes('users.insert'))
    assert.ok(!result.calls.some(c => c.startsWith('auth.deleteUser:')))
  })

  test('email normalization happens before Auth persistence', async () => {
    const result = await invoke({}, { ...validBody, email: '  HFA-Test-Registered@EXAMPLE.INVALID  ' })
    assert.equal(result.status, 200)
    assert.ok(result.calls.includes('auth.email:hfa-test-registered@example.invalid'))
  })

  test('number-valued password rejected before any database call', async () => {
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

  test('oversized password rejected before any database call', async () => {
    const result = await invoke({}, { ...validBody, password: 'p'.repeat(1200) })
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
    assert.ok(!result.calls.includes('auth.createUser'))
    assert.equal(result.body.ok, undefined)
  })

// Reset process when test runner finishes; isolated CI process.
after(() => {
  if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
  else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl
  if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey
})
