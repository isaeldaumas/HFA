import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const migration = read('supabase/migrations/20261003013559_integration_connections_airtrust_v1.sql')
const auth = read('frontend/src/lib/server/integration-auth.ts')
const route = read('frontend/src/app/api/integrations/airtrust/events/route.ts')
const connections = read('frontend/src/app/api/integrations/connections/route.ts')

assert.match(migration, /token_hash text not null unique/)
assert.match(migration, /provider in \('AIRTRUST'\)/)
assert.match(migration, /revoke all on table public\.integration_connections/)
assert.match(auth, /createHash\('sha256'\)/)
assert.match(auth, /randomBytes\(32\)/)
assert.match(route, /source_system: 'AIRTRUST'/)
assert.match(route, /triage_status: 'UNTRIAGED'/)
assert.match(route, /investigation_path: 'NONE'/)
assert.match(route, /analysis_started: false/)
assert.match(route, /external_reference/)
assert.match(connections, /token_visible_once: true/)
console.log('AirTrust integration contract: PASS')
