/**
 * Shadow rollback / kill-switch helpers.
 * Does not enable Shadow Mode. Documents and validates fail-closed defaults.
 */

import {
  isShadowAdminViewEnabled,
  isShadowAutoComparisonEnabled,
  isShadowExecutionEnabled,
  isShadowPersistenceEnabled,
  isShadowValidationReportsEnabled,
} from './feature-flags'

export const SHADOW_FLAG_NAMES = [
  'SERA_SHADOW_EXECUTION_ENABLED',
  'SERA_SHADOW_PERSISTENCE_ENABLED',
  'SERA_SHADOW_ADMIN_VIEW_ENABLED',
  'SERA_SHADOW_AUTO_COMPARISON_ENABLED',
  'SERA_SHADOW_VALIDATION_REPORTS_ENABLED',
] as const

export type ShadowFlagSnapshot = Record<(typeof SHADOW_FLAG_NAMES)[number], boolean>

export function readShadowFlagSnapshot(): ShadowFlagSnapshot {
  return {
    SERA_SHADOW_EXECUTION_ENABLED: isShadowExecutionEnabled(),
    SERA_SHADOW_PERSISTENCE_ENABLED: isShadowPersistenceEnabled(),
    SERA_SHADOW_ADMIN_VIEW_ENABLED: isShadowAdminViewEnabled(),
    SERA_SHADOW_AUTO_COMPARISON_ENABLED: isShadowAutoComparisonEnabled(),
    SERA_SHADOW_VALIDATION_REPORTS_ENABLED: isShadowValidationReportsEnabled(),
  }
}

/** Emergency rollback = all flags false. Instant, no migration, no data mutation. */
export function assertShadowFullyDisabled(snapshot: ShadowFlagSnapshot = readShadowFlagSnapshot()): boolean {
  return SHADOW_FLAG_NAMES.every((name) => snapshot[name] === false)
}

export function describeShadowRollbackProcedure(): string[] {
  return [
    '1. Set all SERA_SHADOW_* env vars to false (or unset) in the target runtime.',
    '2. Redeploy/restart the process so env is re-read (Next.js process env).',
    '3. Confirm assertShadowFullyDisabled() === true.',
    '4. Confirm /api/admin/sera-shadow/comparisons returns 404.',
    '5. Confirm runShadowVNextIfEnabled returns SKIPPED_DISABLED without touching Supabase.',
    'Target rollback time: < 5 minutes (env flip + restart).',
    'No migration, no DELETE of historical shadow rows required for kill-switch.',
  ]
}
