import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { ensurePublicUserRow } from '@/lib/server/tenant-user'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'

const VALID_TRIAGE = new Set([
  'UNTRIAGED',
  'MONITOR_ONLY',
  'GENERAL_INVESTIGATION',
  'HFA_SELECTED',
  'CLOSED',
])

function investigationPath(status: string, current: string | null): string {
  if (status === 'GENERAL_INVESTIGATION') return current === 'HFA' || current === 'BOTH' ? 'BOTH' : 'GENERAL'
  if (status === 'HFA_SELECTED') return current === 'GENERAL' || current === 'BOTH' ? 'BOTH' : 'HFA'
  if (status === 'UNTRIAGED' || status === 'MONITOR_ONLY') return 'NONE'
  return current || 'NONE'
}
export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    if (!['admin', 'analyst'].includes(String(user.role).toLowerCase())) {
      return jsonError('Permissão insuficiente para realizar triagem.', 403)
    }
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const { eventId } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const triageStatus = typeof body.triage_status === 'string' ? body.triage_status.trim() : ''
    if (!VALID_TRIAGE.has(triageStatus)) return jsonError('Status de triagem inválido.', 400)

    const { data: event, error } = await admin
      .from('events')
      .select('id, investigation_path, deleted_at')
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .maybeSingle()
    if (error) return jsonError('Não foi possível obter o evento.', 500)
    if (!event || event.deleted_at) return jsonError('Evento não encontrado.', 404)
    const publicUserId = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)
    const nextPath = investigationPath(triageStatus, event.investigation_path as string | null)
    const { data: updated, error: updateError } = await admin
      .from('events')
      .update({
        triage_status: triageStatus,
        investigation_path: nextPath,
        triaged_at: new Date().toISOString(),
        triaged_by: publicUserId,
      })
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .select('id, triage_status, investigation_path, triaged_at')
      .single()
    if (updateError || !updated) return jsonError('Não foi possível atualizar a triagem.', 500)

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      requestId,
      eventType: 'safety_event_triaged',
      entityType: 'event',
      entityId: eventId,
      route: `/api/events/${eventId}/triage`,
      method: 'POST',
      metadata: { triage_status: triageStatus, investigation_path: nextPath },
    })
    return NextResponse.json(updated, {
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/events/[eventId]/triage POST]', {
      requestId,
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return jsonError('Não foi possível concluir a triagem.', 500)
  }
}
