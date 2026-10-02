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

    const [tenantRes, packagesRes, transactionsRes] = await Promise.all([
      admin
        .from('tenants')
        .select('plan, credits_balance')
        .eq('id', user.tenantId)
        .single(),
      admin
        .from('credit_packages')
        .select('id, name, credits, price_brl, stripe_price_id, is_active, created_at')
        .eq('is_active', true)
        .order('credits', { ascending: true }),
      admin
        .from('credit_transactions')
        .select('id, created_at, description, amount')
        .eq('tenant_id', user.tenantId)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (tenantRes.error || !tenantRes.data) {
      return jsonError(tenantRes.error?.message || 'Tenant não encontrado', 400)
    }
    if (packagesRes.error) return jsonError(packagesRes.error.message, 400)
    if (transactionsRes.error) return jsonError(transactionsRes.error.message, 400)

    const packages = (packagesRes.data ?? []).map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      credits: Number(pkg.credits ?? 0),
      price_cents: Math.round(Number(pkg.price_brl ?? 0) * 100),
      stripe_price_id: pkg.stripe_price_id,
      is_active: pkg.is_active,
      created_at: pkg.created_at,
    }))

    return NextResponse.json({
      balance: Number(tenantRes.data.credits_balance ?? 0),
      plan: String(tenantRes.data.plan ?? 'trial'),
      packages,
      transactions: transactionsRes.data ?? [],
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError(error instanceof Error ? error.message : String(error), 500)
  }
}
