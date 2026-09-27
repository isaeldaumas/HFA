import assert from 'node:assert/strict'
import { buildSeraHfacsBridge } from '../../frontend/src/lib/sera-vnext/hfacs-bridge'

const result = buildSeraHfacsBridge(['O-B','P-F','A-F'], ['RULES_REGULATIONS','MONITORING_SUPERVISION'])
assert.ok(result.activeFailures.some((x) => /Violation.*routine/i.test(x.hfacs)))
assert.ok(result.activeFailures.some((x) => /Perceptual/i.test(x.hfacs)))
assert.ok(result.activeFailures.some((x) => /^Decision$/i.test(x.hfacs)))
assert.ok(result.preconditions.some((x) => /No direct AGA 135 HFACS equivalent/i.test(x.hfacs)))
assert.ok(result.preconditions.some((x) => /Inadequate supervision|Failed to correct/i.test(x.hfacs)))
assert.match(result.note, /not one-to-one/i)
assert.match(result.note, /does not replace SERA/i)
console.log('PASS SERA-HFACS Hendy bridge')
