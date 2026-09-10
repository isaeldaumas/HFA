/**
 * Authoritative server-side tenant/role resolver.
 *
 * After auth.getUser(token) validates the bearer token, tenant and role MUST
 * be resolved from public.users (service-role query) — never from
 * user_metadata, app_metadata, request headers, query params, or body.
 *
 * Identity model:
 *   authUserId   — auth.users.id (UUID from Supabase Auth JWT)
 *   publicUserId — public.users.id (UUID; equals authUserId for new flows;
 *                  may differ for legacy rows created before OAuth wiring)
 *   tenantId     — resolved from public.users.tenant_id
 *   role         — resolved from public.users.role
 *
 * Resolution order:
 *   A. Match public.users by id = authUserId (DIRECT_AUTH_ID — preferred)
 *   B. Match public.users by email = authenticated confirmed email (LEGACY_CONFIRMED_EMAIL)
 *      Requires: email present AND emailConfirmedAt non-null, exactly one active row.
 *      Rejects: unconfirmed email, ambiguous match, inactive row, DB error.
 *
 * Fail-closed: any ambiguity, inactivity, unconfirmed email, or missing
 * association → 403. Infrastructure errors → 503.
 */

import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Caller-supplied identity from auth.getUser(token).
 * All fields must come from the validated auth response — never from request body/headers.
 */
export type AuthenticatedIdentity = {
  /** auth.users.id — UUID from the validated JWT */
  authUserId: string
  /** Email from auth.users — never from request body/query */
  email?: string
  /** auth.users.email_confirmed_at — required for legacy email binding */
  emailConfirmedAt?: string | null
}

/**
 * How the public.users row was bound to the auth identity.
 * DIRECT_AUTH_ID: public.users.id = auth.users.id (canonical, no ambiguity)
 * LEGACY_CONFIRMED_EMAIL: matched by confirmed email — planned for migration to DIRECT_AUTH_ID
 */
export type IdentityBinding = 'DIRECT_AUTH_ID' | 'LEGACY_CONFIRMED_EMAIL'

export type AuthorizedUserContext = {
  /** UUID from auth.users — use for Supabase Auth Admin API calls (updateUserById etc.) */
  authUserId: string
  /** UUID from public.users — use for all public.users FK references (submitted_by, actor_id, etc.) */
  publicUserId: string
  tenantId: string
  role: string
  email: string | undefined
  /** How this context was bound: DIRECT_AUTH_ID is preferred; LEGACY_CONFIRMED_EMAIL is temporary */
  identityBinding: IdentityBinding
}

type PublicUserRow = {
  id: string
  tenant_id: string
  role: string
  is_active: boolean
  email: string | null
}

type TenantRow = {
  id: string
  is_active: boolean
}

export type ResolveResult =
  | { ok: true; context: AuthorizedUserContext }
  | { ok: false; status: 401 | 403 | 503; detail: string }

async function assertTenantActive(
  admin: SupabaseClient,
  tenantId: string,
): Promise<ResolveResult | null> {
  const tenantRes = await admin
    .from('tenants')
    .select('id, is_active')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantRes.error) {
    console.error('[authorized-user-context] DB error checking tenant active', {
      tenantId,
      error: tenantRes.error,
    })
    return { ok: false, status: 503, detail: 'Erro temporário ao verificar tenant' }
  }
  if (!tenantRes.data) {
    return { ok: false, status: 403, detail: 'Tenant não encontrado' }
  }
  const tenant = tenantRes.data as TenantRow
  if (!tenant.is_active) {
    return { ok: false, status: 403, detail: 'Tenant desativado' }
  }
  return null // tenant is active — no error
}

/**
 * Resolves the authoritative user context from public.users.
 *
 * @param admin     Service-role Supabase client (never anon)
 * @param identity  Validated identity from auth.getUser() — never from request body
 */
