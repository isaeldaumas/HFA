import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { findTenantDuplicateCandidates, isLikelyDuplicate, publicDuplicateMatches, type DuplicateComparable } from '@/lib/server/event-duplicates'
import { writeAuditLog } from '@/lib/observability/audit'
import { getOrCreateRequestId } from '@/lib/observability/request-id'

export const dynamic = 'force-dynamic'
type Ctx = { params: Promise<{ eventId: string }> }
const reviewerRoles = new Set(['admin', 'analyst'])

async function getEvent(admin: ReturnType<typeof getSupabaseAdmin>, tenantId: string, id: string) {
  const { data, error } = await admin.from('events')
    .select('id, title, raw_input, occurred_at, aircraft_type, operation_type, created_at')
    .eq('tenant_id', tenantId).eq('id', id).is('deleted_at', null).neq('deletion_status', 'PURGED').maybeSingle()
  if (error) throw new Error('EVENT_DUPLICATE_EVENT_LOOKUP_FAILED')
  return data as DuplicateComparable | null
}

function failure(error: unknown, requestId: string) {
  if (error instanceof Response) return error
  console.error('[event-duplicate-reconciliation]', { requestId, type: error instanceof Error ? error.message : 'Unknown' })
  return NextResponse.json({ detail: 'Não foi possível consultar ou registrar a duplicidade.' }, { status: 500 })
}

export async function GET(req: Request, ctx: Ctx) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    const { eventId } = await ctx.params
    const admin = getSupabaseAdmin()
    const event = await getEvent(admin, user.tenantId, eventId)
    if (!event) return NextResponse.json({ detail: 'Evento não encontrado.' }, { status: 404 })
    const { data: existing, error } = await admin.from('event_duplicate_links')
      .select('canonical_event_id, reason, decided_by, created_at').eq('tenant_id', user.tenantId)
      .eq('duplicate_event_id', eventId).maybeSingle()
    if (error) throw new Error('EVENT_DUPLICATE_LINK_LOOKUP_FAILED')
    const matches = existing ? [] : await findTenantDuplicateCandidates({ admin, tenantId: user.tenantId, input: event, excludeConfirmedDuplicates: true })
    return NextResponse.json({
      linkedTo: existing?.canonical_event_id ?? null,
      linkReason: existing?.reason ?? null,
      canReconcile: reviewerRoles.has(user.role.toLowerCase()),
      duplicates: publicDuplicateMatches(matches),
    }, { headers: { 'Cache-Control': 'no-store', 'x-request-id': requestId } })
  } catch (error) { return failure(error, requestId) }
}

export async function POST(req: Request, ctx: Ctx) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    if (!reviewerRoles.has(user.role.toLowerCase())) return NextResponse.json({ detail: 'Confirmação restrita a analistas e administradores.' }, { status: 403 })
    const { eventId } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const canonicalId = typeof body.canonicalEventId === 'string' ? body.canonicalEventId : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (!/^[\da-f-]{36}$/i.test(canonicalId) || reason.length < 10) {
      return NextResponse.json({ detail: 'Informe o registro original e uma justificativa com pelo menos 10 caracteres.' }, { status: 422 })
    }
    const admin = getSupabaseAdmin()
    const [duplicate, canonical] = await Promise.all([
      getEvent(admin, user.tenantId, eventId),
      getEvent(admin, user.tenantId, canonicalId),
    ])
    if (!duplicate || !canonical) return NextResponse.json({ detail: 'Um dos eventos não está disponível nesta empresa.' }, { status: 404 })
    if (Date.parse(String(canonical.created_at)) > Date.parse(String(duplicate.created_at)) || !isLikelyDuplicate(duplicate, canonical)) {
      return NextResponse.json({ detail: 'A equivalência factual não foi confirmada. Investigue os dois eventos separadamente.' }, { status: 422 })
    }
    const { data: existing } = await admin.from('event_duplicate_links').select('canonical_event_id')
      .eq('tenant_id', user.tenantId).eq('duplicate_event_id', eventId).maybeSingle()
    if (existing) {
      if (existing.canonical_event_id === canonicalId) return NextResponse.json({ linkedTo: canonicalId, alreadyConfirmed: true })
      return NextResponse.json({ detail: 'Este evento já está vinculado a outra ocorrência.' }, { status: 409 })
    }
    const { error: insertError } = await admin.from('event_duplicate_links').insert({
      tenant_id: user.tenantId,
      duplicate_event_id: eventId,
      canonical_event_id: canonicalId,
      decided_by: user.publicUserId,
      reason,
    })
    if (insertError) {
      if (insertError.code === '23505') return NextResponse.json({ detail: 'O vínculo já foi registrado. Atualize a página.' }, { status: 409 })
      throw new Error('EVENT_DUPLICATE_LINK_INSERT_FAILED')
    }
    await writeAuditLog({ tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'event.duplicate_confirmed', entityType: 'event', entityId: eventId,
      route: `/api/events/${eventId}/duplicates`, method: 'POST', status: 'success',
      metadata: { canonicalEventId: canonicalId, reason, preservedOriginals: true },
    })
    return NextResponse.json({ linkedTo: canonicalId, confirmed: true }, { status: 201, headers: { 'x-request-id': requestId } })
  } catch (error) { return failure(error, requestId) }
}
