import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '..', '..', '..')
const helper = readFileSync(path.join(rootDir, 'frontend', 'src', 'lib', 'server', 'event-deletion.ts'), 'utf8')
const route = readFileSync(path.join(rootDir, 'frontend', 'src', 'app', 'api', 'events', '[eventId]', 'delete-request', 'route.ts'), 'utf8')
const risk = readFileSync(path.join(rootDir, 'frontend', 'src', 'lib', 'risk-profile', 'server.ts'), 'utf8')
const migration = readFileSync(path.join(rootDir, 'supabase', 'migrations', '20260929004500_event_precondition_treatment_dynamic_recalculation.sql'), 'utf8')

assert.match(helper, /correctiveActionsOpen/)
assert.match(helper, /open_corrective_actions/, 'open actions remain purge/audit dependencies')
assert.match(migration, /drop trigger if exists trg_block_event_soft_delete_current_sera_actions/)
assert.doesNotMatch(migration, /raise exception 'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK'/)
assert.doesNotMatch(route, /EVENT_DELETE_CORRECTIVE_ACTION_BLOCK/)
assert.match(risk, /activeEventIds/)
assert.match(risk, /activeVNextRows/)
assert.match(migration, /RECALCULATE_ACTIVE_UNIVERSE/)

console.log('CORRECTIVE_ACTION_DYNAMIC_EXCLUSION_OK')
