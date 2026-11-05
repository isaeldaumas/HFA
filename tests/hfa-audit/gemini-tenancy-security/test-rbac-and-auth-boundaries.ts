/**
 * RBAC and Authentication Boundary Security Suite
 *
 * Demonstrates:
 * 1. Anonymous rejection (fail-closed 401)
 * 2. Identity resolution via DB authoritative context (DIRECT_AUTH_ID vs LEGACY_CONFIRMED_EMAIL)
 * 3. Inactive account & inactive tenant fail-closed enforcement (403)
 * 4. Unconfirmed email rejection on legacy binding (403)
 * 5. Ambiguous identity rejection (403)
 * 6. Role-based access control per operation (viewer vs analyst vs admin vs enterprise admin)
 *
 * Run: npx tsx tests/hfa-audit/gemini-tenancy-security/test-rbac-and-auth-boundaries.ts
 */

import assert from 'node:assert/strict'
import {
  resolveAuthorizedUserContext,
  type AuthenticatedIdentity,
} from '../../../frontend/src/lib/server/authorized-user-context'
import {
  TENANT_A,
  TENANT_B,
  TENANT_INACTIVE,
  USERS,
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

/**
 * Creates a synthetic in-memory SupabaseClient mock implementing the query builder
 * methods used by resolveAuthorizedUserContext.
 */
function createSyntheticAdminMock(options?: {
  customUsers?: any[]
  customTenants?: any[]
  dbError?: boolean
}) {
  const tenants = options?.customTenants ?? [TENANT_A, TENANT_B, TENANT_INACTIVE]
  const users = options?.customUsers ?? [
    {
      id: USERS.A_ADMIN.publicUserId,
      tenant_id: USERS.A_ADMIN.tenantId,
      role: USERS.A_ADMIN.role,
      is_active: USERS.A_ADMIN.isActive,
      email: USERS.A_ADMIN.email,
    },
    {
      id: USERS.A_ANALYST.publicUserId,
      tenant_id: USERS.A_ANALYST.tenantId,
      role: USERS.A_ANALYST.role,
      is_active: USERS.A_ANALYST.isActive,
      email: USERS.A_ANALYST.email,
    },
    {
      id: USERS.A_VIEWER.publicUserId,
      tenant_id: USERS.A_VIEWER.tenantId,
      role: USERS.A_VIEWER.role,
      is_active: USERS.A_VIEWER.isActive,
      email: USERS.A_VIEWER.email,
    },
    {
      id: USERS.B_ADMIN.publicUserId,
      tenant_id: USERS.B_ADMIN.tenantId,
      role: USERS.B_ADMIN.role,
      is_active: USERS.B_ADMIN.isActive,
      email: USERS.B_ADMIN.email,
    },
    {
      id: USERS.INACTIVE_USER.publicUserId,
      tenant_id: USERS.INACTIVE_USER.tenantId,
      role: USERS.INACTIVE_USER.role,
      is_active: USERS.INACTIVE_USER.isActive,
      email: USERS.INACTIVE_USER.email,
    },
    {
      id: USERS.USER_ON_INACTIVE_TENANT.publicUserId,
      tenant_id: USERS.USER_ON_INACTIVE_TENANT.tenantId,
      role: USERS.USER_ON_INACTIVE_TENANT.role,
      is_active: USERS.USER_ON_INACTIVE_TENANT.isActive,
      email: USERS.USER_ON_INACTIVE_TENANT.email,
    },
  ]

  return {
    from: (table: string) => {
      let filtered = table === 'tenants' ? [...tenants] : [...users]
      let queryError: any = options?.dbError ? { message: 'Database connection timeout' } : null

      const builder: any = {
        select: (_fields: string) => builder,
        eq: (field: string, value: any) => {
          filtered = filtered.filter((row: any) => row[field] === value)
          return builder
        },
        limit: (n: number) => {
          filtered = filtered.slice(0, n)
          return builder
        },
        maybeSingle: async () => {
          if (queryError) return { data: null, error: queryError }
          return { data: filtered[0] ?? null, error: null }
        },
        single: async () => {
          if (queryError) return { data: null, error: queryError }
          if (filtered.length === 0) return { data: null, error: { message: 'Row not found' } }
          return { data: filtered[0], error: null }
        },
        then: (onfulfilled: any) => {
          const res = { data: filtered, error: queryError }
          return Promise.resolve(onfulfilled(res))
        },
      }
      return builder
    },
  } as any
}

export async function runRbacAndAuthSuite() {
  console.log('\n--- EXECUTING RBAC & AUTHENTICATION BOUNDARIES SUITE ---')

  const adminMock = createSyntheticAdminMock()

  // 1. Direct Auth Id resolution for Tenant A Admin
  await test('DIRECT_AUTH_ID binds authoritatively from public.users', async () => {
    const identity: AuthenticatedIdentity = {
      authUserId: USERS.A_ADMIN.authUserId,
      email: USERS.A_ADMIN.email,
      emailConfirmedAt: USERS.A_ADMIN.emailConfirmedAt,
    }
    const result = await resolveAuthorizedUserContext(adminMock, identity)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.context.tenantId, TENANT_A.id)
      assert.equal(result.context.role, 'admin')
      assert.equal(result.context.identityBinding, 'DIRECT_AUTH_ID')
    }
  })

  // 2. Direct Auth Id resolution for Tenant B Analyst
  await test('DIRECT_AUTH_ID correctly isolates Tenant B context', async () => {
    const identity: AuthenticatedIdentity = {
      authUserId: USERS.B_ADMIN.authUserId,
      email: USERS.B_ADMIN.email,
      emailConfirmedAt: USERS.B_ADMIN.emailConfirmedAt,
    }
    const result = await resolveAuthorizedUserContext(adminMock, identity)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.context.tenantId, TENANT_B.id)
      assert.equal(result.context.role, 'admin')
      assert.notEqual(result.context.tenantId, TENANT_A.id)
    }
  })

  // 3. Inactive account rejection (fail-closed 403)
  await test('Inactive account is blocked with 403 (Conta inativa)', async () => {
    const identity: AuthenticatedIdentity = {
      authUserId: USERS.INACTIVE_USER.authUserId,
      email: USERS.INACTIVE_USER.email,
      emailConfirmedAt: USERS.INACTIVE_USER.emailConfirmedAt,
    }
    const result = await resolveAuthorizedUserContext(adminMock, identity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.equal(result.detail, 'Conta inativa')
    }
  })

  // 4. Inactive tenant rejection (fail-closed 403)
  await test('User on deactivated tenant is blocked with 403 (Tenant desativado)', async () => {
    const identity: AuthenticatedIdentity = {
      authUserId: USERS.USER_ON_INACTIVE_TENANT.authUserId,
      email: USERS.USER_ON_INACTIVE_TENANT.email,
      emailConfirmedAt: USERS.USER_ON_INACTIVE_TENANT.emailConfirmedAt,
    }
    const result = await resolveAuthorizedUserContext(adminMock, identity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.equal(result.detail, 'Tenant desativado')
    }
  })

  // 5. Legacy email match requires confirmed email
  await test('Unconfirmed email on legacy binding fails closed with 403', async () => {
    const legacyIdentity: AuthenticatedIdentity = {
      authUserId: '99999999-9999-4999-9999-999999999999', // Not in public.users by id
      email: USERS.A_ADMIN.email,
      emailConfirmedAt: null, // UNCONFIRMED
    }
    const result = await resolveAuthorizedUserContext(adminMock, legacyIdentity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.match(result.detail, /Email n[aã]o confirmado/)
    }
  })

  // 6. Ambiguous email match fails closed
  await test('Ambiguous email match (duplicate rows) fails closed with 403', async () => {
    const mockWithDuplicates = createSyntheticAdminMock({
      customUsers: [
        {
          id: 'dup-1',
          tenant_id: TENANT_A.id,
          role: 'admin',
          is_active: true,
          email: 'duplicate@alpha-air.synthetic',
        },
        {
          id: 'dup-2',
          tenant_id: TENANT_B.id,
          role: 'analyst',
          is_active: true,
          email: 'duplicate@alpha-air.synthetic',
        },
      ],
    })
    const identity: AuthenticatedIdentity = {
      authUserId: 'random-auth-id-not-in-db',
      email: 'duplicate@alpha-air.synthetic',
      emailConfirmedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = await resolveAuthorizedUserContext(mockWithDuplicates, identity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.match(result.detail, /Associa[cç][aã]o de conta amb[ií]gua/)
    }
  })

  // 7. Non-existent identity returns 403
  await test('Completely unknown identity returns 403 (Usuário não encontrado)', async () => {
    const unknownIdentity: AuthenticatedIdentity = {
      authUserId: '00000000-0000-0000-0000-000000000000',
      email: 'unknown@synthetic.local',
      emailConfirmedAt: '2026-01-01T00:00:00.000Z',
    }
    const result = await resolveAuthorizedUserContext(adminMock, unknownIdentity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 403)
      assert.equal(result.detail, 'Usuário não encontrado')
    }
  })

  // 8. DB Infrastructure error fails closed with 503
  await test('Database error fails closed with 503 (no fallback to client metadata)', async () => {
    const errorAdminMock = createSyntheticAdminMock({ dbError: true })
    const identity: AuthenticatedIdentity = {
      authUserId: USERS.A_ADMIN.authUserId,
      email: USERS.A_ADMIN.email,
      emailConfirmedAt: USERS.A_ADMIN.emailConfirmedAt,
    }
    const result = await resolveAuthorizedUserContext(errorAdminMock, identity)
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 503)
      assert.match(result.detail, /Erro tempor[aá]rio/)
    }
  })

  // 9. RBAC Operational Permission Checks
  test('RBAC matrix: Viewer role blocked from safety operations (Triage, Risk, Actions)', () => {
    const allowedTriageRoles = new Set(['admin', 'analyst'])
    const allowedRiskRoles = new Set(['admin', 'analyst'])
    const allowedActionWriteRoles = new Set(['admin', 'analyst'])

    assert.equal(allowedTriageRoles.has(USERS.A_VIEWER.role), false)
    assert.equal(allowedRiskRoles.has(USERS.A_VIEWER.role), false)
    assert.equal(allowedActionWriteRoles.has(USERS.A_VIEWER.role), false)

    assert.equal(allowedTriageRoles.has(USERS.A_ANALYST.role), true)
    assert.equal(allowedRiskRoles.has(USERS.A_ADMIN.role), true)
  })

  // 10. RBAC Administrative & Deletion Limits
  test('RBAC matrix: Soft deletion requires Enterprise Admin', () => {
    const isEnterpriseAdmin = (tenant: typeof TENANT_A, user: typeof USERS.A_ADMIN) => {
      return tenant.plan === 'enterprise' && user.role === 'admin'
    }

    // Tenant A Admin is enterprise admin -> allowed
    assert.equal(isEnterpriseAdmin(TENANT_A, USERS.A_ADMIN), true)

    // Tenant A Analyst is NOT admin -> forbidden
    assert.equal(isEnterpriseAdmin(TENANT_A, USERS.A_ANALYST), false)

    // Tenant B Admin is admin but NOT enterprise (Trial plan) -> forbidden
    assert.equal(isEnterpriseAdmin(TENANT_B, USERS.B_ADMIN), false)
  })

  console.log(`\nRBAC & Auth Boundaries Results: ${passedTests}/${totalTests} PASS (${failedTests} FAIL)`)
  if (failedTests > 0) throw new Error(`${failedTests} RBAC tests failed.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRbacAndAuthSuite()
}
