import { NextResponse } from 'next/server'
import { requirePlatformAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(req)
    const { id } = await params
    const body = await req.json()
    const admin = getSupabaseAdmin()

    const allowed: Record<string, unknown> = {}
    if (body.plan !== undefined) allowed.plan = String(body.plan)
    if (body.credits_balance !== undefined) allowed.credits_balance = Number(body.credits_balance)
    if (body.is_active !== undefined) allowed.is_active = Boolean(body.is_active)
    if (body.status !== undefined && body.is_active === undefined) {
      allowed.is_active = String(body.status) === 'active'
    }

    if (Object.keys(allowed).length === 0) return jsonError('Nenhum campo para atualizar', 400)

    const result = await admin.from('tenants').update(allowed).eq('id', id).select().single()
    if (result.error) return jsonError(result.error.message, 400)

    return NextResponse.json(result.data)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
