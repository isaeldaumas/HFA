// provenance-model-trial-001.ts
// Verifica que o modelo de proveniência expõe os campos corretos e que
// engine_version (contrato DB) e engine_runtime_version (runtime) são distintos.

import { getSeraVNextProductVersionSet, SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA, SERA_VNEXT_CANONICAL_TREE_VERSION } from '../../../frontend/src/lib/sera-vnext-product/versioning'
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

console.log('\n6. codeCommit não vazio')
assert(typeof versions.codeCommit === 'string' && versions.codeCommit.length > 0, 'codeCommit definido')

console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===\n`)
if (failed > 0) process.exit(1)
