import { requireBearerUser, type ApiUserContext } from './api-auth'
import { getSupabaseAdmin } from './supabase-admin'
import { NextResponse } from 'next/server'
import { isPlatformAdminAuthorized } from './platform-admin-authority'

export async function requireAdmin(req: Request): Promise<ApiUserContext> {
  const user = await requireBearerUser(req)
  const admin = getSupabaseAdmin()
  const [tenant, userRow] = await Promise.all([
    admin.from('tenants').select('plan').eq('id', user.tenantId).single(),
    admin.from('users').select('role').eq('id', user.publicUserId).maybeSingle(),
  ])
  const role = String(userRow.data?.role ?? user.role ?? '').toLowerCase()
  if (tenant.data?.plan !== 'enterprise' || role !== 'admin') {
    throw new Response(
      JSON.stringify({ detail: 'Acesso restrito a administradores enterprise' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return user
}

/**
 * Only explicitly authorized global HFA operators may access platform-wide
 * tenants, billing, catalog, settings or administrative actions.
 *
 * A customer Enterprise admin remains a TENANT admin, not a platform admin.
 * A platform operator may be assigned to an active non-Enterprise tenant;
 * billing plan is never a global privilege predicate.
 * Absence of the protected server-side allowlist deliberately returns 403.
 * Configure HFA_PLATFORM_ADMIN_AUTH_USER_IDS before enabling these screens.
 */
export async function requirePlatformAdmin(req: Request): Promise<ApiUserContext> {
  // Platform operators are authorized by authenticated identity + DB role +
  // explicit allowlist, not by a customer's billing plan.
  const user = await requireBearerUser(req)
  const isAllowed = isPlatformAdminAuthorized({
    authUserId: user.authUserId,
    role: user.role,
    allowlistedAuthUserIds: process.env.HFA_PLATFORM_ADMIN_AUTH_USER_IDS,
  })
  if (!isAllowed) {
    throw new Response(JSON.stringify({ detail: 'Acesso administrativo global não autorizado' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    })
  }
  return user
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status })
}

function mask(value: string | null | undefined): string {
  if (!value) return ''
  if (value.length <= 8) return '****'
  return value.slice(0, 4) + '****' + value.slice(-4)
}

export function maskSensitive(value: string | null | undefined): string {
  return mask(value)
}

export function isMasked(value: string): boolean {
  return value.includes('****')
}
