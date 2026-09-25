import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SERA_VNEXT_ENGINE_VERSION } from '../../frontend/src/lib/sera-vnext/ENGINE_VERSION'

type Entry = {
  path: string
  runtimeScope?: 'CURRENT' | 'HISTORICAL_V0_2_0'
}

const manifest = JSON.parse(readFileSync('tests/sera-vnext/test-manifest.json', 'utf8')) as Entry[]
const historical = new Set([
  'tests/sera-vnext/engine-boundary-validation-trial-001.ts',
  'tests/sera-vnext/engine-regression-validation-trial-001.ts',
  'tests/sera-vnext/engine-v0-adversarial-trial-001.ts',
  'tests/sera-vnext/engine-v0-regression-trial-001.ts',
  'tests/sera-vnext/engine-validation-v01/run-all.ts',
  'tests/sera-vnext/engine-validation-v02/run-all.ts',
  'tests/sera-vnext/engine-v02/reachability/run-reachability.ts',
])

assert.equal(SERA_VNEXT_ENGINE_VERSION, '0.3.0')
for (const path of historical) {
  const entry = manifest.find((item) => item.path === path)
  assert.ok(entry, `historical validator missing from manifest: ${path}`)
  assert.equal(entry?.runtimeScope, 'HISTORICAL_V0_2_0', `historical validator must not run against current runtime: ${path}`)
}

const v02Manifest = JSON.parse(readFileSync('tests/sera-vnext/engine-validation-v02/SERA_VNEXT_ENGINE_V02_EXPECTED_MANIFEST.json', 'utf8')) as Record<string, unknown>
assert.equal(v02Manifest.manifestVersion, 'SERA_VNEXT_ENGINE_V02_EXPECTED_MANIFEST_v0.2.0')
assert.ok(readFileSync('tests/sera-vnext/engine-validation-v0/expected/engine-v0-expected.json', 'utf8').includes('OFFICIAL-COMAIR-5191'))

console.log('PASS historical 0.2.0 validation baselines preserved and separated from runtime 0.3.0')
