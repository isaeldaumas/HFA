import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isLikelyDuplicate, matchingEarlierEvents, normalizeOccurrenceNarrative } from '../../frontend/src/lib/server/event-duplicates'

const original = 'Em 14 de março, às 09:42, a aeronave iniciou o táxi com uma porta de compartimento indicada como não travada. A tripulação parou, confirmou a indicação e solicitou inspeção externa. A porta foi corretamente travada e o voo prosseguiu. Não houve deslocamento além da área de táxi nem dano.'
const repost = original.replace('09:42', '09h42')
const one = { id: 'original-cal19', title: 'CAL-19 — Porta não travada Copiar', raw_input: original, aircraft_type: null, operation_type: null, occurred_at: null, created_at: '2026-10-14T21:26:41Z' }
const two = { id: 'duplicate-cal19', title: 'CAL-19 — Porta não travada (segundo registro)', raw_input: repost, aircraft_type: null, operation_type: null, occurred_at: null, created_at: '2026-10-14T21:30:30Z' }
assert.equal(normalizeOccurrenceNarrative(original), normalizeOccurrenceNarrative(repost))
assert.equal(isLikelyDuplicate(two, one), true, '09h42 and 09:42 should normalize equally')
assert.deepEqual(matchingEarlierEvents(two, [one]), [one])
assert.deepEqual(matchingEarlierEvents(one, [two]), [], 'must not prefer a future duplicate as canonical')
assert.equal(isLikelyDuplicate(one, one), false)
assert.equal(isLikelyDuplicate({ ...two, aircraft_type: 'AW139' }, { ...one, aircraft_type: 'S-76' }), false)
assert.equal(isLikelyDuplicate({ ...two, occurred_at: '2026-03-14T09:42:00Z' }, { ...one, occurred_at: '2026-03-15T09:42:00Z' }), false)
assert.equal(isLikelyDuplicate({ ...two, raw_input: 'O piloto declarou outro evento sem qualquer relação.' }, one), false)
assert.equal(isLikelyDuplicate({ ...two, raw_input: repost.replace(/não houve deslocamento/i, 'houve deslocamento') }, one), false, 'causal negation matters')
assert.equal(isLikelyDuplicate({ ...two, raw_input: 'Durante a aproximação a aeronave saiu da trajetória.' }, { ...one, raw_input: 'Durante a aproximação a aeronave saiu da trajetória.' }), false, 'generic short narratives must not link')
const root = 'frontend/src/'
const creation = readFileSync(root + 'app/api/events/route.ts', 'utf8')
const duplicateGate = creation.indexOf('const matches = await findTenantDuplicateCandidates')
assert.ok(duplicateGate > 0 && duplicateGate < creation.indexOf("stage = 'insert-event'"))
assert.ok(duplicateGate < creation.indexOf("stage = 'debit-credit'"))
assert.match(creation, /POSSIBLE_EVENT_DUPLICATE/)
assert.match(creation, /duplicate_override_reason/)
assert.match(creation, /tenantId: user.tenantId/)
const reconciler = readFileSync(root + 'app/api/events/[eventId]/duplicates/route.ts', 'utf8')
for (const token of ["requireBearerUser(req)", "getEvent(admin, user.tenantId, eventId)", "getEvent(admin, user.tenantId, canonicalId)", "isLikelyDuplicate(duplicate, canonical)", "reviewerRoles.has(user.role.toLowerCase())", "decided_by: user.publicUserId", "event.duplicate_confirmed"]) {
  assert.ok(reconciler.includes(token), 'reconciler missing: ' + token)
}
const schema = readFileSync('supabase/migrations/20261014224000_event_duplicate_links.sql', 'utf8')
for (const token of ['unique references public.events', 'EVENT_DUPLICATE_TENANT_MISMATCH', 'EVENT_DUPLICATE_CANONICAL_MUST_BE_EARLIER', 'EVENT_DUPLICATE_LINK_IMMUTABLE', 'row level security']) assert.ok(schema.includes(token))
const safety = readFileSync(root + 'app/api/safety/overview/route.ts', 'utf8')
assert.ok(safety.includes('!confirmedDuplicateIds.has(event.id)'))
const profile = readFileSync(root + 'lib/risk-profile/server.ts', 'utf8')
assert.ok(profile.includes('!confirmedDuplicateIds.has(row.id)'))
const detail = readFileSync(root + 'app/(dashboard)/events/[id]/page.tsx', 'utf8')
assert.ok(detail.includes('<EventDuplicateReviewPanel'))
const intake = readFileSync(root + 'app/(dashboard)/events/new/page.tsx', 'utf8')
assert.ok(intake.includes('Registrar mesmo assim como ocorrência independente'))
const listing = readFileSync(root + 'app/(dashboard)/events/page.tsx', 'utf8')
assert.ok(listing.includes('!item.duplicate_of_event_id'))
assert.ok(listing.includes('Duplicidade confirmada'))
console.log('CAL19_DUPLICATE_PASS: tenant-bound, no auto-merge, explicit human reconciliation, 09h42 equivalence, analytics exclusion')
