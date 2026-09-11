// AUDIT TEST — D3-b author decision implementation
// Executar: npx tsx tests/hfa-audit/erc-containment/erc-containment-trial-003-d3b.ts

import { computeHfaErcCategoryFromCodes } from '../../../frontend/src/lib/risk-profile/erc'
import {
  D3_DECISION_ID,
  isVNextNumericErcAllowed,
  resolveErcPresentationMode,
  shouldSuppressConsolidatedNumericErc,
  buildErcContainmentNotice,
  describeErcValue,
} from '../../../frontend/src/lib/risk-profile/erc-containment'
import { buildDataConfidence } from '../../../frontend/src/lib/sera/data-confidence'

let failures = 0
function assertTrue(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

assertTrue(D3_DECISION_ID === 'D3_B', 'D3 decision id is D3_B')
assertTrue(isVNextNumericErcAllowed() === false, 'vNext numeric ERC not allowed')

assertTrue(
  computeHfaErcCategoryFromCodes('UNRESOLVED', 'O-A', 'A-A') === null,
  'UNRESOLVED perception yields no ERC',
)
assertTrue(
  computeHfaErcCategoryFromCodes('P-A', 'UNRESOLVED', 'A-A') === null,
  'UNRESOLVED objective yields no ERC',
)
assertTrue(
  computeHfaErcCategoryFromCodes('P-A', 'O-A', 'UNRESOLVED') === null,
  'UNRESOLVED action yields no ERC',
)

const mixed = resolveErcPresentationMode({ legacyCount: 2, vnextCount: 1, legacyErcPresent: true })
assertTrue(mixed === 'SUPPRESSED_D3B_MIXED', 'mixed profile presentation suppressed')
assertTrue(shouldSuppressConsolidatedNumericErc(mixed), 'mixed suppresses consolidated numeric ERC')

const pureVnext = resolveErcPresentationMode({ legacyCount: 0, vnextCount: 3, legacyErcPresent: false })
assertTrue(pureVnext === 'SUPPRESSED_D3B_VNEXT_ONLY', 'pure vNext presentation suppressed')
assertTrue(shouldSuppressConsolidatedNumericErc(pureVnext), 'pure vNext suppresses consolidated numeric ERC')

const pureLegacy = resolveErcPresentationMode({ legacyCount: 4, vnextCount: 0, legacyErcPresent: true })
assertTrue(pureLegacy === 'LEGACY_ARMS_MODAL', 'pure legacy may present ARMS modal')
assertTrue(!shouldSuppressConsolidatedNumericErc(pureLegacy), 'pure legacy not suppressed')

const confidence = buildDataConfidence({
  totalAnalyses: 12,
  validErcCount: 0,
  ercShareAffectsLevel: false,
})
assertTrue(confidence.level === 'strong', 'D3-b: deliberate ERC absence does not alone downgrade confidence')
assertTrue(confidence.erc_share_affects_level === false, 'erc_share_affects_level false recorded')
assertTrue(
  confidence.messages.some((m) => /D3-b/i.test(m)),
  'confidence message mentions D3-b deliberate absence',
)

const legacyConfidence = buildDataConfidence({
  totalAnalyses: 12,
  validErcCount: 5,
  ercShareAffectsLevel: true,
})
assertTrue(legacyConfidence.level === 'moderate', 'legacy path still applies ERC share when enabled')

const notice = buildErcContainmentNotice()
assertTrue(/D3-b/i.test(notice), 'containment notice cites D3-b')
assertTrue(/UNRESOLVED/i.test(notice), 'containment notice cites UNRESOLVED')

const arms = describeErcValue('ARMS_CODE_MATRIX_V1', { p: 'P-A', o: 'O-A', a: 'A-A' })
assertTrue(arms.category != null, 'legacy ARMS still describes historical values with provenance')
assertTrue(/D3-b/i.test(arms.caveat), 'described ERC caveat cites D3-b')

console.log(failures === 0 ? 'ERC_CONTAINMENT_TRIAL_003_D3B_OK' : `ERC_CONTAINMENT_TRIAL_003_D3B_FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
