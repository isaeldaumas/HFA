import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'

const script = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/prebuild-shadow-production-guard.mjs')
const flagNames = [
  'SERA_SHADOW_EXECUTION_ENABLED',
  'SERA_SHADOW_PERSISTENCE_ENABLED',
  'SERA_SHADOW_ADMIN_VIEW_ENABLED',
  'SERA_SHADOW_AUTO_COMPARISON_ENABLED',
  'SERA_SHADOW_VALIDATION_REPORTS_ENABLED',
  'NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED',
]

function check(overrides = {}) {
  // Never propagate real process environment variables or credentials to a
  // simulated build. All tests run with isolated fake variables.
  const env = { PATH: process.env.PATH ?? '', ...overrides }
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
}

test('unset flags are safe to build', () => {
  const result = check({ VERCEL_ENV: 'production' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /all six Shadow flags OFF/)
})

test('all six explicit false values are safe in production', () => {
  const flags = Object.fromEntries(flagNames.map((name) => [name, 'false']))
  const result = check({ ...flags, VERCEL_ENV: 'production' })
  assert.equal(result.status, 0, result.stderr)
})

for (const name of flagNames) {
  test(`production build fails closed when ${name} is true`, () => {
    const result = check({ VERCEL_ENV: 'production', [name]: 'true' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /HFA_SHADOW_RELEASE_BLOCKED/)
    assert.ok(result.stderr.includes(name))
  })
}

test('a public UI flag alone blocks even when every server flag is false', () => {
  const flags = Object.fromEntries(flagNames.map((name) => [name, 'false']))
  const result = check({
    ...flags,
    NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED: ' TRUE ',
    VERCEL_ENV: 'production',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED/)
})

test('ambiguous env values fail closed rather than silently passing', () => {
  const result = check({ VERCEL_ENV: 'production', SERA_SHADOW_EXECUTION_ENABLED: '1' })
  assert.notEqual(result.status, 0)
})

test('staging build cannot prematurely activate Shadow either', () => {
  const result = check({ VERCEL_ENV: 'preview', SERA_SHADOW_EXECUTION_ENABLED: 'true' })
  assert.notEqual(result.status, 0)
})

test('only variable names, never values, appear in denial logs', () => {
  const secretLikeValue = 'sensitive-value-DO-NOT-LOG'
  const result = check({ VERCEL_ENV: 'production', SERA_SHADOW_EXECUTION_ENABLED: secretLikeValue })
  assert.notEqual(result.status, 0)
  assert.ok(!result.stdout.includes(secretLikeValue))
  assert.ok(!result.stderr.includes(secretLikeValue))
})