export async function resolveAuthorizedUserContext(
  admin: SupabaseClient,
  identity: AuthenticatedIdentity,
): Promise<ResolveResult> {
  const { authUserId, email, emailConfirmedAt } = identity

  // ── Path A: DIRECT_AUTH_ID ────────────────────────────────────────────────
  // Preferred: match public.users by id = auth.users.id.
  // No email required; works for all new registrations.
  const byId = await admin
    .from('users')
    .select('id, tenant_id, role, is_active, email')
    .eq('id', authUserId)
    .maybeSingle()

  if (byId.error) {
    console.error('[authorized-user-context] DB error resolving by id', {
      authUserId,
      error: byId.error,
    })
    return { ok: false, status: 503, detail: 'Erro temporário ao resolver autorização' }
  }

  if (byId.data) {
    const row = byId.data as PublicUserRow
    if (!row.is_active) {
      return { ok: false, status: 403, detail: 'Conta inativa' }
    }
    if (!row.tenant_id) {
      return { ok: false, status: 403, detail: 'Conta sem tenant associado' }
    }
    // Verify tenant is also active
    const tenantError = await assertTenantActive(admin, String(row.tenant_id))
    if (tenantError) return tenantError
    return {
      ok: true,
      context: {
        authUserId,
        publicUserId: String(row.id),
        tenantId: String(row.tenant_id),
        role: String(row.role ?? 'viewer'),
        email: email,
        identityBinding: 'DIRECT_AUTH_ID',
      },
    }
  }

  // ── Path B: LEGACY_CONFIRMED_EMAIL ────────────────────────────────────────
  // Fallback for legacy rows where public.users.id ≠ auth.users.id.
  // Strict requirements: email present, confirmed, single active match.
  // When auth_user_id migration lands, this path will be eliminated.

  if (!email?.trim()) {
    return {
      ok: false,
      status: 403,
      detail: 'Usuário não encontrado e sem email para compatibilidade',
    }
  }

  // Require confirmed email to prevent account takeover via unconfirmed address
  if (!emailConfirmedAt) {
    return {
      ok: false,
      status: 403,
      detail: 'Email não confirmado — não é possível resolver conta legada',
    }
  }

  const normalizedEmail = email.trim().toLowerCase()

  const byEmail = await admin
    .from('users')
    .select('id, tenant_id, role, is_active, email')
    .eq('email', normalizedEmail)
    .limit(2)

  if (byEmail.error) {
    console.error('[authorized-user-context] DB error resolving by email', {
      authUserId,
      error: byEmail.error,
    })
    return { ok: false, status: 503, detail: 'Erro temporário ao resolver autorização' }
  }

  const rows = (byEmail.data ?? []) as PublicUserRow[]

  if (rows.length === 0) {
    return { ok: false, status: 403, detail: 'Usuário não encontrado' }
  }

  if (rows.length > 1) {
    // Multiple public.users rows with same email — cannot resolve safely
    console.error('[authorized-user-context] ambiguous email match', {
      authUserId,
      email: normalizedEmail,
      count: rows.length,
    })
    return { ok: false, status: 403, detail: 'Associação de conta ambígua' }
  }

  const legacyRow = rows[0]

  if (!legacyRow.is_active) {
    return { ok: false, status: 403, detail: 'Conta inativa' }
  }
  if (!legacyRow.tenant_id) {
    return { ok: false, status: 403, detail: 'Conta sem tenant associado' }
  }
  // Verify tenant is also active
  const legacyTenantError = await assertTenantActive(admin, String(legacyRow.tenant_id))
  if (legacyTenantError) return legacyTenantError

  // Log legacy binding for audit trail and future migration tracking
  console.warn('[authorized-user-context] legacy email binding used', {
    authUserId,
    publicUserId: legacyRow.id,
    email: normalizedEmail,
    // Note: publicUserId may differ from authUserId for pre-OAuth rows
    idDiffers: String(legacyRow.id) !== authUserId,
  })

  return {
    ok: true,
    context: {
      authUserId,
      publicUserId: String(legacyRow.id),
      tenantId: String(legacyRow.tenant_id),
      role: String(legacyRow.role ?? 'viewer'),
      email: email,
      identityBinding: 'LEGACY_CONFIRMED_EMAIL',
    },
  }
}
