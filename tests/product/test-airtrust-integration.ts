import { parseAirTrustNarrative, readAirTrustEventBody } from '../../frontend/src/lib/server/airtrust-event-input'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const migration = read('supabase/migrations/20261003015000_airtrust_integration_v1.sql')
const token = read('frontend/src/lib/integrations/integration-token.ts')
const externalRoute = read('frontend/src/app/api/integrations/airtrust/events/route.ts')
const adminRoute = read('frontend/src/app/api/admin/integrations/airtrust/route.ts')

assert.match(migration, /create table if not exists public\.integration_connections/)
assert.match(migration, /token_hash text not null unique/)
assert.match(migration, /scopes text\[\]/)
assert.match(migration, /add column if not exists revoked_at/)
assert.match(migration, /enable row level security/)
assert.match(token, /createHash\('sha256'\)/)
assert.match(token, /randomBytes\(32\)/)
assert.match(externalRoute, /source_system: 'AIRTRUST'/)
assert.match(externalRoute, /event_kind: 'SAFETY_REPORT'/)
assert.match(externalRoute, /triage_status: 'UNTRIAGED'/)
assert.match(externalRoute, /investigation_path: 'NONE'/)
assert.match(externalRoute, /credits_used: 0/)
assert.match(externalRoute, /created \|\| analysisStarted \? \{ analysis_started: analysisStarted \} : \{\}/)
assert.match(externalRoute, /lockedForAnalysis/)
assert.match(externalRoute, /insert\.error\?\.code === '23505'/)
assert.match(externalRoute, /existing\.data\.title !== title \|\| existing\.data\.raw_input !== narrative/)
assert.match(externalRoute, /Revisão manual necessária\.', 409/)
assert.doesNotMatch(externalRoute, /from\('events'\)\.update\(/)
assert.match(externalRoute, /readAirTrustEventBody\(req\)/)
assert.match(externalRoute, /events:write/)
assert.match(externalRoute, /events:read/)
assert.doesNotMatch(externalRoute, /createCanonicalEventAnalysis/)
assert.doesNotMatch(externalRoute, /debitCreditForEvent/)
assert.match(adminRoute, /integration_connection_rotated/)
assert.match(adminRoute, /integration_connection_revoked/)
assert.equal(parseAirTrustNarrative('  Original report \n'), '  Original report \n')
assert.equal(parseAirTrustNarrative('x'.repeat(200_000)), 'x'.repeat(200_000))
assert.equal(parseAirTrustNarrative('x'.repeat(200_001)), null)
assert.equal(parseAirTrustNarrative(' \n '), null)
assert.equal(parseAirTrustNarrative({ value: 'unsafe' }), null)

async function validateRequestLimits() {
  const url = 'https://fixture.example.invalid/api/integrations/airtrust/events'
  const request = (body: string, headers?: HeadersInit) => new Request(url, {method: 'POST', headers, body})
  assert.deepEqual(await readAirTrustEventBody(request('{"narrative":"ok"}')),
    { kind: 'ok', body: { narrative: 'ok' } })
  assert.deepEqual(await readAirTrustEventBody(request('[]')), { kind: 'invalid' })
  assert.deepEqual(await readAirTrustEventBody(request('{bad json}')), { kind: 'invalid' })
  assert.deepEqual(await readAirTrustEventBody(request('x'.repeat(1024 * 1024 + 1))), { kind: 'too_large' })
  assert.deepEqual(await readAirTrustEventBody(request('{}', { 'content-length': '1200000' })), { kind: 'too_large' })
  console.log('AirTrust integration safety and input integrity: PASS')
}
void validateRequestLimits().catch(error => { console.error(error); process.exitCode = 1 })
