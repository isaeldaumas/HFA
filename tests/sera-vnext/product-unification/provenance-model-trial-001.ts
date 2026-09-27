// provenance-model-trial-001.ts
// Verifica que o modelo de proveniência expõe os campos corretos e que
// engine_version (contrato DB) e engine_runtime_version (runtime) são distintos.

import { getSeraVNextProductVersionSet, SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA, SERA_VNEXT_CANONICAL_TREE_VERSION } from '../../../frontend/src/lib/sera-vnext-product/versioning'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SERA_VNEXT_ENGINE_VERSION } from '../../../frontend/src/lib/sera-vnext/ENGINE_VERSION'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`)
    passed++
  } else {
    console.error(`  FAIL: ${label}`)
    failed++
  }
}

console.log('\n=== provenance-model-trial-001 ===\n')

const versions = getSeraVNextProductVersionSet()

console.log('1. Versões básicas')
assert(versions.engineVersion === '0.1.0', 'engineVersion (contrato DB) = 0.1.0')
assert(versions.engineRuntimeVersion === '0.3.0', 'engineRuntimeVersion (runtime) = 0.3.0')
assert(versions.engineVersion !== versions.engineRuntimeVersion, 'contrato DB !== runtime (divergência correta)')

console.log('\n2. Metodologia e árvore')
assert(versions.methodologyVersion === 'SERA_PT_V1_FROZEN', 'methodologyVersion = SERA_PT_V1_FROZEN')
assert(versions.canonicalTreeVersion === 'SERA_PT_V1', 'canonicalTreeVersion = SERA_PT_V1')
assert(versions.canonicalTreeVersion === SERA_VNEXT_CANONICAL_TREE_VERSION, 'canonicalTreeVersion usa constante exportada')

console.log('\n3. Source flow')
assert(versions.sourceFlow === 'VNEXT_PRODUCT_BETA', 'sourceFlow = VNEXT_PRODUCT_BETA')
assert(versions.sourceFlow === SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA, 'sourceFlow usa constante exportada')

console.log('\n4. Schema versions')
assert(versions.inputSchemaVersion === 'sera-vnext-product-beta-input-v1', 'inputSchemaVersion correto')
assert(versions.outputSchemaVersion === 'sera-vnext-product-beta-output-v1', 'outputSchemaVersion correto')

console.log('\n5. ENGINE_VERSION.ts coerência')
assert(SERA_VNEXT_ENGINE_VERSION === '0.3.0', 'ENGINE_VERSION = 0.3.0')
assert(versions.engineRuntimeVersion === SERA_VNEXT_ENGINE_VERSION, 'engineRuntimeVersion == ENGINE_VERSION')

console.log('\n6. Proveniência de commit e deployment')
const originalEnv = {
  VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  SERA_CODE_COMMIT: process.env.SERA_CODE_COMMIT,
  GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA,
  VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
}
try {
  process.env.VERCEL_GIT_COMMIT_SHA = 'A'.repeat(40)
  process.env.SERA_CODE_COMMIT = 'b'.repeat(40)
  process.env.GIT_COMMIT_SHA = 'c'.repeat(40)
  process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test_provenance'
  const vercelCommit = getSeraVNextProductVersionSet()
  assert(vercelCommit.codeCommit === 'a'.repeat(40), 'VERCEL_GIT_COMMIT_SHA tem precedência e é normalizado')
  assert(vercelCommit.codeCommitSource === 'VERCEL_GIT_COMMIT_SHA', 'fonte Vercel registrada')
  assert(vercelCommit.deploymentId === 'dpl_test_provenance', 'deployment ID registrado')

  process.env.VERCEL_GIT_COMMIT_SHA = 'invalid'
  const explicitCommit = getSeraVNextProductVersionSet()
  assert(explicitCommit.codeCommit === 'b'.repeat(40), 'SERA_CODE_COMMIT é fallback explícito do deploy')
  assert(explicitCommit.codeCommitSource === 'SERA_CODE_COMMIT', 'fonte explícita registrada')

  process.env.SERA_CODE_COMMIT = 'also-invalid'
  process.env.GIT_COMMIT_SHA = 'short'
  const unavailable = getSeraVNextProductVersionSet()
  assert(unavailable.codeCommit === 'UNAVAILABLE', 'SHA inválido nunca é apresentado como commit')
  assert(unavailable.codeCommitSource === 'UNAVAILABLE', 'ausência de SHA fica explícita')
} finally {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('\n7. Fluxo oficial de deploy injeta o SHA')
const deployScript = readFileSync(join(process.cwd(), 'scripts/deploy-hfa-production.sh'), 'utf8')
assert(deployScript.includes('--build-env "SERA_CODE_COMMIT=$SHA"'), 'deploy injeta SHA no build')
assert(deployScript.includes('--env "SERA_CODE_COMMIT=$SHA"'), 'deploy injeta SHA no runtime')
assert(deployScript.includes('--meta "seraCodeCommit=$SHA"'), 'deploy registra SHA também como metadata')
assert(deployScript.includes('git status --porcelain --untracked-files=no'), 'deploy recusa árvore rastreada suja')

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===\n`)
if (failed > 0) process.exit(1)
