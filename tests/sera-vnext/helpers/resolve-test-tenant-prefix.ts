/**
 * Resolve tenant prefix for REAL_* session helpers.
 *
 * Preference order:
 * 1. Explicit SERA_VNEXT_TEST_TENANT_PREFIX
 * 2. First 8 hex chars of HFA_TEST_TENANT_A_ID (staging fixtures A/B)
 *
 * Does not fall back to the legacy enterprise prefix `3a68c15d` when running
 * under integrated staging (`HFA_TEST_ENVIRONMENT=staging` or an integrated
 * regression level). That legacy default caused false FAIL noise against the
 * authorized HFA staging project, which has no such tenant.
 */
export function resolveTestTenantPrefix(): string {
  const explicit = process.env.SERA_VNEXT_TEST_TENANT_PREFIX?.trim()
  if (explicit) return explicit

  const tenantA = process.env.HFA_TEST_TENANT_A_ID?.trim()
  if (tenantA) {
    const compact = tenantA.replace(/-/g, '')
    if (/^[0-9a-f]{8}/i.test(compact)) {
      return compact.slice(0, 8).toLowerCase()
    }
  }

  const integrated =
    Boolean(process.env.HFA_INTEGRATED_REGRESSION_LEVEL?.trim()) ||
    process.env.HFA_TEST_ENVIRONMENT?.trim().toLowerCase() === 'staging'

  if (integrated) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: set SERA_VNEXT_TEST_TENANT_PREFIX or HFA_TEST_TENANT_A_ID ' +
        'before running staging REAL_* trials (legacy enterprise prefix is not used).'
    )
  }

  // Non-integrated local/dev legacy path only.
  return '3a68c15d'
}
