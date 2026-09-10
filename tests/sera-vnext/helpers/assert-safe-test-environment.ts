/**
 * Safety guard for integrated regression tests.
 *
 * Must be called BEFORE any write or mutation in REAL_DB/REAL_API tests.
 *
 * Requirements enforced:
 * 1. HFA_TEST_ENVIRONMENT must be "staging" or "dev"
 * 2. SUPABASE_STAGING_URL must be HTTPS
 * 3. SUPABASE_STAGING_URL hostname must be exactly <HFA_STAGING_SUPABASE_PROJECT_REF>.supabase.co
 *    Custom domains are not accepted unless added to an explicit allowlist.
 * 4. Fixture tenant/user IDs must be explicitly provided (never arbitrary .limit(1))
 * 5. Does NOT log secret values — only names of missing vars
 *
 * NOTE: When the runner set level=READ_ONLY, MUTATING_SYNTHETIC tests are excluded
 * before they start. This guard is a defense-in-depth layer for when the runner
 * does reach a mutating test (level=MUTATING_SYNTHETIC or level unset + env present).
 *
 * Usage (single-tenant test):
 *   const fixture = assertSafeTestEnvironment({ requiresFixtureIds: true })
 *   // use fixture.tenantAId, fixture.userAId
 *
 * Usage (cross-tenant test):
 *   const fixture = assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: true })
 *   // use fixture.tenantAId, fixture.userAId, fixture.tenantBId!, fixture.userBId!
 */

export type SafeTestFixture = {
  /** Verified safe environment: 'staging' | 'dev' */
  environment: string
  /** Supabase project ref (extracted from URL, verified to match allowlist) */
  projectRef: string
  /** Tenant A fixture ID — required for all REAL_DB/REAL_API mutating tests */
  tenantAId: string
  /** User A fixture ID — required for all REAL_DB/REAL_API mutating tests */
  userAId: string
  /** Tenant B fixture ID — required for cross-tenant tests */
  tenantBId: string | null
  /** User B fixture ID — required for cross-tenant tests */
  userBId: string | null
}

type AssertOptions = {
  /** If true, requires HFA_TEST_TENANT_A_ID and HFA_TEST_USER_A_ID. Default: true */
  requiresFixtureIds?: boolean
  /** If true, also requires HFA_TEST_TENANT_B_ID and HFA_TEST_USER_B_ID */
  requiresCrossTenant?: boolean
}

/**
 * Verifies the environment is safe for integrated tests.
 * Throws with a clear ENVIRONMENT_NOT_CONFIGURED message if any check fails.
 * Never prints secret values.
 *
 * @throws Error with ENVIRONMENT_NOT_CONFIGURED or FIXTURE_SAFETY_VIOLATION prefix
 */
export function assertSafeTestEnvironment(opts: AssertOptions = {}): SafeTestFixture {
  const { requiresFixtureIds = true, requiresCrossTenant = false } = opts

  // ── 1. Environment marker ─────────────────────────────────────────────────
  const env = process.env.HFA_TEST_ENVIRONMENT?.trim().toLowerCase()
  if (!env || (env !== 'staging' && env !== 'dev')) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: HFA_TEST_ENVIRONMENT must be "staging" or "dev". ' +
        'This test must not run in production or unidentified environments.'
    )
  }

  // ── 2. Supabase URL present and HTTPS ─────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_STAGING_URL?.trim()
  if (!supabaseUrl) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL is not set. ' +
        'Configure staging secrets before running integrated tests.'
    )
  }
  if (!supabaseUrl.startsWith('https://')) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL must use HTTPS. ' +
        'Rejecting non-HTTPS Supabase URL to prevent accidental local/production use.'
    )
  }

  // ── 3. Project ref allowlist — exact hostname match ───────────────────────
  // Require hostname to be exactly <ref>.supabase.co — no custom domains accepted.
  // If a verified custom domain is needed, create a separate explicit allowlist.
  const allowedRef = process.env.HFA_STAGING_SUPABASE_PROJECT_REF?.trim()
  if (!allowedRef) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: HFA_STAGING_SUPABASE_PROJECT_REF is not set. ' +
        'This variable must be configured before running integrated tests. ' +
        'It prevents accidental execution against wrong Supabase projects.'
    )
  }

  let urlHost: string
  try {
    urlHost = new URL(supabaseUrl).hostname
  } catch {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL is not a valid URL.'
    )
  }

  // Enforce exact hostname: <allowedRef>.supabase.co only
  const expectedHost = `${allowedRef}.supabase.co`
  if (urlHost !== expectedHost) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL hostname "${urlHost}" does not match ` +
        `expected "${expectedHost}" (from HFA_STAGING_SUPABASE_PROJECT_REF). ` +
        'Only the canonical Supabase hostname is accepted. ' +
        'Custom domains are not accepted to prevent ambiguous project identification.'
    )
  }

  // Paranoia: reject any localhost/loopback that somehow passed the above
  if (
    urlHost.includes('localhost') ||
    urlHost.includes('127.0.0.1') ||
    urlHost.includes('0.0.0.0')
  ) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL must not be a localhost URL. ' +
        'Integrated tests require a real staging Supabase project.'
    )
  }

  // ── 4. Fixture IDs ────────────────────────────────────────────────────────
  let tenantAId = ''
  let userAId = ''
  let tenantBId: string | null = null
  let userBId: string | null = null

  if (requiresFixtureIds) {
    tenantAId = process.env.HFA_TEST_TENANT_A_ID?.trim() || ''
    userAId = process.env.HFA_TEST_USER_A_ID?.trim() || ''

    const missing: string[] = []
    if (!tenantAId) missing.push('HFA_TEST_TENANT_A_ID')
    if (!userAId) missing.push('HFA_TEST_USER_A_ID')

    if (requiresCrossTenant) {
      tenantBId = process.env.HFA_TEST_TENANT_B_ID?.trim() || null
      userBId = process.env.HFA_TEST_USER_B_ID?.trim() || null
      if (!tenantBId) missing.push('HFA_TEST_TENANT_B_ID')
      if (!userBId) missing.push('HFA_TEST_USER_B_ID')
    }

    if (missing.length > 0) {
      // This is a configuration failure, not a skip.
      // The runner should have excluded this test if the environment is not configured.
      // If we reach here, it means the runner allowed this test but the fixture is missing.
      throw new Error(
        `ENVIRONMENT_NOT_CONFIGURED: Missing fixture variables: ${missing.join(', ')}. ` +
          'Real mutating tests must use explicit fixture tenant/user IDs. ' +
          'Provision staging fixtures and set these variables before running MUTATING_SYNTHETIC tests. ' +
          'If this test should not run in the current environment, ' +
          'ensure HFA_INTEGRATED_REGRESSION_LEVEL=READ_ONLY is set in the runner.'
      )
    }
  }

  return {
    environment: env,
    projectRef: allowedRef,
    tenantAId,
    userAId,
    tenantBId,
    userBId,
  }
}

/**
 * Validates that an ID being used in a test matches a declared fixture ID.
 * Prevents accidental use of production/real data.
 */
export function assertIsFixtureId(
  actualId: string,
  expectedId: string,
  label: string
): void {
  if (actualId !== expectedId) {
    throw new Error(
      `FIXTURE_SAFETY_VIOLATION: ${label} ID "${actualId}" does not match ` +
        `declared fixture ID. Tests must use exclusively declared fixture IDs. ` +
        'This prevents accidental reads/writes to real data.'
    )
  }
}
