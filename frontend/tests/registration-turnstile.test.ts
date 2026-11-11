import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyRegistrationTurnstile } from '../src/lib/server/registration-turnstile'

const site = 'https://hfa.example.invalid'
const secret = 'synthetic-test-secret'

function fakeVerify(payload: unknown, status = 200): typeof fetch {
  return (async (_url: unknown, options: RequestInit = {}) => {
    assert.equal(options.method, 'POST')
    assert.equal(options.cache, 'no-store')
    const fields = new URLSearchParams(options.body as string)
    assert.equal(fields.get('secret'), secret)
    assert.equal(fields.get('response'), 'synthetic-test-token')
    return Response.json(payload, { status })
  }) as typeof fetch
}

test('accepts a siteverify success only for the expected hostname', async () => {
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    fakeVerify({ success: true, hostname: 'hfa.example.invalid' })), true)
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    fakeVerify({ success: true, hostname: 'wrong.example.invalid' })), false)
})

test('challenge errors, invalid tokens, unavailable service and malformed responses fail closed', async () => {
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    fakeVerify({ success: false, hostname: 'hfa.example.invalid' })), false)
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    fakeVerify({ success: true, hostname: 'hfa.example.invalid' }, 500)), false)
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    (async () => { throw Error('network unavailable') }) as typeof fetch), false)
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, secret,
    fakeVerify('malformed')), false)
  assert.equal(await verifyRegistrationTurnstile('', site, secret, fakeVerify({ success: true })), false)
  assert.equal(await verifyRegistrationTurnstile('t'.repeat(2049), site, secret,
    fakeVerify({ success: true })), false)
  assert.equal(await verifyRegistrationTurnstile('synthetic-test-token', site, '',
    fakeVerify({ success: true })), false)
})
