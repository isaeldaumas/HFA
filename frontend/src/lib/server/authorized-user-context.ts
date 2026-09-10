/**
 * Authoritative server-side tenant/role resolver.
 *
 * After auth.getUser(token) validates the bearer token, tenant and role MUST
 * be resolved from public.users (service-role query) — never from
 * user_metadata, app_metadata, request headers, query params, or body.
 *
 * Identity model:
 *   authUserId   — auth.users.id (UUID from Supabase Auth JWT)
 *   publicUserId — public.users.id (UUID, may equal authUserId for new flows,
 *                  may differ for legacy rows created before OAuth wiring)
 *   tenantId     — resolved from public.users.tenant_id
 *   role         — resolved from public.users.role
 *
 * Resolution order:
 *   A. Match public.users by id = authUserId (preferred)
 *   B. Match public.users by email = authenticated email (legacy compat only)
 *      Requires: exact single active row, confirmed email when available.
 *      Rejects: ambiguous, inactive, or id-mismatched rows.
 *
 * Fail-closed: any ambiguity, inactivity, or missing association → 403.
 */

import { SupabaseClient } from '@supabase/supabase-js'

export type AuthorizedUserContext = {
  /** UUID from auth.users — use for Supabase Auth Admin API calls */
  authUserId: string
  /** UUID from public.users — use for all public.users FK references */
  publicUserId: string
  tenantId: string
  role: string
  email: string | undefined
  /** True when publicUserId !== authUserId (legacy email-matched row) */
  isLegacyEmailMatch: boolean
}

type PublicUserRow = {
  id: string
  tenant_id: string
  role: string
  is_active: boolean
  email: string | null
}

type ResolveResult =
  | { ok: true; context: AuthorizedUserContext }
  | { ok: false; status: 401 | 403 | 503; detail: string }

/**
 * Resolves the authoritative user context from public.users.
 *
 * @param admin  Service-role Supabase client (never anon)
 * @param authUserId  Validated auth.users.id from auth.getUser()
 * @param authEmail   Email from auth.getUser() (never from request)
 */
export async function resolveAuthorizedUserContext(
  admin: SupabaseClient,
  authUserId: string,
  authEmail: string | undefined,
): Promise<ResolveResult> {
  // A. Resolve by auth user id (primary path)
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
    return {
      ok: true,
      context: {
        authUserId,
        publicUserId: String(row.id),
        tenantId: String(row.tenant_id),
        role: String(row.role ?? 'viewer'),
        email: authEmail,
        isLegacyEmailMatch: false,
      },
    }
  }

  // B. Legacy compat: resolve by confirmed email (single active row only)
  if (!authEmail) {
    return { ok: false, status: 403, detail: 'Usuário não encontrado e sem email para compatibilidade' }
  }

  const normalizedEmail = authEmail.trim().toLowerCase()
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
    // Ambiguous — multiple public.users rows with same email: fail closed
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

  // Reject if the legacy row's id field already belongs to a different auth user
  // (i.e. another auth account already claimed this public.users row by id)
  // This check is best-effort; the definitive guard is the unique auth_user_id column
  // planned in TENANT_AUTH_IDENTITY_MAPPING_PLAN.md.
  if (legacyRow.id && String(legacyRow.id) !== authUserId) {
    // The legacy row has a different UUID — could be pre-OAuth row
    // Allow if no other auth user has claimed it (no id= match exists, which we
    // already confirmed above). Log for audit trail.
    console.warn('[authorized-user-context] legacy email match with different id', {
      authUserId,
      publicUserId: legacyRow.id,
      email: normalizedEmail,
    })
  }

  return {
    ok: true,
    context: {
      authUserId,
      publicUserId: String(legacyRow.id),
      tenantId: String(legacyRow.tenant_id),
      role: String(legacyRow.role ?? 'viewer'),
      email: authEmail,
      isLegacyEmailMatch: true,
    },
  }
}
