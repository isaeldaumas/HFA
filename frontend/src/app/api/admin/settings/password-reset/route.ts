import { NextResponse } from 'next/server'
import { requirePlatformAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin(req)
    const body = await req.json().catch(() => ({})) as { email?: string }
    const admin = getSupabaseAdmin()

    let email = (body.email ?? '').trim()
    if (!email) {
      const { data } = await admin.from('system_settings').select('value').eq('key', 'admin_email').maybeSingle()
      email = String(data?.value ?? '').trim()
    }

    if (!email) {
      return jsonError('Email de admin não configurado', 400)
    }

    const redirectTo = process.env.NEXT_PUBLIC_SITE_URL
      ? `${process.env.NEXT_PUBLIC_SITE_URL}/login`
      : undefined

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    })

    if (error) return jsonError(error.message, 400)

    return NextResponse.json({ ok: true, generated: Boolean(data?.properties?.action_link) })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
