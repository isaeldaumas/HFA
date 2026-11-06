import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  debitCreditForEvent,
  refundCreditForFailedAnalysis,
  HfaCreditOperationError,
} from '../../../frontend/src/lib/server/tenant-user'

const TENANT = '10000000-aaaa-4000-a000-000000000001'
const USER = '20000000-bbbb-4000-a000-000000000002'
const EVENT = '30000000-cccc-4000-a000-000000000003'
const OP = '40000000-dddd-4000-a000-000000000004'
type RpcResult = { data: Record<string, unknown> | null; error: { message: string } | null }
const expected = (state: string, idempotent = false): RpcResult => ({
  data: { state, idempotent, balance: 2, operation_id: OP },
  error: null,
})
function setup(output: RpcResult) {
  const calls: Array<{ name: string; payload: Record<string, unknown> }> = []
  const admin = {
    async rpc(name: string, payload: Record<string, unknown>) {
      calls.push({ name, payload })
      return output
    },
    from() { throw new Error('NONATOMIC_POSTGREST_WRITE_FORBIDDEN') },
  }
  const args = {
    admin: admin as never,
    tenantId: TENANT, submittedById: USER,
    eventId: EVENT, operationId: OP, title: 'Synthetic flight safety report',
  }
  return { calls, args }
}

test('debit dispatches exactly one atomic RPC with tenant actor event and attempt', async () => {
  const s = setup(expected('applied'))
  const result = await debitCreditForEvent(s.args)
  assert.deepEqual(result, { state: 'applied', idempotent: false, balance: 2, operationId: OP })
  assert.deepEqual(s.calls, [{
    name: 'hfa_apply_credit_operation_v31',
    payload: {
      p_tenant_id: TENANT, p_user_id: USER, p_event_id: EVENT,
      p_operation_id: OP, p_action: 'debit',
      p_title: 'Synthetic flight safety report',
    },
  }])
})

test('refund uses the same operation UUID and same authoritative principal', async () => {
  const s = setup(expected('refunded'))
  const result = await refundCreditForFailedAnalysis(s.args)
  assert.equal(result.state, 'refunded')
  assert.equal(s.calls.length, 1)
  assert.equal(s.calls[0].payload.p_action, 'refund')
  assert.equal(s.calls[0].payload.p_operation_id, OP)
})

test('duplicate debit is idempotent, never a second balance write', async () => {
  const s = setup(expected('already_applied', true))
  const result = await debitCreditForEvent(s.args)
  assert.equal(result.idempotent, true)
  assert.equal(s.calls.length, 1)
})

test('duplicate refund is idempotent', async () => {
  const s = setup(expected('already_refunded', true))
  assert.equal((await refundCreditForFailedAnalysis(s.args)).idempotent, true)
})

test('refunded attempt cannot be charged again', async () => {
  const s = setup(expected('already_refunded', true))
  await assert.rejects(debitCreditForEvent(s.args), (err: unknown) =>
    err instanceof HfaCreditOperationError &&
    err.code === 'HFA_CREDIT_ALREADY_REFUNDED' && err.status === 409)
})

test('debit may not receive a refund response', async () => {
  const s = setup(expected('refunded'))
  await assert.rejects(debitCreditForEvent(s.args),
    /HFA_CREDIT_RPC_INVALID_RESPONSE/)
})

test('refund may not receive a debit response', async () => {
  const s = setup(expected('applied'))
  await assert.rejects(refundCreditForFailedAnalysis(s.args),
    /HFA_CREDIT_RPC_INVALID_RESPONSE/)
})

test('unexpected or absent RPC response fails closed', async () => {
  const outputs = [
    { data: null, error: null },
    { data: { ...expected('applied').data, operation_id: EVENT }, error: null },
    { data: { ...expected('applied').data, balance: '2' }, error: null },
    { data: { ...expected('applied').data, state: 'unknown' }, error: null },
    { data: { ...expected('applied').data, idempotent: 'false' }, error: null },
  ]
  for (const output of outputs) {
    const s = setup(output as RpcResult)
    await assert.rejects(debitCreditForEvent(s.args),
      /HFA_CREDIT_RPC_INVALID_RESPONSE/)
    assert.equal(s.calls.length, 1)
  }
})

