import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function jsonError(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status })
}

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req)
    const admin = getSupabaseAdmin()

    const [tenantRes, userRes] = await Promise.all([
      admin.from('tenants').select('plan, credits_balance').eq('id', user.tenantId).single(),
      admin.from('users').select('role').eq('id', user.publicUserId).eq('tenant_id', user.tenantId).maybeSingle(),
    ])

    if (tenantRes.error || !tenantRes.data) return jsonError('Tenant não encontrado', 404)
    if (userRes.error || !userRes.data) return jsonError('Usuário não autorizado.', 403)

    const plan = (tenantRes.data?.plan as string) ?? 'free'
    const creditsBalance = (tenantRes.data?.credits_balance as number) ?? 0
    const role = (userRes.data?.role as string) ?? user.role ?? 'member'
    const isAdmin = role === 'admin'

    return NextResponse.json({
      plan,
      credits_balance: creditsBalance === -1 ? 'unlimited' : creditsBalance,
      role,
      is_admin: isAdmin,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
