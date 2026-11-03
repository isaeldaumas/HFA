import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyCanonicalReanalysisEvidence, mergeCanonicalReanalysisNarrative } from '../../frontend/src/lib/sera-vnext-product/canonical-event-analysis'

const original = 'Durante uma aproximação, houve um desvio de trajetória corrigido antes do pouso.'
const additional = 'A gravação confirmou que o copiloto transmitiu uma altitude diferente da autorizada.'
const merged = mergeCanonicalReanalysisNarrative({ baseNarrative: original, additionalInformation: additional })
assert.equal(classifyCanonicalReanalysisEvidence({ previousNarrative: original, updatedNarrative: merged, suppliedNewInformation: true }), 'NEW_EVIDENCE')
const retried = mergeCanonicalReanalysisNarrative({ baseNarrative: merged, additionalInformation: additional })
assert.equal(retried, merged)
assert.equal(classifyCanonicalReanalysisEvidence({ previousNarrative: merged, updatedNarrative: retried, suppliedNewInformation: true }), 'ALREADY_APPLIED')
assert.equal(classifyCanonicalReanalysisEvidence({ previousNarrative: merged, updatedNarrative: merged, suppliedNewInformation: false }), 'NO_NEW_EVIDENCE')
const furtherEvidence = mergeCanonicalReanalysisNarrative({ baseNarrative: merged, additionalInformation: 'O registro confirmou também que o comandante repetiu o valor informado.' })
assert.equal(classifyCanonicalReanalysisEvidence({ previousNarrative: merged, updatedNarrative: furtherEvidence, suppliedNewInformation: true }), 'NEW_EVIDENCE')

const route = readFileSync('frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts', 'utf8')
assert.match(route, /evidenceChange === 'ALREADY_APPLIED'/)
assert.match(route, /alreadyApplied: true/)
assert.match(route, /evidenceChange === 'NO_NEW_EVIDENCE'/)
assert.match(route, /VNEXT_REANALYZE_NEEDS_NEW_EVIDENCE/)
assert.match(route, /error instanceof SeraVNextProductError/)
assert.ok(route.indexOf("evidenceChange === 'ALREADY_APPLIED'") < route.indexOf('await createCanonicalEventAnalysis'), 'retry must return before engine reprocessing')
const page = readFileSync('frontend/src/app/(dashboard)/events/[id]/page.tsx', 'utf8')
assert.ok(page.includes('json?.alreadyApplied'))
assert.ok(page.includes('vnextReanalyzeNotice'))
assert.ok(page.includes('event.vnext_analysis.updated_at'), 'version history panel should refresh after a successful reanalysis')
console.log('CAL18_REANALYSIS_RETRY_PASS: duplicate evidence returns same revision without re-running motor')
