import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { ensurePublicUserRow } from '@/lib/server/tenant-user'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import {
  SAFETY_RISK_MATRIX_PROFILE,
  calculateSafetyRisk,
  isSafetyProbability,
  type SafetySeverity,
} from '@/lib/safety/risk'

const VALID_TYPES = new Set(['INITIAL', 'RESIDUAL'])

export async function GET(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const { eventId } = await ctx.params
    const event = await admin.from('events').select('id').eq('id', eventId).eq('tenant_id', user.tenantId).is('deleted_at', null).maybeSingle()
    if (event.error) return jsonError('Não foi possível validar o evento.', 500)
    if (!event.data) return jsonError('Evento não encontrado.', 404)
    const result = await admin
      .from('event_risk_assessments')
      .select('id, assessment_type, probability, severity, risk_score, risk_level, matrix_profile, justification, assessed_by, assessed_at, created_at')
      .eq('tenant_id', user.tenantId)
      .eq('event_id', eventId)
      .order('assessed_at', { ascending: false })
    if (result.error) return jsonError('Não foi possível obter as avaliações de risco.', 500)

    return NextResponse.json({
      matrix_profile: SAFETY_RISK_MATRIX_PROFILE,
      assessments: result.data ?? [],
    }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/events/[eventId]/risk GET]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Não foi possível obter as avaliações de risco.', 500)
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ eventId: string }> }) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    if (!['admin', 'analyst'].includes(String(user.role).toLowerCase())) {
      return jsonError('Permissão insuficiente para avaliar risco.', 403)
    }
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const { eventId } = await ctx.params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const assessmentType = typeof body.assessment_type === 'string' ? body.assessment_type.trim() : ''
    const probability = body.probability
    const severityNumber = Number(body.severity)
    const justification = typeof body.justification === 'string' ? body.justification.trim().slice(0, 4000) : ''

    if (!VALID_TYPES.has(assessmentType) || !isSafetyProbability(probability)) {
      return jsonError('Tipo de avaliação ou probabilidade inválidos.', 400)
    }
    if (!Number.isInteger(severityNumber) || severityNumber < 1 || severityNumber > 5) {
      return jsonError('Severidade deve estar entre 1 e 5.', 400)
    }

    const event = await admin
      .from('events')
      .select('id, triage_status')
      .eq('id', eventId)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()
    if (event.error) return jsonError('Não foi possível validar o evento.', 500)
    if (!event.data) return jsonError('Evento não encontrado.', 404)

    if (assessmentType === 'RESIDUAL') {
      const initial = await admin
        .from('event_risk_assessments')
        .select('id')
        .eq('tenant_id', user.tenantId)
        .eq('event_id', eventId)
        .eq('assessment_type', 'INITIAL')
        .limit(1)
      if (initial.error) return jsonError('Não foi possível validar a avaliação inicial.', 500)
      if (!initial.data?.length) return jsonError('Registre a avaliação de risco inicial antes da residual.', 409)
    }
    const publicUserId = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)
    const risk = calculateSafetyRisk(probability, severityNumber as SafetySeverity)
    const result = await admin
      .from('event_risk_assessments')
      .insert({
        tenant_id: user.tenantId,
        event_id: eventId,
        assessment_type: assessmentType,
        probability,
        severity: severityNumber,
        risk_score: risk.score,
        risk_level: risk.level,
        matrix_profile: SAFETY_RISK_MATRIX_PROFILE,
        justification: justification || null,
        assessed_by: publicUserId,
      })
      .select('id, assessment_type, probability, severity, risk_score, risk_level, matrix_profile, justification, assessed_by, assessed_at')
      .single()
    if (result.error || !result.data) return jsonError('Não foi possível salvar a avaliação de risco.', 500)

    await writeAuditLog({
      tenantId: user.tenantId,
      userId: user.userId,
      requestId,
      eventType: 'safety_risk_assessment_created',
      entityType: 'event',
      entityId: eventId,
      route: `/api/events/${eventId}/risk`,
      method: 'POST',
      metadata: {
        assessment_type: assessmentType,
        matrix_profile: SAFETY_RISK_MATRIX_PROFILE,
        probability,
        severity: severityNumber,
        risk_score: risk.score,
        risk_level: risk.level,
      },
    })
    return NextResponse.json(result.data, {
      status: 201,
      headers: { 'x-request-id': requestId },
    })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[/api/events/[eventId]/risk POST]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Não foi possível salvar a avaliação de risco.', 500)
  }
}
