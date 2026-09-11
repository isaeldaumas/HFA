/**
 * Resolve tenant prefix for REAL_* session helpers.
 *
 * Preference order:
 * 1. Explicit SERA_VNEXT_TEST_TENANT_PREFIX (or SERA_VNEXT_TEST_BLOCKED_TENANT_PREFIX for B)
 * 2. First 8 hex chars of HFA_TEST_TENANT_A_ID / HFA_TEST_TENANT_B_ID
 *
 * Integrated staging never falls back to legacy enterprise prefixes.
 */

export type ResolveTenantPrefixOpts = {
  /** Which staging fixture pair to resolve. Default: A */
  fixture?: 'A' | 'B'
}

function prefixFromUuid(tenantId: string): string | null {
  const compact = tenantId.replace(/-/g, '')
  if (/^[0-9a-f]{8}/i.test(compact)) return compact.slice(0, 8).toLowerCase()
  return null
}

export function resolveTestTenantPrefix(opts: ResolveTenantPrefixOpts = {}): string {
  const fixture = opts.fixture ?? 'A'
  const explicitEnv =
    fixture === 'B'
      ? process.env.SERA_VNEXT_TEST_BLOCKED_TENANT_PREFIX?.trim() ||
        process.env.SERA_VNEXT_TEST_TENANT_B_PREFIX?.trim()
      : process.env.SERA_VNEXT_TEST_TENANT_PREFIX?.trim()
  if (explicitEnv) return explicitEnv

  const tenantId =
    fixture === 'B'
      ? process.env.HFA_TEST_TENANT_B_ID?.trim()
      : process.env.HFA_TEST_TENANT_A_ID?.trim()
  if (tenantId) {
    const prefix = prefixFromUuid(tenantId)
    if (prefix) return prefix
  }

  const integrated =
    Boolean(process.env.HFA_INTEGRATED_REGRESSION_LEVEL?.trim()) ||
    process.env.HFA_TEST_ENVIRONMENT?.trim().toLowerCase() === 'staging'

  if (integrated) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: set fixture ${fixture} tenant id/prefix before running staging REAL_* trials ` +
        '(legacy enterprise prefixes are not used in integrated staging).'
    )
  }

  // Non-integrated local/dev legacy path only.
  return fixture === 'B' ? '9a52a850' : '3a68c15d'
}
