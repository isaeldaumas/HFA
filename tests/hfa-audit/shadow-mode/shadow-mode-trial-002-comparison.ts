// AUDIT TEST — SERA_SHADOW_DIVERGENCE_V1 mechanical comparison contract.
// Executar: npx tsx tests/hfa-audit/shadow-mode/shadow-mode-trial-002-comparison.ts

import {
  SERA_SHADOW_DIVERGENCE_CONTRACT_ID,
  SERA_SHADOW_DIVERGENCE_V1_EXCLUDED_FIELDS,
  aggregateShadowDivergenceV1,
  compareShadowAxisV1,
  compareShadowTripletV1,
} from '../../../frontend/src/lib/sera-shadow/divergence-v1'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

const exact = compareShadowTripletV1({
  perception: { legacyCode: 'P-A', vnextCode: 'P-A', vnextStatus: 'CLASSIFIED' },
  objective: { legacyCode: 'O-C', vnextCode: 'O-C', vnextStatus: 'CLASSIFIED' },
  action: { legacyCode: 'A-A', vnextCode: 'A-A', vnextStatus: 'CLASSIFIED' },
})
check(exact.contractId === SERA_SHADOW_DIVERGENCE_CONTRACT_ID, 'contract id is SERA_SHADOW_DIVERGENCE_V1')
check(exact.exactTripletMatch === true, 'exactTripletMatch when all axes CLASSIFIED and equal')
check(exact.agreementRate === 1, 'agreementRate=1 for full agreement')
check(exact.comparableAxisCount === 3, 'all three axes comparable')

const diverge = compareShadowTripletV1({
  perception: { legacyCode: 'P-A', vnextCode: 'P-B', vnextStatus: 'CLASSIFIED' },
  objective: { legacyCode: 'O-C', vnextCode: 'O-C', vnextStatus: 'CLASSIFIED' },
  action: { legacyCode: 'A-A', vnextCode: 'A-A', vnextStatus: 'CLASSIFIED' },
})
check(diverge.exactTripletMatch === false, 'exactTripletMatch false when one axis differs')
check(diverge.divergingAxisCount === 1, 'one diverging axis')
check(diverge.agreeingAxisCount === 2, 'two agreeing axes')
check(diverge.agreementRate === Number((2 / 3).toFixed(6)), 'agreementRate over comparable axes only')

const unresolved = compareShadowAxisV1({
  axis: 'perception',
  legacyCode: 'P-A',
  vnextCode: 'P-A',
  vnextStatus: 'UNRESOLVED',
})
check(unresolved.excludedFromDenominator === true, 'UNRESOLVED excluded from denominator')
check(unresolved.diverges === false, 'UNRESOLVED does not count as divergence')

const absentLegacy = compareShadowAxisV1({
  axis: 'objective',
  legacyCode: null,
  vnextCode: 'O-C',
  vnextStatus: 'CLASSIFIED',
})
check(absentLegacy.excludedFromDenominator === true, 'absent legacy code excluded')

const noComparable = compareShadowTripletV1({
  perception: { legacyCode: 'P-A', vnextCode: null, vnextStatus: 'UNRESOLVED' },
  objective: { legacyCode: null, vnextCode: 'O-C', vnextStatus: 'CLASSIFIED' },
  action: { legacyCode: 'A-A', vnextCode: 'A-A', vnextStatus: 'REQUIRES_MORE_EVIDENCE' },
})
check(noComparable.comparableAxisCount === 0, 'non-CLASSIFIED/absent axes leave empty denominator')
check(noComparable.agreementRate === null, 'agreementRate is null (not 0) when denominator empty')
check(noComparable.exactTripletMatch === false, 'exactTripletMatch false without three comparable axes')

const metrics = aggregateShadowDivergenceV1([exact, diverge, noComparable])
check(metrics.ercIncluded === false, 'aggregate metrics mark ercIncluded=false')
check(metrics.runCount === 3, 'aggregate runCount')
check(metrics.exactTripletMatchCount === 1, 'aggregate exactTripletMatchCount')

const moduleSource = readFileSync(
  path.resolve(__dirname, '../../../frontend/src/lib/sera-shadow/divergence-v1.ts'),
  'utf8',
)
check(moduleSource.includes('ERC is EXPLICITLY EXCLUDED'), 'module documents ERC exclusion')
check(moduleSource.includes("ercIncluded: false"), 'aggregate metrics hardcode ercIncluded false')
check(
  /no semantic equivalen|NOT semantic equivalen|não significa equivalência semântica/i.test(moduleSource),
  'source forbids semantic equivalence claims',
)
check(moduleSource.includes('literal'), 'source states literal equality')
check(
  SERA_SHADOW_DIVERGENCE_V1_EXCLUDED_FIELDS.includes('erc'),
  'excluded fields list contains erc',
)

console.log(failures === 0 ? 'SHADOW_MODE_TRIAL_002_OK' : `SHADOW_MODE_TRIAL_002_FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
