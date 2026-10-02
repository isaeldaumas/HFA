import assert from 'node:assert/strict'
import { buildTrialUsage } from '@/lib/product/trial'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (error) {
    const message = error instanceof assert.AssertionError ? error.message : String(error)
    console.error(`  ✗ ${name}\n    ${message}`)
    failed++
  }
}

console.log('\n[1] used = 0, limit = 15')

test('remaining = 15 e status = available', () => {
  const usage = buildTrialUsage(0, 15)
  assert.equal(usage.remaining, 15)
  assert.equal(usage.status, 'available')
})

console.log('\n[2] used = 11, limit = 15')

test('used = 11 permanece available', () => {
  const usage = buildTrialUsage(11, 15)
  assert.equal(usage.remaining, 4)
  assert.equal(usage.status, 'available')
})

console.log('\n[3] used = 12, limit = 15')

test('used = 12 vira near_limit', () => {
  const usage = buildTrialUsage(12, 15)
  assert.equal(usage.remaining, 3)
  assert.equal(usage.status, 'near_limit')
})

console.log('\n[4] used = 15, limit = 15')

test('used = 15 vira limit_reached', () => {
  const usage = buildTrialUsage(15, 15)
  assert.equal(usage.remaining, 0)
  assert.equal(usage.status, 'limit_reached')
})

console.log('\n[5] used = 17, limit = 15')

test('remaining nunca fica negativo', () => {
  const usage = buildTrialUsage(17, 15)
  assert.equal(usage.remaining, 0)
  assert.equal(usage.status, 'limit_reached')
})

console.log('\n[6] used negativo')

test('used negativo normaliza para 0', () => {
  const usage = buildTrialUsage(-4, 15)
  assert.equal(usage.used, 0)
  assert.equal(usage.remaining, 15)
  assert.equal(usage.status, 'available')
})

console.log('\n[7] custom limit')

test('custom limit funciona', () => {
  const usage = buildTrialUsage(3, 5)
  assert.equal(usage.limit, 5)
  assert.equal(usage.remaining, 2)
  assert.equal(usage.status, 'near_limit')
})


console.log('\n[8] trial expirado')

test('data de expiração encerrada prevalece sobre saldo de casos', () => {
  const usage = buildTrialUsage(2, 15, {
    expiresAt: '2026-10-01T12:00:00.000Z',
    now: '2026-10-02T12:00:00.000Z',
  })
  assert.equal(usage.status, 'expired')
  assert.equal(usage.daysRemaining, 0)
})

if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam; ${passed} passaram.`)
  process.exit(1)
}

console.log(`\n${passed} testes passaram.`)