test('provider RPC errors fail closed without legacy PostgREST updates', async () => {
  const s = setup({ data: null, error: { message: 'Could not find function in schema cache' } })
  await assert.rejects(debitCreditForEvent(s.args), (err: unknown) =>
    err instanceof HfaCreditOperationError &&
    err.code === 'HFA_CREDIT_RPC_UNAVAILABLE' && err.status === 503)
  assert.equal(s.calls.length, 1)
})

test('financial denial is preserved with correct HTTP classification', async () => {
  for (const [code, status] of [
    ['HFA_CREDIT_INSUFFICIENT_BALANCE', 402],
    ['HFA_CREDIT_TRIAL_EXPIRED', 402],
    ['HFA_CREDIT_EVENT_ALREADY_CHARGED', 409],
    ['HFA_CREDIT_OPERATION_CONFLICT', 409],
    ['HFA_CREDIT_EVENT_NOT_AUTHORIZED', 403],
    ['HFA_CREDIT_TENANT_NOT_ACTIVE', 403],
  ] as const) {
    const s = setup({ data: null, error: { message: code } })
    await assert.rejects(debitCreditForEvent(s.args),
      (err: unknown) => err instanceof HfaCreditOperationError &&
        err.code === code && err.status === status)
  }
})

test('no attempts are made for invalid tenant, user, event or operation UUIDs', async () => {
  for (const field of ['tenantId', 'submittedById', 'eventId', 'operationId'] as const) {
    const s = setup(expected('applied'))
    const args = { ...s.args, [field]: '../another-tenant' }
    await assert.rejects(debitCreditForEvent(args), /HFA_CREDIT_INVALID_INPUT/)
    assert.equal(s.calls.length, 0)
  }
})

test('routes preserve a single UUID for debit/refund and do not manipulate credits_balance', () => {
  const root = resolve(__dirname, '../../..')
  for (const file of [
    'frontend/src/app/api/events/route.ts',
    'frontend/src/app/api/analyze/route.ts',
  ]) {
    const source = readFileSync(resolve(root, file), 'utf8')
    assert.ok(source.includes('randomUUID()'), file)
    assert.ok(source.includes('operationId: creditOperationId'), file)
    assert.ok(!source.includes('currentBalanceAfterDebit:'), file)
    assert.ok(!source.includes('currentBalance: tenant.credits_balance'), file)
    assert.ok(!source.includes('.update({ credits_balance:'), file)
  }
  const helper = readFileSync(resolve(root, 'frontend/src/lib/server/tenant-user.ts'), 'utf8')
  const financialSection = helper.split('export class HfaCreditOperationError')[1]
  assert.ok(financialSection.includes("admin.rpc('hfa_apply_credit_operation_v31'"))
  assert.ok(!financialSection.includes(".from('tenants')"))
  assert.ok(!financialSection.includes(".from('credit_transactions')"))
})

test('only explicit first-analysis debit calls are present; reanalysis remains free', () => {
  const root = resolve(__dirname, '../../..')
  const analyze = readFileSync(resolve(root, 'frontend/src/app/api/analyze/route.ts'), 'utf8')
  assert.equal((analyze.match(/await debitCreditForEvent\(/g) || []).length, 2)
  assert.equal((analyze.match(/await refundCreditForFailedAnalysis\(/g) || []).length, 2)
  assert.match(analyze, /const firstCreditOperationId = randomUUID\(\)/)
  assert.match(analyze, /operationId: firstCreditOperationId/)
  const eventRoute = readFileSync(resolve(root, 'frontend/src/app/api/events/route.ts'), 'utf8')
  assert.equal((eventRoute.match(/await debitCreditForEvent\(/g) || []).length, 1)
  assert.equal((eventRoute.match(/await refundCreditForFailedAnalysis\(/g) || []).length, 1)
})
