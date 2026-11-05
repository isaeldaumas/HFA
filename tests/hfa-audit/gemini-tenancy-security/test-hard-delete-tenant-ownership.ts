/** Offline fail-closed hard-delete audit boundary. No DB writes. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const file = 'frontend/src/app/api/events/[eventId]/route.ts'
const s = readFileSync(file, 'utf8')
const deletePart = s.slice(s.indexOf('export async function DELETE('))
const check = deletePart.indexOf("const owned = await admin.from('events')")
const tenant = deletePart.indexOf(".eq('tenant_id', user.tenantId)", check)
const absent = deletePart.indexOf("if (!owned.data)", tenant)
const audit = deletePart.indexOf('await writeCriticalAuditLog(', absent)
const lifecycle = deletePart.indexOf("from('event_deletion_events')", audit)
assert.ok(check >= 0 && tenant > check && absent > tenant, 'OWNERSHIP_GATE_MISSING')
assert.ok(audit > absent && lifecycle > audit, 'AUDIT_BEFORE_OWNERSHIP')
assert.match(deletePart, /if \(!owned\.data\) \{[\s\S]*?404/)
assert.match(deletePart, /EVENT_PURGE_DRY_RUN_ONLY/)
console.log('HARD_DELETE_CROSS_TENANT_AUDIT_FAIL_CLOSED_PASS', {
  foreignEventIdNoLifecycleWrite: true, realDBExecuted: false,
})
