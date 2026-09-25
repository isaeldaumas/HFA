import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { completeSeraAnalysisAfterEventCreated } from '@/lib/server/complete-sera-analysis'
import { type SourceMeta } from '@/lib/sera/pipeline'
import {
  debitCreditForEvent,
  ensurePublicUserRow,
  refundCreditForFailedAnalysis,
} from '@/lib/server/tenant-user'
import {
  buildSeraAnalysisFromDbRow,
  fetchEditHistoryForAnalysis,
  seraAnalysisToJson,
} from '@/lib/sera/sera-analysis-mapper'
import { applyUserAiSettingsToEnv } from '@/lib/server/apply-user-ai-settings-to-env'
import { getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { isSeraVNextCanonicalAnalyzeEnabled } from '@/lib/sera-vnext-runtime/feature-flags'
import { canonicalAnalyzeResponse, createCanonicalEventAnalysis } from '@/lib/sera-vnext-product/canonical-event-analysis'

export const maxDuration = 300

type AnalyzeErrorCode =
  | 'ANALYZE_INVALID_INPUT'
  | 'ANALYZE_UNAUTHORIZED'
  | 'ANALYZE_FORBIDDEN'
  | 'ANALYZE_ENGINE_UNAVAILABLE'
  | 'ANALYZE_PERSISTENCE_ERROR'
  | 'ANALYZE_INTERNAL_ERROR'

const ANALYZE_PUBLIC_ERROR_MESSAGE = 'Não foi possível concluir a análise.'

function buildErrorResponse(code: AnalyzeErrorCode, requestId: string, status: number) {
  return NextResponse.json(
    { error: { code, message: ANALYZE_PUBLIC_ERROR_MESSAGE, requestId } },
    { status, headers: { 'x-request-id': requestId } }
  )
}

function errorType(error: unknown): string {
  if (error instanceof Response) return `Response:${error.status}`
  if (error instanceof Error) return error.name || 'Error'
  return typeof error
}

function logAnalyzeError(
  event: string,
  requestId: string,
  error: unknown,
  context: Record<string, unknown> = {},
) {
  console.error('[/api/analyze]', {
    event,
    requestId,
    errorType: errorType(error),
    ...context,
  })
}

function errorResponseFromAuthResponse(error: Response, requestId: string) {
  if (error.status === 401) return buildErrorResponse('ANALYZE_UNAUTHORIZED', requestId, 401)
  if (error.status === 403) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
  return buildErrorResponse('ANALYZE_INTERNAL_ERROR', requestId, 500)
}

/**
 * POST /api/analyze
 *
 * - Com `eventId`: reexecuta o pipeline para esse evento (atualiza `raw_input` do evento),
 *   **sem** novo débito de crédito.
 * - Sem `eventId`: cria evento mínimo (consome 1 crédito), executa pipeline e devolve `seraAnalysis`.
 */
export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    try {
      assertServiceRoleEnv()
    } catch (cfg) {
      logAnalyzeError('service_role_missing', requestId, cfg)
      return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 503)
    }
    const admin = getSupabaseAdmin()
    let body: {
      eventoNarrativa: string
      userId?: string
      title?: string
      eventId?: string
      operation_type?: string | null
      aircraft_type?: string | null
      occurred_at?: string | null
      sourceType?: 'text' | 'pdf' | 'docx'
      sourceFileName?: string
      sourceWordCount?: number
      sourceFileUrl?: string | null
    }
    try {
      body = (await req.json()) as typeof body
    } catch (parseErr) {
      logAnalyzeError('invalid_json_payload', requestId, parseErr)
      return buildErrorResponse('ANALYZE_INVALID_INPUT', requestId, 400)
    }

    const rawInput = body.eventoNarrativa?.trim()
    if (!rawInput) return buildErrorResponse('ANALYZE_INVALID_INPUT', requestId, 400)

    if (body.userId && body.userId !== user.userId) {
      return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
    }

    const sourceMeta: SourceMeta = {
      sourceType: body.sourceType ?? 'text',
      sourceFileName: body.sourceFileName,
      sourceWordCount: body.sourceWordCount,
      sourceFileUrl: body.sourceFileUrl ?? null,
    }

    const submittedById = await ensurePublicUserRow(
      admin,
      user.tenantId,
      user.userId,
      user.email,
      user.role
    )

    if (body.eventId) {
      const { data: ev, error: evErr } = await admin
        .from('events')
        .select('id, tenant_id, title')
        .eq('id', body.eventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
        .maybeSingle()

      if (evErr || !ev) {
        logAnalyzeError('event_lookup_failed', requestId, evErr, { phase: 'reanalysis_lookup' })
        return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
      }

      try {
        await applyUserAiSettingsToEnv(admin, user.userId)
      } catch (cfgErr) {
        logAnalyzeError('ai_settings_config_error', requestId, cfgErr, { phase: 'reanalysis' })
        return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 503)
      }

      await admin.from('events').update({ raw_input: rawInput }).eq('id', body.eventId).is('deleted_at', null)

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_started', entityType: 'event', entityId: body.eventId,
        route: '/api/analyze', method: 'POST',
        metadata: { source: 'reanalysis' },
      })

      try {
        if (isSeraVNextCanonicalAnalyzeEnabled() && String(user.role ?? '').toLowerCase() === 'admin') {
          const vnextResult = await createCanonicalEventAnalysis({
            eventId: body.eventId,
            title: String(ev.title ?? body.title ?? `SERA ${body.eventId}`),
            narrative: rawInput,
            mode: 'REANALYSIS',
            context: {
              tenantId: user.tenantId,
              userId: submittedById,
              role: user.role,
              email: user.email ?? '',
              requestId,
            },
          })

          const needsClarification = vnextResult.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
          const eventUpdate = await admin
            .from('events')
            .update({ status: needsClarification ? 'received' : 'completed' })
            .eq('id', body.eventId)
            .eq('tenant_id', user.tenantId)
            .is('deleted_at', null)
          if (eventUpdate.error) throw new Error('CANONICAL_EVENT_STATUS_UPDATE_FAILED')

          await writeAuditLog({
            tenantId: user.tenantId, userId: user.userId, requestId,
            eventType: 'canonical_engine.used', entityType: 'analysis', entityId: vnextResult.analysis.id,
            route: '/api/analyze', method: 'POST', status: needsClarification ? 'partial' : 'success',
            metadata: {
              source: 'reanalysis',
              source_flow: vnextResult.analysis.source_flow,
              engine_runtime_version: vnextResult.analysis.engine_runtime_version,
              canonical_tree_version: vnextResult.analysis.canonical_tree_version,
              event_id: body.eventId,
              candidate_only: true,
              evidence_sufficiency_status: vnextResult.analysis.engine_output.evidenceSufficiency.status,
            },
          })

          return NextResponse.json(
            canonicalAnalyzeResponse(vnextResult, body.eventId),
            { headers: { 'x-request-id': requestId } },
          )
        }

        const { analysisId } = await completeSeraAnalysisAfterEventCreated(
          admin,
          { userId: user.userId, tenantId: user.tenantId },
          body.eventId,
          rawInput,
          sourceMeta,
          null
        )

        const { data: row } = await admin
          .from('analyses')
          .select('*')
          .eq('id', analysisId)
          .single()

        const edits = await fetchEditHistoryForAnalysis(admin, analysisId, user.tenantId)
        const seraAnalysis = row
          ? seraAnalysisToJson(
              buildSeraAnalysisFromDbRow(
                row as Record<string, unknown>,
                user.userId,
                rawInput,
                edits
              )
            )
          : null

        const rowData = row as Record<string, unknown> | null
        const completeness = rowData?.analysis_completeness as string | null
        await writeAuditLog({
          tenantId: user.tenantId, userId: user.userId, requestId,
          eventType: completeness === 'complete' ? 'analysis_completed' : 'analysis_partial',
          entityType: 'analysis', entityId: analysisId,
          route: '/api/analyze', method: 'POST',
          status: completeness === 'complete' ? 'success' : 'partial',
          metadata: {
            motor_version: rowData?.motor_version,
            analysis_completeness: completeness,
            completeness_reason: rowData?.completeness_reason,
            event_id: body.eventId,
          },
        })

        return NextResponse.json(
          { event_id: body.eventId, analysis_id: analysisId, seraAnalysis },
          { headers: { 'x-request-id': requestId } }
        )
      } catch (err) {
        await admin.from('events').update({ status: 'failed' }).eq('id', body.eventId).is('deleted_at', null)
        logAnalyzeError('reanalysis_failed', requestId, err)
        await writeAuditLog({
          tenantId: user.tenantId, userId: user.userId, requestId,
          eventType: 'analysis_failed', entityType: 'event', entityId: body.eventId,
          route: '/api/analyze', method: 'POST', status: 'failed',
          metadata: { source: 'reanalysis' },
        })
        return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 500)
      }
    }

    const title =
      body.title?.trim() ||
      `SERA ${new Date().toISOString().slice(0, 10)} ${String(rawInput).slice(0, 48)}`

    const { data: tenant, error: terr } = await admin
      .from('tenants')
      .select('plan, credits_balance')
      .eq('id', user.tenantId)
      .single()
    if (terr || !tenant) {
      logAnalyzeError('tenant_lookup_failed', requestId, terr, { phase: 'tenant_lookup' })
      return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
    }

    const isEnterprise = tenant.plan === 'enterprise'
    if (!isEnterprise && (tenant.credits_balance ?? 0) < 1) {
      return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
    }

    try {
      await applyUserAiSettingsToEnv(admin, user.userId)
    } catch (cfgErr) {
      logAnalyzeError('ai_settings_config_error', requestId, cfgErr, { phase: 'new_analysis' })
      return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 503)
    }

    const inputType = sourceMeta.sourceType === 'docx' || sourceMeta.sourceType === 'pdf'
      ? sourceMeta.sourceType
      : 'text'

    const { data: eventRow, error: eerr } = await admin
      .from('events')
      .insert({
        tenant_id: user.tenantId,
        submitted_by: submittedById,
        title,
        raw_input: rawInput,
        input_type: inputType,
        operation_type: body.operation_type ?? null,
        aircraft_type: body.aircraft_type ?? null,
        occurred_at: body.occurred_at ?? null,
        status: 'received',
      })
      .select('id')
      .single()

    if (eerr || !eventRow) {
      logAnalyzeError('event_creation_failed', requestId, eerr, { phase: 'event_insert' })
      return buildErrorResponse('ANALYZE_PERSISTENCE_ERROR', requestId, 500)
    }

    const eventId = eventRow.id as string

    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'event_created', entityType: 'event', entityId: eventId,
      route: '/api/analyze', method: 'POST',
      metadata: { source_type: sourceMeta.sourceType },
    })

    let creditoDebitado = false
    let respostaSucesso = false
    let analysisId: string | null = null

    try {
      await debitCreditForEvent({
        admin,
        tenantId: user.tenantId,
        submittedById,
        eventId,
        title,
        isEnterprise,
        currentBalance: tenant.credits_balance ?? 0,
      })
      creditoDebitado = true

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_started', entityType: 'event', entityId: eventId,
        route: '/api/analyze', method: 'POST',
        metadata: { source: 'new_analysis' },
      })

      if (isSeraVNextCanonicalAnalyzeEnabled() && String(user.role ?? '').toLowerCase() === 'admin') {
        const vnextResult = await createCanonicalEventAnalysis({
          eventId,
          title,
          narrative: rawInput,
          mode: 'INITIAL',
          context: { tenantId: user.tenantId, userId: submittedById, role: user.role, email: user.email ?? '', requestId },
        })
        analysisId = vnextResult.analysis.id

        const needsClarification = vnextResult.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
        const eventUpdate = await admin
          .from('events')
          .update({ status: needsClarification ? 'received' : 'completed', credits_used: 1 })
          .eq('id', eventId)
          .eq('tenant_id', user.tenantId)
          .is('deleted_at', null)
        if (eventUpdate.error) throw new Error('CANONICAL_EVENT_STATUS_UPDATE_FAILED')

        respostaSucesso = true
        await writeAuditLog({
          tenantId: user.tenantId, userId: user.userId, requestId,
          eventType: 'canonical_engine.used', entityType: 'analysis', entityId: vnextResult.analysis.id,
          route: '/api/analyze', method: 'POST', status: needsClarification ? 'partial' : 'success',
          metadata: {
            source_flow: vnextResult.analysis.source_flow,
            engine_runtime_version: vnextResult.analysis.engine_runtime_version,
            canonical_tree_version: vnextResult.analysis.canonical_tree_version,
            event_id: eventId,
            candidate_only: true,
            evidence_sufficiency_status: vnextResult.analysis.engine_output.evidenceSufficiency.status,
          },
        })
        return NextResponse.json(
          canonicalAnalyzeResponse(vnextResult, eventId),
          { headers: { 'x-request-id': requestId } },
        )
      }

      const r = await completeSeraAnalysisAfterEventCreated(
        admin,
        { userId: user.userId, tenantId: user.tenantId },
        eventId,
        rawInput,
        sourceMeta,
        null
      )

      analysisId = r.analysisId
      respostaSucesso = true
    } catch (err) {
      await admin.from('events').update({ status: 'failed' }).eq('id', eventId).is('deleted_at', null)
      logAnalyzeError('analysis_failed', requestId, err, { phase: 'new_analysis' })
      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_failed', entityType: 'event', entityId: eventId,
        route: '/api/analyze', method: 'POST', status: 'failed',
        metadata: { source: 'new_analysis' },
      })
      return buildErrorResponse('ANALYZE_ENGINE_UNAVAILABLE', requestId, 500)
    } finally {
      if (creditoDebitado && !respostaSucesso) {
        try {
          const { data: tNow } = await admin
            .from('tenants')
            .select('credits_balance')
            .eq('id', user.tenantId)
            .single()

          await refundCreditForFailedAnalysis({
            admin,
            tenantId: user.tenantId,
            submittedById,
            eventId,
            title,
            isEnterprise,
            currentBalanceAfterDebit: tNow?.credits_balance ?? 0,
          })
        } catch (refundErr) {
          logAnalyzeError('refund_failed', requestId, refundErr)
        }
      }
    }

    if (!analysisId) return buildErrorResponse('ANALYZE_INTERNAL_ERROR', requestId, 500)

    const { data: row } = await admin
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single()

    const edits = await fetchEditHistoryForAnalysis(admin, analysisId, user.tenantId)
    const seraAnalysis = row
      ? seraAnalysisToJson(
          buildSeraAnalysisFromDbRow(
            row as Record<string, unknown>,
            user.userId,
            rawInput,
            edits
          )
        )
      : null

    const rowData2 = row as Record<string, unknown> | null
    const completeness2 = rowData2?.analysis_completeness as string | null
    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: completeness2 === 'complete' ? 'analysis_completed' : 'analysis_partial',
      entityType: 'analysis', entityId: analysisId,
      route: '/api/analyze', method: 'POST',
      status: completeness2 === 'complete' ? 'success' : 'partial',
      metadata: {
        motor_version: rowData2?.motor_version,
        analysis_completeness: completeness2,
        completeness_reason: rowData2?.completeness_reason,
        event_id: eventId,
      },
    })

    return NextResponse.json(
      { event_id: eventId, analysis_id: analysisId, seraAnalysis },
      { headers: { 'x-request-id': requestId } }
    )
  } catch (e) {
    if (e instanceof Response) return errorResponseFromAuthResponse(e, requestId)
    logAnalyzeError('unhandled_error', requestId, e)
    return buildErrorResponse('ANALYZE_INTERNAL_ERROR', requestId, 500)
  }
}
