import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  consumeRegistrationBudget,
  registrationBudgetKey,
} from '../src/lib/server/registration-distributed-limit'

const secret = 'synthetic-32-character-HFA-HMAC-secret-for-testing-only'
const email = 'pilot+test@invalid.example'

test('secret and scope-bound email token is deterministic and never contains PII', () => {
  const hour = registrationBudgetKey(email, 'hour', secret)
  const normalized = registrationBudgetKey(' PILOT+TEST@INVALID.EXAMPLE ', 'hour', secret)
  const day = registrationBudgetKey(email, 'day', secret)
  assert.match(hour ?? '', /^[0-9a-f]{64}$/)
  assert.equal(hour, normalized)
  assert.notEqual(hour, day)
  assert.notEqual(hour, registrationBudgetKey(email, 'hour', secret + '-different'))
  assert.equal(hour?.includes('pilot'), false)
})

test('weak or absent secrets and malformed addresses are rejected before database requests', () => {
  assert.equal(registrationBudgetKey(email, 'hour', ''), null)
  assert.equal(registrationBudgetKey(email, 'hour', 'short'), null)
  assert.equal(registrationBudgetKey('', 'hour', secret), null)
  assert.equal(registrationBudgetKey('a'.repeat(255) + '@x.org', 'hour', secret), null)
  assert.equal(registrationBudgetKey(email, 'hour', 'a'.repeat(513)), null)
})

function fakeAdmin(sequence: Array<boolean | {error: string} | 'throw'>) {
  const calls: Array<{fn: string; params: Record<string, unknown>}> = []
  const rpc = async (fn: string, params: Record<string, unknown>) => {
    calls.push({fn, params})
    const next = sequence.shift()
    if (next === 'throw') throw new Error('Synthetic database offline')
    if (typeof next === 'boolean') return {data: next, error: null}
    return {data: null, error: {code: 'DB_UNAVAILABLE'}}
  }
  return {client: {rpc} as unknown as SupabaseClient, calls}
}

test('atomic hourly/day budgets require exactly two successful RPC responses', async () => {
  const {client, calls} = fakeAdmin([true, true])
  assert.equal(await consumeRegistrationBudget(client, email, secret), 'allowed')
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(c => [c.fn, c.params.p_max_attempts, c.params.p_window_seconds]), [
    ['hfa_registration_rate_limit_consume', 3, 3600],
    ['hfa_registration_rate_limit_consume', 8, 86400],
  ])
  assert.ok(calls.every(c => /^[0-9a-f]{64}$/.test(String(c.params.p_token_hash))))
  assert.notEqual(calls[0].params.p_token_hash, calls[1].params.p_token_hash)
})

test('throttling and database errors stop before later RPCs or any tenant writes', async () => {
  for (const [sequence, expected, maxCalls] of [
    [[false], 'limited', 1],
    [[true, false], 'limited', 2],
    [[{error: 'db'}], 'unavailable', 1],
    [['throw'], 'unavailable', 1],
  ] as const) {
    const {client,calls} = fakeAdmin([...sequence] as Array<boolean | {error:string} | 'throw'>)
    assert.equal(await consumeRegistrationBudget(client, email, secret), expected)
    assert.equal(calls.length, maxCalls)
  }
  const {client,calls} = fakeAdmin([true,true])
  assert.equal(await consumeRegistrationBudget(client, email, 'weak'), 'unavailable')
  assert.equal(calls.length, 0)
})
