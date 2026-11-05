import { NextResponse } from 'next/server'
import { requirePlatformAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req)
    const admin = getSupabaseAdmin()
    const { data } = await admin.from('credit_packages').select('*').order('created_at', { ascending: false })
    return NextResponse.json(data ?? [])
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin(req)
    const body = await req.json()
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('credit_packages').insert({
      name: body.name,
      credits: Number(body.credits),
      price_cents: Number(body.price_cents),
      stripe_price_id: body.stripe_price_id || null,
      is_active: body.is_active ?? true,
    }).select().single()
    if (error) return jsonError(error.message, 400)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
