import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { evaluateAuthSettings, inspectAuthSettings } from '../tools/audit-supabase-auth-policy.mjs'

const safe = {
  disable_signup: true,
  mailer_autoconfirm: false,
  external: { email: true },
}
const URL = 'https://vbdpweliprcsktyxodss.supabase.co'
const KEY = 'fixture-public-key-do-not-use'
const response = (json, status=200) => ({ ok: status >= 200 && status < 300, json: async () => json })

test('admin-only signup configuration is accepted', () => {
  assert.deepEqual(evaluateAuthSettings(safe), { ok: true, findings: [] })
})

test('current observed bypass is detected independently of email confirmation', () => {
  assert.deepEqual(evaluateAuthSettings({ ...safe, disable_signup: false }), {
    ok: false,
    findings: ['DIRECT_AUTH_SIGNUP_ALLOWED'],
  })
})

test('turning off email provider fails closed to protect existing sign-in', () => {
  assert.deepEqual(evaluateAuthSettings({ ...safe, external: { email: false } }), {
    ok: false,
    findings: ['EMAIL_SIGNIN_PROVIDER_NOT_ENABLED'],
  })
})

test('email autoconfirm cannot silently be enabled', () => {
  assert.deepEqual(evaluateAuthSettings({ ...safe, mailer_autoconfirm: true }), {
    ok: false,
    findings: ['EMAIL_CONFIRMATION_NOT_REQUIRED'],
  })
})

test('missing fields fail closed, including unexpected provider responses', () => {
  assert.equal(evaluateAuthSettings(null).ok, false)
  assert.equal(evaluateAuthSettings({}).findings.length, 3)
  assert.equal(evaluateAuthSettings([]).findings[0], 'MALFORMED_AUTH_SETTINGS')
})

test('audit is GET-only, no redirect, and uses public apikey without service role', async () => {
  let calls = 0
  const output = await inspectAuthSettings({
    supabaseUrl: URL,
    anonKey: KEY,
    fetchImpl: async (url, options) => {
      calls += 1
      assert.equal(String(url), URL + '/auth/v1/settings')
      assert.equal(options.method, 'GET')
      assert.deepEqual(options.headers, { apikey: KEY })
      assert.equal(options.redirect, 'error')
      assert.equal(options.cache, 'no-store')
      assert.ok(options.signal)
      return response(safe)
    },
  })
  assert.equal(calls, 1)
  assert.equal(output.ok, true)
})

test('rejects HTTP hosts and external domains before sending a key', async () => {
  let calls = 0
  for (const host of ['http://vbdpweliprcsktyxodss.supabase.co',
    'https://evil.example', 'https://vbdpweliprcsktyxodss.supabase.co.evil.example',
    'https://vbdpweliprcsktyxodss.supabase.co/redirect',
    'https://user:pass@vbdpweliprcsktyxodss.supabase.co']) {
    await assert.rejects(inspectAuthSettings({
      supabaseUrl: host, anonKey: KEY,
      fetchImpl: async () => { calls++; return response(safe) },
    }), /INVALID_SUPABASE_HOST/)
  }
  assert.equal(calls, 0)
})

test('missing key fails without contacting a network', async () => {
  let calls = 0
  await assert.rejects(inspectAuthSettings({ supabaseUrl: URL, anonKey: '',
    fetchImpl: async () => { calls++; return response(safe) },
  }), /MISSING_PUBLIC_AUTH_KEY/)
  assert.equal(calls, 0)
})

test('provider HTTP failure cannot leak response bodies or credential values', async () => {
  await assert.rejects(inspectAuthSettings({
    supabaseUrl: URL, anonKey: KEY,
    fetchImpl: async () => response({ secret: 'do-not-print' }, 401),
  }), (error) => error.message === 'AUTH_SETTINGS_HTTP_FAILURE')
})

test('unexpected network errors do not reveal exception details', async () => {
  await assert.rejects(inspectAuthSettings({
    supabaseUrl: URL, anonKey: KEY,
    fetchImpl: async () => { throw new Error(KEY + ' do-not-print') },
  }), (error) => error.message === 'AUTH_SETTINGS_UNREACHABLE')
})

test('invalid provider JSON fails without returning raw data', async () => {
  await assert.rejects(inspectAuthSettings({
    supabaseUrl: URL, anonKey: KEY,
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('private') } }),
  }), (error) => error.message === 'AUTH_SETTINGS_INVALID_JSON')
})
