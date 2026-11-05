import { NextResponse } from 'next/server'
import { requirePlatformAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(req)
    const { id } = await params
    const body = await req.json()
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('credit_packages').update({
      name: body.name,
      credits: Number(body.credits),
      price_cents: Number(body.price_cents),
      stripe_price_id: body.stripe_price_id || null,
      is_active: body.is_active ?? true,
    }).eq('id', id).select().single()
    if (error) return jsonError(error.message, 400)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin(req)
    const { id } = await params
    const admin = getSupabaseAdmin()
    await admin.from('credit_packages').delete().eq('id', id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
