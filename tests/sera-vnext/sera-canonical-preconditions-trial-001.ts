import assert from 'node:assert/strict'
import { classifyCanonicalPrecondition, SERA_MOST_LIKELY_PRECONDITIONS, SERA_PRECONDITION_META } from '../../frontend/src/lib/sera-vnext/precondition-taxonomy'
import { classifyPreconditionCategory } from '../../frontend/src/lib/sera-vnext/engine-v0/utils'

const entries = Object.entries(SERA_PRECONDITION_META)
assert.equal(entries.filter(([,v]) => v.level === 'IMMEDIATE').length, 12)
assert.equal(entries.filter(([,v]) => v.level === 'COMMAND_CONTROL_SUPERVISION').length, 3)
assert.equal(entries.filter(([,v]) => v.level === 'ORGANIZATIONAL').length, 6)
assert.deepEqual(SERA_MOST_LIKELY_PRECONDITIONS['P-A'], [])
assert.deepEqual(SERA_MOST_LIKELY_PRECONDITIONS['O-A'], [])
assert.deepEqual(SERA_MOST_LIKELY_PRECONDITIONS['A-A'], [])
for (const code of ['P-G','O-B','A-D','A-I']) assert.ok((SERA_MOST_LIKELY_PRECONDITIONS[code] ?? []).length > 0, code)
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['P-G'].includes('PSYCHOLOGICAL'))
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['P-G'].includes('TIME_PRESSURE'))
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['O-B'].includes('RULES_REGULATIONS'))
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['A-C'].includes('EQUIPMENT'))
assert.ok(SERA_MOST_LIKELY_PRECONDITIONS['A-I'].includes('TIME_PRESSURE'))
assert.equal(classifyCanonicalPrecondition('Após autorização do controle para proa direta, havia vento de 030/20kt.'), 'ENVIRONMENT')
assert.notEqual(classifyCanonicalPrecondition('Após autorização do controle para proa direta.'), 'EQUIPMENT')
assert.notEqual(classifyPreconditionCategory({ text: 'Observado uma falha na Barreira da Consciência Situacional da Tripulação.', proposedCode: null }), 'TECHNICAL_CONTEXT')
console.log('PASS canonical Hendy/Daumas precondition taxonomy')
