/**
 * Safety guard for integrated regression tests.
 *
 * Must be called BEFORE any write or mutation in REAL_DB/REAL_API tests.
 *
 * Requirements enforced:
 * 1. HFA_TEST_ENVIRONMENT must be "staging" or "dev"
 * 2. SUPABASE_STAGING_URL must be HTTPS
 * 3. SUPABASE_STAGING_URL must match HFA_STAGING_SUPABASE_PROJECT_REF allowlist
 * 4. Fixture tenant/user IDs must be explicitly provided (never arbitrary)
 * 5. Does NOT log secret values — only names of missing vars
 *
 * Usage:
 *   import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
 *   const fixture = assertSafeTestEnvironment({ requiresMutation: true })
 *   // then use fixture.tenantAId, fixture.userAId etc.
 */

export type SafeTestFixture = {
  /** Verified safe environment: 'staging' | 'dev' */
  environment: string
  /** Supabase project ref (extracted from URL, verified against allowlist) */
  projectRef: string
  /** Tenant A fixture ID — required for all REAL_DB/REAL_API tests */
  tenantAId: string
  /** User A fixture ID — required for mutating tests */
  userAId: string
  /** Tenant B fixture ID — required for cross-tenant tests */
  tenantBId: string | null
  /** User B fixture ID — required for cross-tenant tests */
  userBId: string | null
}

type AssertOptions = {
  /** If true, requires fixture tenant/user IDs. Default: true */
  requiresFixtureIds?: boolean
  /** If true, also requires tenant B and user B for cross-tenant tests */
  requiresCrossTenant?: boolean
}

/**
 * Verifies the environment is safe for integrated tests.
 * Throws with a clear ENVIRONMENT_NOT_CONFIGURED message if any check fails.
 * Never prints secret values.
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

  // ── 3. Project ref allowlist ──────────────────────────────────────────────
  const allowedRef = process.env.HFA_STAGING_SUPABASE_PROJECT_REF?.trim()
  if (!allowedRef) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: HFA_STAGING_SUPABASE_PROJECT_REF is not set. ' +
        'This repository variable must be configured before running integrated tests. ' +
        'It prevents accidental execution against wrong Supabase projects.'
    )
  }

  // Extract project ref from URL: https://<ref>.supabase.co
  const urlHost = new URL(supabaseUrl).hostname
  const extractedRef = urlHost.split('.')[0]
  if (extractedRef !== allowedRef) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: SUPABASE_STAGING_URL project ref "${extractedRef}" ` +
        `does not match HFA_STAGING_SUPABASE_PROJECT_REF "${allowedRef}". ` +
        'Refusing to run against an unallowlisted Supabase project.'
    )
  }

  // Reject localhost in non-dev or suspicious patterns
  if (
    supabaseUrl.includes('localhost') ||
    supabaseUrl.includes('127.0.0.1') ||
    supabaseUrl.includes('0.0.0.0')
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
      throw new Error(
        `ENVIRONMENT_NOT_CONFIGURED: Missing fixture variables: ${missing.join(', ')}. ` +
          'Real tests must use explicit fixture tenant/user IDs — never arbitrary DB rows. ' +
          'Provision staging fixtures before running integrated tests.'
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
 * Validates that a tenant or user ID being used in a test matches the
 * declared fixture ID. Prevents accidental use of production data.
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
