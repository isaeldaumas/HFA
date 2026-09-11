import { requireBearerUser, type ApiUserContext } from './api-auth'
import { getSupabaseAdmin } from './supabase-admin'
import { NextResponse } from 'next/server'

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
