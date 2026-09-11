// AUDIT TEST — shadow rollback / kill-switch contract (flags remain OFF).
// Executar: npx tsx tests/hfa-audit/shadow-mode/shadow-mode-trial-003-rollback.ts

import {
  assertShadowFullyDisabled,
  describeShadowRollbackProcedure,
  readShadowFlagSnapshot,
  SHADOW_FLAG_NAMES,
} from '../../../frontend/src/lib/sera-shadow/rollback'
import { runShadowVNextIfEnabled } from '../../../frontend/src/lib/sera-shadow/run-shadow-analysis'
import { readFileSync } from 'node:fs'
import path from 'node:path'

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

// Force OFF for this process regardless of ambient env.
for (const name of SHADOW_FLAG_NAMES) {
  process.env[name] = 'false'
}

const snapshot = readShadowFlagSnapshot()
check(assertShadowFullyDisabled(snapshot), 'all SERA_SHADOW_* flags are false')
for (const name of SHADOW_FLAG_NAMES) {
  check(snapshot[name] === false, `${name}=false`)
}

const steps = describeShadowRollbackProcedure()
check(steps.length >= 5, 'rollback procedure has documented steps')
check(steps.some((step) => step.includes('< 5 minutes')), 'rollback target time documented')

async function main() {
  const fakeAdmin = new Proxy(
    {},
    {
      get() {
        throw new Error('admin must not be touched while shadow is disabled')
      },
    },
  ) as never

  const outcome = await runShadowVNextIfEnabled({
    admin: fakeAdmin,
    narrative: 'rollback contract narrative',
    context: {
      tenantId: 'tenant-rollback',
      legacyAnalysisId: 'analysis-rollback',
      legacyEventId: 'event-rollback',
      legacyEngineVersion: 'v1',
    },
  })
  check(outcome.status === 'SKIPPED_DISABLED', 'disabled shadow path returns SKIPPED_DISABLED')

  // Route fail-closed source contract
  const routeSource = readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/api/admin/sera-shadow/comparisons/route.ts'),
    'utf8',
  )
  check(routeSource.includes('isShadowAdminViewEnabled'), 'admin comparisons route gated by admin view flag')
  check(routeSource.includes("status: 404"), 'admin comparisons returns 404 when disabled')
  check(routeSource.includes('ercExcluded: true'), 'admin comparisons declares ercExcluded')

  const pageSource = readFileSync(
    path.resolve(__dirname, '../../../frontend/src/app/(dashboard)/admin/sera-shadow/comparisons/page.tsx'),
    'utf8',
  )
  check(pageSource.includes('NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED'), 'UI page fail-closed without public flag')
  check(pageSource.includes('read-only'), 'UI page documents read-only')

  console.log(failures === 0 ? 'SHADOW_MODE_TRIAL_003_OK' : `SHADOW_MODE_TRIAL_003_FAILED (${failures})`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
