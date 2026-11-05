import { NextResponse } from 'next/server'
import { requirePlatformAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req)
    const admin = getSupabaseAdmin()
    const url = new URL(req.url)
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))

    const [transactions, tenants, users] = await Promise.all([
      admin
        .from('credit_transactions')
        .select('id, tenant_id, user_id, type, amount, stripe_payment_id, description, created_at')
        .order('created_at', { ascending: false }),
      admin.from('tenants').select('id, name'),
      admin.from('users').select('id, email'),
    ])

    const tenantMap = Object.fromEntries((tenants.data ?? []).map(t => [String(t.id), String(t.name ?? '')]))
    const userMap = Object.fromEntries((users.data ?? []).map(u => [String(u.id), String(u.email ?? '')]))

    const rows = (transactions.data ?? []).map((tx) => ({
      ...tx,
      tenant_name: tenantMap[String(tx.tenant_id)] ?? '',
      user_email: userMap[String(tx.user_id)] ?? '',
    }))

    const total = rows.length
    const start = (page - 1) * limit
    const items = rows.slice(start, start + limit)

    return NextResponse.json({ items, total, page, limit })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
