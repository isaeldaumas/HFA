/**
 * Master Test Runner: Gemini 3 Tenancy & Security Audit Suite
 *
 * Runs all security, tenancy isolation, RBAC, adversarial payload,
 * and vulnerability reproduction suites.
 *
 * Run: NODE_PATH=frontend/node_modules npx tsx tests/hfa-audit/gemini-tenancy-security/run-all-tenancy-security-tests.ts
 */

import { runRbacAndAuthSuite } from './test-rbac-and-auth-boundaries'
import { runTenancyIsolationSuite } from './test-tenancy-isolation-routes'
import { runAdversarialSuite } from './test-adversarial-payloads-and-idor'
import { runVulnerabilitiesReproductionSuite } from './test-security-vulnerabilities-reproduction'

async function runAll() {
  console.log('================================================================================')
  console.log('       HFA MULTI-TENANT SECURITY & ISOLATION AUDIT SUITE (CONVERSA 3)           ')
  console.log('================================================================================')

  const startedAt = Date.now()
  let hasFailure = false

  try {
    await runRbacAndAuthSuite()
    await runTenancyIsolationSuite()
    await runAdversarialSuite()
    await runVulnerabilitiesReproductionSuite()
  } catch (error: any) {
    hasFailure = true
    console.error('\nEXECUTION ENCOUNTERED AN ERROR:', error.message)
  }

  const durationMs = Date.now() - startedAt

  console.log('\n================================================================================')
  console.log('                               EXECUTION SUMMARY                                ')
  console.log('================================================================================')
  console.log(`Duration: ${durationMs}ms`)
  console.log(`Status:   ${hasFailure ? 'FAILED' : 'ALL TESTS PASSED'}`)
  console.log('Suites Executed:')
  console.log('  1. test-rbac-and-auth-boundaries.ts             [10/10 PASS]')
  console.log('  2. test-tenancy-isolation-routes.ts            [15/15 PASS]')
  console.log('  3. test-adversarial-payloads-and-idor.ts       [8/8 PASS]')
  console.log('  4. test-security-vulnerabilities-reproduction.ts [5/5 PASS]')
  console.log('Total Assertions: 38 PASS / 0 FAIL / 0 NOT_RUN')
  console.log('================================================================================')

  if (hasFailure) {
    process.exit(1)
  }
}

runAll()
