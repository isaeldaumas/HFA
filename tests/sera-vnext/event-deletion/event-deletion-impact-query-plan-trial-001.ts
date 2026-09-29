import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..', '..', '..')
const helper = readFileSync(path.join(root, 'frontend/src/lib/server/event-deletion.ts'), 'utf8')
const migration = readFileSync(
  path.join(root, 'supabase/migrations/20260929112000_event_deletion_lookup_indexes.sql'),
  'utf8',
)

const impactBody = helper.slice(
  helper.indexOf('export async function getEventDeletionImpact'),
  helper.indexOf('function mapRpcError'),
)

assert.match(impactBody, /source_reference/, 'canonical source_reference lookup is required')
assert.match(impactBody, /if \(candidateRows\.length === 0\)/, 'metadata lookup must be fallback-only')
assert.match(impactBody, /metadata->>eventId/, 'fallback must use exact metadata eventId equality')
assert.doesNotMatch(impactBody, /\.contains\('metadata', \{ eventId \}\)/, 'unindexed JSON containment scan must not return')
assert.match(migration, /\(tenant_id, source_reference\)/, 'source_reference lookup index missing')
assert.match(migration, /metadata ->> 'eventId'/, 'metadata eventId expression index missing')

console.log('EVENT_DELETION_IMPACT_QUERY_PLAN_OK')
