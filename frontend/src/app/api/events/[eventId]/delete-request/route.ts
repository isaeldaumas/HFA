import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { getEventDeletionImpact, getEventDeletionRecord, resolvePublicUserId, softDeleteEvent } from '@/lib/server/event-deletion'

function jsonError(requestId: string, code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId } },
    { status, headers: { 'x-request-id': requestId } },
  )
}

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireAdmin(req)
    const { eventId } = await ctx.params
    const admin = getSupabaseAdmin()
    const body = await req.json().catch(() => ({})) as {
      reason?: string
      confirmationTitle?: string
    }

    const reason = body.reason?.trim() ?? ''
    if (!reason) return jsonError(requestId, 'EVENT_DELETE_REASON_REQUIRED', 'Motivo obrigatório.', 400)

    const confirmationTitle = body.confirmationTitle?.trim() ?? ''
    if (!confirmationTitle) {
      return jsonError(requestId, 'EVENT_DELETE_TITLE_MISMATCH', 'O título digitado não corresponde exatamente ao evento.', 400)
    }

    const event = await getEventDeletionRecord(admin, user.tenantId, eventId)
    if (!event) return jsonError(requestId, 'EVENT_NOT_FOUND', 'Evento não encontrado.', 404)
    if (event.deleted_at) {
      const impact = await getEventDeletionImpact(admin, user.tenantId, eventId)
      return NextResponse.json({
        status: event.deletion_status ?? 'SOFT_DELETED',
        recoverableUntil: event.recoverable_until,
        impact,
        requestId,
        idempotent: true,
      }, { status: 200, headers: { 'x-request-id': requestId } })
    }

    if (confirmationTitle !== event.title) {
      return jsonError(requestId, 'EVENT_DELETE_TITLE_MISMATCH', 'O título digitado não corresponde exatamente ao evento.', 400)
    }

    const impact = await getEventDeletionImpact(admin, user.tenantId, eventId)
    if (impact.unknownDependencies.length > 0) {
      return jsonError(requestId, 'EVENT_DELETE_IMPACT_INCOMPLETE', 'O impacto da exclusão não pôde ser determinado integralmente.', 409)
    }
    const publicUserId = await resolvePublicUserId({
      admin,
      tenantId: user.tenantId,
      authUserId: user.userId,
      email: user.email,
    })

    const result = await softDeleteEvent({
      admin,
      tenantId: user.tenantId,
      eventId,
      actorUserId: publicUserId,
      reason,
      confirmationTitle,
      requestId,
      unknownDependencies: impact.unknownDependencies,
    })

    return NextResponse.json({
      status: 'SOFT_DELETED',
      recoverableUntil: result.recoverableUntil,
      impact,
      requestId,
      idempotent: result.idempotent,
    }, { headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'EVENT_DELETE_CORRECTIVE_ACTION_BLOCK') return jsonError(requestId, msg, 'Existem ações corretivas em aberto vinculadas ao evento.', 409)
    if (msg === 'EVENT_DELETE_IMPACT_INCOMPLETE') return jsonError(requestId, msg, 'O impacto da exclusão não pôde ser determinado integralmente.', 409)
    if (msg === 'EVENT_DELETE_ALREADY_DELETED') return jsonError(requestId, msg, 'O evento já está excluído.', 409)
    if (msg === 'EVENT_DELETE_TITLE_MISMATCH') return jsonError(requestId, msg, 'O título digitado não corresponde exatamente ao evento.', 400)
    if (msg === 'EVENT_DELETE_REASON_REQUIRED') return jsonError(requestId, msg, 'Motivo obrigatório.', 400)
    if (msg === 'EVENT_DELETE_FORBIDDEN') return jsonError(requestId, msg, 'Operação não autorizada.', 403)
    if (msg === 'EVENT_DELETE_CONFLICT') return jsonError(requestId, msg, 'Operação concorrente detectada. Recarregue e tente novamente.', 409)
    console.error('[delete-request] unexpected error', { requestId, code: msg.slice(0, 64) })
    return jsonError(requestId, 'EVENT_DELETE_INTERNAL_ERROR', 'Não foi possível concluir a operação.', 500)
  }
}
