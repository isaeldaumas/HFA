import assert from 'node:assert/strict'
import test from 'node:test'
import { isPasswordRecoveryEvent, verifyPasswordRecoveryCallback } from '../src/lib/auth-recovery-session'

function fakeAuth(options: { session?: unknown; exchanged?: unknown; exchangeError?: boolean; sessionError?: boolean } = {}) {
  const calls: string[] = []
  const auth = {
    getSession: async () => {
      calls.push('session')
      return { data: { session: options.session ?? null }, error: options.sessionError ? { status: 401 } : null }
    },
    exchangeCodeForSession: async (code: string) => {
      calls.push('exchange:' + code)
      return { data: { session: options.exchanged ?? null }, error: options.exchangeError ? { status: 400 } : null }
    },
  }
  return { auth, calls }
}

const base = 'https://hfa.example.invalid/update-password'

test('valid implicit recovery token is accepted only with an authenticated session', async () => {
  const f = fakeAuth({ session: { user: { id: 'synthetic' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '#access_token=synthetic&refresh_token=synthetic&type=recovery'), true)
  assert.deepEqual(f.calls, ['session'])
})

test('plain authenticated session is not a password recovery authorization', async () => {
  const f = fakeAuth({ session: { user: { id: 'synthetic' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base), false)
  assert.deepEqual(f.calls, [])
})

test('forged recovery type without tokens never uses existing session', async () => {
  const f = fakeAuth({ session: { user: { id: 'synthetic' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '#type=recovery'), false)
  assert.deepEqual(f.calls, [])
})

test('other implicit token types are rejected even if the account has an active session', async () => {
  const f = fakeAuth({ session: { user: { id: 'synthetic' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '#access_token=synthetic&refresh_token=synthetic&type=signup'), false)
  assert.deepEqual(f.calls, [])
})

test('PKCE exchange success allows recovery without accepting a preexisting session', async () => {
  const f = fakeAuth({ exchanged: { user: { id: 'synthetic' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '?code=synthetic-code'), true)
  assert.deepEqual(f.calls, ['exchange:synthetic-code'])
})

test('PKCE exchange failure never falls back to an existing session', async () => {
  const f = fakeAuth({ session: { user: { id: 'other' } }, exchangeError: true })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '?code=invalid-code'), false)
  assert.deepEqual(f.calls, ['exchange:invalid-code'])
})

test('expired recovery link does not accept a different existing session', async () => {
  const f = fakeAuth({ session: { user: { id: 'other' } } })
  assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '?error=access_denied&error_code=otp_expired#access_token=synthetic&refresh_token=synthetic&type=recovery'), false)
  assert.deepEqual(f.calls, [])
})

test('implicit callback refuses absent or rejected session', async () => {
  for (const options of [{}, { session: { user: { id: 'synthetic' } }, sessionError: true }]) {
    const f = fakeAuth(options)
    assert.equal(await verifyPasswordRecoveryCallback(f.auth, base + '#access_token=synthetic&refresh_token=synthetic&type=recovery'), false)
  }
})

test('PASSWORD_RECOVERY is the only event granting eligibility', () => {
  assert.equal(isPasswordRecoveryEvent('PASSWORD_RECOVERY', { user: { id: 'synthetic' } }), true)
  assert.equal(isPasswordRecoveryEvent('SIGNED_IN', { user: { id: 'synthetic' } }), false)
  assert.equal(isPasswordRecoveryEvent('INITIAL_SESSION', { user: { id: 'synthetic' } }), false)
  assert.equal(isPasswordRecoveryEvent('PASSWORD_RECOVERY', null), false)
})
