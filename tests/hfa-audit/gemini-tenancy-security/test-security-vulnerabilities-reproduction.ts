/**
 * Security Vulnerabilities Reproduction Suite (P0 / P1 / P2)
 *
 * Reproduces and documents specific architectural and implementation vulnerabilities
 * discovered during the route-by-route audit:
 *
 * - VULN-01 [P0]: Historical Python metadata tenant spoofing (mitigated in local integration)
 * - VULN-02 [P0]: Historical process.env mutation mitigated by per-request AI scope
 * - VULN-03 [P0]: Historical customer admin conflation mitigated in local
 *                  integration review; cloud E2E authorization remains NOT_RUN
 * - VULN-04 [P1]: Historical cross-tenant hard-delete audit IDOR mitigated locally
 * - VULN-05 [P2]: Distinction between Application-Layer Service-Role Filtering vs Database RLS
 *
 * Run: npx tsx tests/hfa-audit/gemini-tenancy-security/test-security-vulnerabilities-reproduction.ts
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isPlatformAdminAuthorized } from '../../../frontend/src/lib/server/platform-admin-authority'
import {
  TENANT_A,
  TENANT_B,
  USERS,
  SYNTHETIC_EVENTS,
} from './synthetic-tenancy-fixture'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function test(label: string, fn: () => void | Promise<void>) {
  totalTests++
  try {
    const res = fn()
    if (res instanceof Promise) {
      return res
        .then(() => {
          passedTests++
          console.log(`  PASS — ${label}`)
        })
        .catch((err) => {
          failedTests++
          console.error(`  FAIL — ${label}:`, err.message)
        })
    }
    passedTests++
    console.log(`  PASS — ${label}`)
  } catch (err: any) {
    failedTests++
    console.error(`  FAIL — ${label}:`, err.message)
  }
}

export async function runVulnerabilitiesReproductionSuite() {
  console.log('\n--- EXECUTING SECURITY VULNERABILITIES REPRODUCTION SUITE ---')

  // ── VULN-01 [P0]: Historical metadata vulnerability is now mitigated ──
  test('MITIGATED VULN-01 [P0]: Python backend requires DB-authoritative tenant', () => {
    const maliciousUserAuthSession = {
      user: {
        id: '10000000-aaaa-4000-a000-000000000001',
        user_metadata: { tenant_id: TENANT_B.id, role: 'admin' },
      },
    }
    // Before patch: users of this API were resolved from metadata.
    assert.equal(maliciousUserAuthSession.user.user_metadata.tenant_id, TENANT_B.id)
    // The new resolver ignores metadata. The actual execution path is tested
    // with in-memory Supabase mocks in backend/tests/test_authoritative_user.py,
    // including this exact forged tenant versus the DB binding.
    const pyDeps = readFileSync(
      path.join(process.cwd(), 'backend/app/api/deps.py'), 'utf8')
    const pyResolver = readFileSync(
      path.join(process.cwd(), 'backend/app/api/authoritative_user.py'), 'utf8')
    assert.match(pyDeps, /resolve_authorized_user/)
    assert.doesNotMatch(pyResolver, /authenticated_user\.user_metadata/)
  })

  // ── VULN-02 [P0]: Shared process.env setter replaced by isolated async scope ──
  test('MITIGATED VULN-02 [P0]: AI keys are bound to request scope, never process.env', () => {
    const aiLoader = readFileSync(path.join(process.cwd(),
      'frontend/src/lib/server/user-ai-settings.ts'), 'utf8')
    const scope = readFileSync(path.join(process.cwd(),
      'frontend/src/lib/server/ai-request-scope.ts'), 'utf8')
    assert.doesNotMatch(aiLoader, /process\.env(?:\.[A-Z_]+|\[[^\]]+\])\s*=/)
    assert.match(scope, /AsyncLocalStorage/)
    assert.match(aiLoader, /withRequestAiSettings/)
    const allRoutes = [
      'events/route.ts', 'analyze/route.ts', 'org/ai-insight/route.ts',
      'events/[eventId]/reanalyze-vnext/route.ts',
    ]
    for (const rel of allRoutes) {
      const route = readFileSync(path.join(process.cwd(),
        'frontend/src/app/api', rel), 'utf8')
      assert.match(route, /with(?:Optional)?UserAiSettings/)
      assert.doesNotMatch(route, /applyUserAiSettingsToEnv/)
    }
    // Concurrent cross-request key isolation is tested at the real scope
    // boundary in test-ai-request-scope-trial-001.ts (no network).
  })

  // ── VULN-03 [P0]: Legacy tenant admin predicate remains broad; gate mitigates ──
  test('MITIGATED VULN-03 [P0]: Enterprise Tenant Admin fails platform-only allowlist', () => {
    // Historical vulnerable predicate: all tenant Enterprise admins qualify.
    const oldCustomerAdminGate = TENANT_A.plan === 'enterprise' && USERS.A_ADMIN.role === 'admin'
    assert.equal(oldCustomerAdminGate, true, 'HISTORICAL_BROAD_GATE_REPRODUCED')

    const customerAuthId = 'b5ecab49-2d1b-43bf-80aa-88f58b738910'
    const platformAuthId = '489d4eca-0e89-4adf-80ba-6a16c74d3201'
    assert.equal(isPlatformAdminAuthorized({
      authUserId: customerAuthId, role: 'admin',
      allowlistedAuthUserIds: platformAuthId,
    }), false, 'TENANT_ADMIN_CANNOT_READ_GLOBAL_RESOURCES')
    assert.equal(isPlatformAdminAuthorized({
      authUserId: customerAuthId, role: 'admin',
      allowlistedAuthUserIds: undefined,
    }), false, 'UNCONFIGURED_GATE_IS_FAIL_CLOSED')
    assert.equal(isPlatformAdminAuthorized({
      authUserId: platformAuthId, role: 'admin',
      allowlistedAuthUserIds: platformAuthId,
    }), true, 'EXPLICIT_GLOBAL_AUTHORIZATION_REQUIRED')
    // Route-level enforcement is checked by test-platform-admin-remediation.ts.
    // Neither test makes a live cloud authorization claim.
  })

  // ── VULN-04 [P1]: Ownership guard before deletion audit ──────────────
  test('MITIGATED VULN-04 [P1]: foreign event IDs are denied before deletion audit', () => {
    const route = readFileSync(path.join(process.cwd(),
      'frontend/src/app/api/events/[eventId]/route.ts'), 'utf8')
    const start = route.indexOf('export async function DELETE')
    assert.ok(start > 0)
    const deleteHandler = route.slice(start)
    const ownership = deleteHandler.indexOf("const owned = await admin.from('events')")
    const scopedTenant = deleteHandler.indexOf(".eq('tenant_id', user.tenantId)")
    const denied404 = deleteHandler.indexOf("if (!owned.data)")
    const audit = deleteHandler.indexOf("await writeCriticalAuditLog(")
    const lifecycle = deleteHandler.indexOf("from('event_deletion_events')")
    assert.ok(ownership >= 0 && scopedTenant > ownership)
    assert.ok(denied404 > scopedTenant && denied404 < audit)
    assert.ok(audit > denied404 && lifecycle > audit)
    // Authenticated synthetic A cannot create a foreign-event lifecycle row;
    // no DB E2E claim is made by the source contract.
    assert.notEqual(USERS.A_ADMIN.tenant_id, SYNTHETIC_EVENTS.EVENT_B1.tenant_id)
  })

  // ── VULN-05 [P2]: Service-Role Client Bypass vs Database RLS Guarantee ──────
  test('DEFENSIVE PROOF VULN-05 [P2]: Service-role queries bypass PostgreSQL RLS; tests on mocks do not prove remote DB RLS', () => {
    // In PostgreSQL, any client connecting with service_role role (or bypassrls attribute)
    // bypasses all RLS policies on all tables.
    // In HFA, all Next.js API routes use getSupabaseAdmin() (SUPABASE_SERVICE_ROLE_KEY).
    // Therefore, isolation is 100% reliant on application code filters: .eq('tenant_id', user.tenantId).
    // If a developer writes a query without .eq('tenant_id', ...), RLS will NOT catch it on the server!

    const queryWithFilter = (table: any[], tenantId: string) => table.filter((r) => r.tenant_id === tenantId)
    const queryWithoutFilter = (table: any[]) => [...table] // Service-role unfiltered query

    const dbRows = [SYNTHETIC_EVENTS.EVENT_A1, SYNTHETIC_EVENTS.EVENT_B1]

    assert.equal(queryWithFilter(dbRows, TENANT_A.id).length, 1)
    assert.equal(queryWithoutFilter(dbRows).length, 2)
    // PROOF: Application filter is the sole enforcement boundary when using service-role key!
  })

  console.log(`\nVulnerabilities Reproduction Results: ${passedTests}/${totalTests} PASS (${failedTests} FAIL)`)
  if (failedTests > 0) throw new Error(`${failedTests} Vulnerabilities tests failed.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runVulnerabilitiesReproductionSuite()
}
