import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { buildTrialUsage } from '@/lib/product/trial'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function jsonError(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status })
}

export async function GET(req: Request) {
  try {
    const user = await requireBearerUser(req)
    const admin = getSupabaseAdmin()

    const { count, error } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenantId)
      .gt('credits_used', 0)

    if (error) {
      return jsonError(`Falha ao consultar trial: ${error.message}`, 500)
    }

    return NextResponse.json(buildTrialUsage(count ?? 0))
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError(String(error), 500)
  }
}
