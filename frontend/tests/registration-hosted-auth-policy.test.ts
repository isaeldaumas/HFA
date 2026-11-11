import assert from 'node:assert/strict'
import test from 'node:test'
import { isHostedAuthSignupLocked } from '../src/lib/server/registration-hosted-auth-policy'

const URL = 'https://vbdpweliprcsktyxodss.supabase.co'
const PUB = 'synthetic-public-test-key'
const safe = { disable_signup: true, mailer_autoconfirm: false, external: { email: true } }

function mockedFetch(value: unknown, status = 200): typeof fetch {
  return (async (url: unknown, opts: RequestInit = {}) => {
    assert.equal(String(url), URL + '/auth/v1/settings')
    assert.equal(opts.method, 'GET')
    assert.equal(opts.redirect, 'error')
    assert.equal(opts.cache, 'no-store')
    assert.equal((opts.headers as Record<string,string>).apikey, PUB)
    assert.ok(opts.signal)
    return Response.json(value, { status })
  }) as typeof fetch
}

test('only hosted signup-disabled, email-confirmed, email-enabled configuration is accepted', async () => {
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch(safe)), true)
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch({ ...safe, disable_signup: false })), false)
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch({ ...safe, mailer_autoconfirm: true })), false)
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch({ ...safe, external: { email: false } })), false)
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch({})), false)
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, mockedFetch(safe, 500)), false)
})

test('malicious URLs and missing key fail before network fetch', async () => {
  let calls = 0
  const fake = (async () => { calls++; return Response.json(safe) }) as typeof fetch
  for (const url of ['https://supabase.co.evil.invalid', 'http://vbdpweliprcsktyxodss.supabase.co',
    'https://user:pass@vbdpweliprcsktyxodss.supabase.co', 'https://vbdpweliprcsktyxodss.supabase.co/path',
    'https://vbdpweliprcsktyxodss.supabase.co:8443', '']) {
    assert.equal(await isHostedAuthSignupLocked(url, PUB, fake), false)
  }
  assert.equal(await isHostedAuthSignupLocked(URL, '', fake), false)
  assert.equal(calls, 0)
})

test('provider/network failure fails closed without logging settings or keys', async () => {
  assert.equal(await isHostedAuthSignupLocked(URL, PUB, (async () => {
    throw Error('secret in network message')
  }) as typeof fetch), false)
})
