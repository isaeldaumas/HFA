import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..')
const page = fs.readFileSync(path.join(root, 'frontend/src/app/(dashboard)/risk-profile/page.tsx'), 'utf8')
const server = fs.readFileSync(path.join(root, 'frontend/src/lib/risk-profile/server.ts'), 'utf8')
const normalizer = fs.readFileSync(path.join(root, 'frontend/src/lib/risk-profile/precondition-normalization.ts'), 'utf8')

assert.ok(page.includes('ObservedSeraRiskPanel'))
assert.ok(page.includes('HendyProspectiveRiskPanel'))
assert.ok(page.includes('Perfil SERA observado'))
assert.ok(page.includes('modelo prospectivo de Hendy'))
assert.ok(page.includes('Camada separada do modelo de risco SERA/Hendy'))
assert.ok(page.includes('protótipo não validado'))
assert.ok(server.includes('buildObservedSeraRiskSignature'))
assert.ok(server.includes('NOT_VALIDATED_PROTOTYPE'))
assert.ok(normalizer.includes('canonicalCategory'))
assert.ok(normalizer.includes("candidate.methodologyMatch === 'HYPOTHESIS_ONLY'"))
console.log('PASS SERA risk-profile methodology UI contract')
