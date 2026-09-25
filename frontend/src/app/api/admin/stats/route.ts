import { NextResponse } from 'next/server'
import { requireAdmin, jsonError } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function monthRange(ref: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0))
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1, 0, 0, 0))
  return { start, end }
}

function growthPct(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0
  return Number((((current - previous) / previous) * 100).toFixed(2))
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req)
    const admin = getSupabaseAdmin()

    const [tenants, analyses, transactions, events, vnextAnalyses, exclusions] = await Promise.all([
      admin.from('tenants').select('id, plan, created_at'),
      admin.from('analyses').select('id, created_at'),
      admin.from('credit_transactions').select('amount'),
      admin.from('events').select('id, deleted_at'),
      admin.from('sera_vnext_analyses').select('id, created_at, deleted_at, status, review_status'),
      admin.from('risk_profile_exclusions').select('id, restored_at'),
    ])

    const t = tenants.data ?? []
    const legacy = analyses.data ?? []
    const tx = transactions.data ?? []
    const e = events.data ?? []
    const v = vnextAnalyses.data ?? []
    const activeVNext = v.filter((item) => !item.deleted_at)
    const x = exclusions.data ?? []

    const now = new Date()
    const { start: currentStart, end: currentEnd } = monthRange(now)
    const prevRef = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
    const { start: previousStart, end: previousEnd } = monthRange(prevRef)

    let currentMonthCount = 0
    let previousMonthCount = 0
    for (const item of activeVNext) {
      const created = parseDate(item.created_at as string | undefined)
      if (!created) continue
      if (created >= currentStart && created < currentEnd) {
        currentMonthCount += 1
      } else if (created >= previousStart && created < previousEnd) {
        previousMonthCount += 1
      }
    }

    const creditsConsumed = tx.reduce((s, x) => s + (x.amount < 0 ? Math.abs(x.amount) : 0), 0)
    const totalActiveEvents = e.filter((item) => !item.deleted_at).length
    const softDeletedEvents = e.filter((item) => !!item.deleted_at).length

    return NextResponse.json({
      total_tenants: t.length,
      total_analyses: activeVNext.length,
      total_active_events: totalActiveEvents,
      soft_deleted_events: softDeletedEvents,
      analyzed_events: activeVNext.length,
      legacy_analyses: legacy.length,
      vnext_analyses: activeVNext.length,
      risk_profile_included: totalActiveEvents - x.filter((item) => !item.restored_at).length,
      risk_profile_excluded: x.filter((item) => !item.restored_at).length,
      credits_consumed: creditsConsumed,
      enterprise_tenants: t.filter(x => x.plan === 'enterprise').length,
      free_tenants: t.filter(x => ['free', 'trial'].includes(x.plan ?? '')).length,
      growth: {
        current_month: currentMonthCount,
        previous_month: previousMonthCount,
        pct: growthPct(currentMonthCount, previousMonthCount),
      },
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
