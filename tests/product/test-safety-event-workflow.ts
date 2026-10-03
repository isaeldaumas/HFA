import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const migration = read('supabase/migrations/20261002235131_safety_event_workflow_v1.sql')
const eventsRoute = read('frontend/src/app/api/events/route.ts')
const analyzeRoute = read('frontend/src/app/api/analyze/route.ts')
const triageRoute = read('frontend/src/app/api/events/[eventId]/triage/route.ts')
const deletion = read('frontend/src/lib/server/event-deletion.ts')

assert.match(migration, /event_kind text not null default 'HFA_ANALYSIS'/)
assert.match(migration, /triage_status text not null default 'UNTRIAGED'/)
assert.match(migration, /investigation_path text not null default 'HFA'/)
assert.match(migration, /create table if not exists public\.event_documents/)
assert.match(migration, /enable row level security/)

assert.match(eventsRoute, /analysisMode === 'register_only'/)
assert.match(eventsRoute, /event_kind: analysisMode === 'register_only' \? 'SAFETY_REPORT'/)
assert.match(eventsRoute, /credits_used: 0/)
assert.match(eventsRoute, /eventType: 'safety_event_reported'/)
assert.match(analyzeRoute, /const firstHfaAnalysis = !latestVNext/)
assert.match(analyzeRoute, /mode: firstHfaAnalysis \? 'INITIAL' : 'REANALYSIS'/)
assert.match(analyzeRoute, /creditsUsed: firstHfaAnalysis \? 1 : undefined/)
assert.match(analyzeRoute, /refundCreditForFailedAnalysis/)
assert.match(analyzeRoute, /status: firstHfaAnalysis \? 'received' : 'failed'/)

for (const status of ['MONITOR_ONLY', 'GENERAL_INVESTIGATION', 'HFA_SELECTED', 'CLOSED']) {
  assert.ok(triageRoute.includes(`'${status}'`), `triage route missing ${status}`)
}
assert.match(triageRoute, /eventType: 'safety_event_triaged'/)
assert.match(deletion, /from\('event_documents'\)/)
assert.match(deletion, /category: 'safety_event_document'/)

console.log('Safety event workflow contract: PASS')
