import assert from 'node:assert/strict'
import test from 'node:test'
import { handleAdminPasswordResetRequest } from '../src/lib/server/password-reset-handler'

type Flags = {
  unauthorized?: boolean
  email?: string | null
  lookupError?: boolean
  providerError?: boolean
  providerThrows?: boolean
}

function fixture(flags: Flags = {}) {
  const calls: string[] = []
  const admin = {
    from: (table: string) => {
      assert.equal(table, 'system_settings')
      return {
        select: (column: string) => {
          assert.equal(column, 'value')
          return {
            eq: (key: string, value: string) => {
              assert.equal(key, 'key')
              assert.equal(value, 'admin_email')
              return {
                maybeSingle: async () => {
                  calls.push('settings.lookup')
                  return flags.lookupError
                    ? { data: null, error: { message: 'private-postgres-issue' } }
                    : { data: { value: flags.email === undefined ? 'hfa-admin@example.invalid' : flags.email }, error: null }
                },
              }
            },
          }
        },
      }
    },
    auth: {
      admin: {
        generateLink: async () => { throw new Error('GENERATELINK_MUST_NOT_BE_CALLED') },
      },
      resetPasswordForEmail: async (email: string, options: { redirectTo: string }) => {
        calls.push('auth.recover')
        assert.equal(email, 'hfa-admin@example.invalid')
        assert.equal(options.redirectTo, 'https://hfa.example.invalid/update-password')
        if (flags.providerThrows) throw new Error('sensitive_provider_exception')
        return { data: {}, error: flags.providerError
          ? { code: 'email_provider_disabled', status: 429, message: 'private SMTP details' }
          : null }
      },
    },
  }
  return { admin, calls }
}

const request = (body: Record<string, unknown> = {}) =>
  new Request('https://hfa.example.invalid/api/admin/settings/password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

async function invoke(
  flags: Flags = {},
  body: Record<string, unknown> = { email: 'hfa-admin@example.invalid' },
  siteUrl: string | null = 'https://hfa.example.invalid/',
) {
  const f = fixture(flags)
  const result = await handleAdminPasswordResetRequest(request(body), {
    authorize: async () => {
      f.calls.push('admin.authorize')
      if (flags.unauthorized) throw new Response(JSON.stringify({ detail: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } })
    },
    getAdmin: () => f.admin as never,
    siteUrl,
  })
  return { ...f, status: result.status, body: await result.json() as Record<string, unknown> }
}

test('admin recovery actually invokes Auth email request rather than generateLink', async () => {
  const r = await invoke()
  assert.equal(r.status, 200)
  assert.deepEqual(r.calls, ['admin.authorize', 'settings.lookup', 'auth.recover'])
  assert.deepEqual(r.body, { ok: true, request_accepted: true, delivery_confirmed: false })
  assert.doesNotMatch(JSON.stringify(r.body), /token|action_link|password|admin@example/i)
})

test('unauthorized user never reads email or requests reset', async () => {
  const r = await invoke({ unauthorized: true })
  assert.equal(r.status, 403)
  assert.deepEqual(r.calls, ['admin.authorize'])
})

test('missing canonical public site URL fails closed', async () => {
  const r = await invoke({}, {}, null)
  assert.equal(r.status, 503)
  assert.deepEqual(r.calls, ['admin.authorize'])
})

test('host-controlled redirect URL over HTTP is rejected', async () => {
  const r = await invoke({}, {}, 'http://hfa.example.invalid')
  assert.equal(r.status, 503)
  assert.deepEqual(r.calls, ['admin.authorize'])
})

test('redirect URL with credentials, query or path is rejected', async () => {
  for (const u of [
    'https://username:password@hfa.example.invalid',
    'https://hfa.example.invalid/path',
    'https://hfa.example.invalid/?next=https://evil.example.invalid',
  ]) {
    const r = await invoke({}, {}, u)
    assert.equal(r.status, 503)
    assert.deepEqual(r.calls, ['admin.authorize'])
  }
})

test('admin email must be stored and valid', async () => {
  for (const email of [null, '', 'broken.email']) {
    const r = await invoke({ email })
    assert.equal(r.status, 400)
    assert.deepEqual(r.calls, ['admin.authorize', 'settings.lookup'])
  }
})

test('lookup failures do not request recovery', async () => {
  const r = await invoke({ lookupError: true })
  assert.equal(r.status, 503)
  assert.deepEqual(r.calls, ['admin.authorize', 'settings.lookup'])
  assert.doesNotMatch(JSON.stringify(r.body), /private-postgres-issue/)
})

test('stale or altered destination is rejected rather than used', async () => {
  const r = await invoke({}, { email: 'someone-else@example.invalid' })
  assert.equal(r.status, 409)
  assert.deepEqual(r.calls, ['admin.authorize', 'settings.lookup'])
})

test('body omitted is safe: only configured server-side admin email is used', async () => {
  const r = await invoke({}, {})
  assert.equal(r.status, 200)
  assert.equal(r.calls.at(-1), 'auth.recover')
})

test('provider error is not claimed as mail success and does not leak details', async () => {
  const r = await invoke({ providerError: true })
  assert.equal(r.status, 502)
  assert.equal(r.body.request_accepted, undefined)
  assert.doesNotMatch(JSON.stringify(r.body), /private SMTP details/)
})

test('provider network exception does not become success or expose exception message', async () => {
  const r = await invoke({ providerThrows: true })
  assert.equal(r.status, 500)
  assert.equal(r.body.request_accepted, undefined)
  assert.doesNotMatch(JSON.stringify(r.body), /sensitive_provider_exception/)
})
