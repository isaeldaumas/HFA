import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { DEFAULT_TRIAL_LIMIT, buildTrialUsage } from '@/lib/product/trial'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function jsonError(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status })
}

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req)
    const admin = getSupabaseAdmin()

    const [tenantRes, usageRes] = await Promise.all([
      admin
        .from('tenants')
        .select('plan, trial_case_limit, trial_expires_at')
        .eq('id', user.tenantId)
        .single(),
      admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', user.tenantId)
        .gt('credits_used', 0),
    ])

    if (tenantRes.error || !tenantRes.data) {
      return jsonError(tenantRes.error?.message || 'Tenant não encontrado', 400)
    }
    if (usageRes.error) {
      return jsonError(`Falha ao consultar piloto: ${usageRes.error.message}`, 500)
    }

    const configuredLimit = Number(tenantRes.data.trial_case_limit ?? DEFAULT_TRIAL_LIMIT)
    const usage = buildTrialUsage(usageRes.count ?? 0, configuredLimit, {
      expiresAt: tenantRes.data.plan === 'trial' ? tenantRes.data.trial_expires_at : null,
    })

    return NextResponse.json(usage)
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError(String(error), 500)
  }
}
