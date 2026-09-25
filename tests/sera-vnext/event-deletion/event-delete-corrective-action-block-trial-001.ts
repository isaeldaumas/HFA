import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(__dirname, '..', '..', '..')
const helperFile = path.join(rootDir, 'frontend', 'src', 'lib', 'server', 'event-deletion.ts')
const routeFile = path.join(rootDir, 'frontend', 'src', 'app', 'api', 'events', '[eventId]', 'delete-request', 'route.ts')
const migrationFile = path.join(rootDir, 'supabase', 'migrations', '20260925174644_block_current_sera_open_actions_on_event_delete.sql')

const helper = readFileSync(helperFile, 'utf8')
const route = readFileSync(routeFile, 'utf8')
const migration = readFileSync(migrationFile, 'utf8')

assert.match(helper, /correctiveActionsOpen/)
assert.match(helper, /open_corrective_actions/)
assert.match(helper, /sera_vnext_analysis_id/)
assert.match(migration, /EVENT_DELETE_CORRECTIVE_ACTION_BLOCK/)
assert.match(migration, /sera_vnext_analysis_id/)
assert.match(route, /EVENT_DELETE_CORRECTIVE_ACTION_BLOCK/)

console.log('CORRECTIVE_ACTION_BLOCK_OK')
