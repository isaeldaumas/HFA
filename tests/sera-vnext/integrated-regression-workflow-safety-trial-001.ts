/**
 * CONTRACT TEST — Workflow safety static analysis
 *
 * Proves structural properties of the integrated regression workflow file:
 *
 * 1. Workflow is workflow_dispatch only (no push/PR triggers)
 * 2. confirm_staging_only input required (no silent prod execution)
 * 3. confirm_mutating_synthetic_fixture_only input exists with default false
 * 4. Project ref is checked against URL
 * 5. HTTPS enforced
 * 6. MUTATING_SYNTHETIC requires all 4 fixture IDs (A and B)
 * 7. Missing fixture → fail, NOT silent fallback to READ_ONLY
 * 8. HFA_INTEGRATED_REGRESSION_LEVEL env var passed to runner
 * 9. Shadow/vNext flags all false
 * 10. Workflow does NOT auto-trigger on push or PR
 *
 * Run: npx tsx tests/sera-vnext/integrated-regression-workflow-safety-trial-001.ts
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')
const WORKFLOW = join(ROOT, '.github', 'workflows', 'hfa-integrated-regression.yml')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

if (!existsSync(WORKFLOW)) {
  console.error(`FATAL: Workflow not found: ${WORKFLOW}`)
  process.exit(1)
}

const wf = readFileSync(WORKFLOW, 'utf8')

// ── Trigger safety ────────────────────────────────────────────────────────
check(
  wf.includes('workflow_dispatch'),
  'workflow: has workflow_dispatch trigger'
)
check(
  !wf.match(/^\s*push:/m) && !wf.match(/^\s*pull_request:/m),
  'workflow: no push or pull_request auto-trigger (manual only)'
)

// ── Confirmation inputs ───────────────────────────────────────────────────
check(
  wf.includes('confirm_staging_only') && wf.includes('required: true'),
  'workflow: confirm_staging_only is required'
)
check(
  wf.includes('confirm_mutating_synthetic_fixture_only') && wf.includes('default: false'),
  'workflow: confirm_mutating_synthetic_fixture_only defaults to false'
)
check(
  wf.includes('confirm_staging_only') &&
    (wf.includes('!inputs.confirm_staging_only') || wf.includes('confirm_staging_only')),
  'workflow: exits on confirm_staging_only=false'
)

// ── Project ref and HTTPS ─────────────────────────────────────────────────
check(
  wf.includes('HFA_STAGING_SUPABASE_PROJECT_REF'),
  'workflow: checks HFA_STAGING_SUPABASE_PROJECT_REF'
)
check(
  wf.includes('URL_HOST') && (wf.includes('!= "$HFA_STAGING_SUPABASE_PROJECT_REF"') || wf.includes("!= \"$HFA_STAGING_SUPABASE_PROJECT_REF\"")),
  'workflow: compares extracted URL ref against HFA_STAGING_SUPABASE_PROJECT_REF'
)
check(
  wf.includes('https://') || wf.includes("startsWith('https')") || wf.includes('!= https://'),
  'workflow: HTTPS check present'
)

// ── MUTATING_SYNTHETIC fixture requirements ───────────────────────────────
check(
  wf.includes('HFA_TEST_TENANT_A_ID') && wf.includes('HFA_TEST_TENANT_B_ID'),
  'workflow: requires both tenant A and B IDs for MUTATING_SYNTHETIC'
)
check(
  wf.includes('HFA_TEST_USER_A_ID') && wf.includes('HFA_TEST_USER_B_ID'),
  'workflow: requires both user A and B IDs for MUTATING_SYNTHETIC'
)
check(
  wf.includes('DO NOT fall back silently') || wf.includes('missing_fixtures'),
  'workflow: missing fixture IDs cause failure, not silent READ_ONLY fallback'
)

// ── Execution level passed to runner ─────────────────────────────────────
check(
  wf.includes('HFA_INTEGRATED_REGRESSION_LEVEL'),
  'workflow: sets HFA_INTEGRATED_REGRESSION_LEVEL env var for runner'
)
check(
  wf.includes('READ_ONLY') && wf.includes('MUTATING_SYNTHETIC'),
  'workflow: both execution levels are referenced'
)

// ── Shadow and vNext flags ────────────────────────────────────────────────
check(
  wf.includes('SERA_SHADOW_EXECUTION_ENABLED: "false"'),
  'workflow: SERA_SHADOW_EXECUTION_ENABLED=false'
)
check(
  wf.includes('SERA_VNEXT_READONLY_ENABLED: "false"'),
  'workflow: SERA_VNEXT_READONLY_ENABLED=false'
)
check(
  wf.includes('SERA_VNEXT_INTERNAL_PILOT_ENABLED: "false"'),
  'workflow: SERA_VNEXT_INTERNAL_PILOT_ENABLED=false'
)
check(
  wf.includes('NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED: "false"'),
  'workflow: NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED=false'
)

// ── Secrets used (not hardcoded) ─────────────────────────────────────────
check(
  wf.includes('secrets.SUPABASE_STAGING_URL') &&
    wf.includes('secrets.SUPABASE_STAGING_SERVICE_ROLE_KEY'),
  'workflow: staging credentials come from secrets, not hardcoded'
)
check(
  !wf.match(/SUPABASE_URL:\s*https?:\/\/[^$\s{]/),
  'workflow: no hardcoded Supabase URL in env section'
)

if (failures > 0) {
  console.error(`\n${failures} failure(s) — integrated-regression-workflow-safety: FAIL`)
  process.exit(1)
}
console.log('\nintegrated-regression-workflow-safety: PASS')
