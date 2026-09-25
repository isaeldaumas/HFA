import { NextResponse } from 'next/server'
import { requireAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export async function GET(req: Request) {
  try {
    await requireAdmin(req)
    const admin = getSupabaseAdmin()

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 25)))

    const [tenants, users, analyses] = await Promise.all([
      admin.from('tenants').select('*').order('created_at', { ascending: false }),
      admin.from('users').select('tenant_id, email, role'),
      admin.from('sera_vnext_analyses').select('tenant_id').is('deleted_at', null),
    ])

    const userMap: Record<string, { email: string; role: string }[]> = {}
    for (const u of users.data ?? []) {
      const tid = String(u.tenant_id)
      if (!userMap[tid]) userMap[tid] = []
      userMap[tid].push({ email: String(u.email ?? ''), role: String(u.role ?? '') })
    }

    const analysisCount: Record<string, number> = {}
    for (const a of analyses.data ?? []) {
      const tid = String(a.tenant_id)
      analysisCount[tid] = (analysisCount[tid] ?? 0) + 1
    }

    const rows = (tenants.data ?? []).map(t => {
      const tenantUsers = userMap[String(t.id)] ?? []
      const mainEmail = tenantUsers[0]?.email ?? ''
      return {
        ...t,
        email: mainEmail,
        status: t.is_active ? 'active' : 'suspended',
        users: tenantUsers,
        analysis_count: analysisCount[String(t.id)] ?? 0,
      }
    })

    const filtered = q
      ? rows.filter((item) => {
        const haystack = [
          String(item.name ?? ''),
          String(item.slug ?? ''),
          String(item.email ?? ''),
          ...item.users.map((u: { email: string }) => u.email),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
      : rows

    const total = filtered.length
    const start = (page - 1) * limit
    const items = filtered.slice(start, start + limit)

    return NextResponse.json({ items, total, page, limit })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
