import { NextResponse } from 'next/server'
import { assertServiceRoleEnv, getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { buildErrorResponse, getOrCreateRequestId } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { extractIntegrationBearerToken, hashIntegrationToken } from '@/lib/integrations/integration-token'

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

async function authenticate(req: Request) {
  const token = extractIntegrationBearerToken(req)
  if (!token) return null
  const admin = getSupabaseAdmin()
  const result = await admin.from('integration_connections')
    .select('id, tenant_id, external_tenant_ref, name, scopes')
    .eq('provider', 'AIRTRUST')
    .eq('token_hash', hashIntegrationToken(token))
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle()
  if (result.error || !result.data) return null
  return result.data
}

async function touchConnection(id: string) {
  const admin = getSupabaseAdmin()
  await admin.from('integration_connections').update({
    last_used_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    assertServiceRoleEnv()
    const connection = await authenticate(req)
    if (!connection) return jsonError('Credencial de integração inválida ou revogada.', 401)
    const admin = getSupabaseAdmin()
    if (!Array.isArray(connection.scopes) || !connection.scopes.includes('events:write')) {
      return jsonError('Credencial sem escopo events:write.', 403)
    }
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const externalTenantRef = clean(body.external_tenant_ref, 255)
    const externalReference = clean(body.external_reference, 255)
    const title = clean(body.title, 255)
    const narrative = clean(body.narrative ?? body.raw_input, 200_000)
    const operationType = clean(body.operation_type, 120) || null
    const aircraftType = clean(body.aircraft_type, 120) || null
    const confidentialityLevel = body.confidentiality_level === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'STANDARD'
    const occurredAt = normalizeIso(body.occurred_at)
    const reportedAt = normalizeIso(body.reported_at) ?? new Date().toISOString()
    if (!externalTenantRef || externalTenantRef !== connection.external_tenant_ref) {
      return jsonError('A referência da organização não corresponde à credencial apresentada.', 403)
    }
    if (!externalReference || !title || !narrative) {
      return jsonError('external_reference, title e narrative são obrigatórios.', 400)
    }
    if (body.occurred_at && !occurredAt) return jsonError('occurred_at inválido.', 400)
    if (body.reported_at && !normalizeIso(body.reported_at)) return jsonError('reported_at inválido.', 400)

    const existing = await admin.from('events')
      .select('id, credits_used')
      .eq('tenant_id', connection.tenant_id)
      .eq('source_system', 'AIRTRUST')
      .eq('external_reference', externalReference)
      .is('deleted_at', null)
      .maybeSingle()
    if (existing.error) return jsonError('Não foi possível validar o evento integrado.', 500)

    let eventId: string
    let created = false
    let updated = false
    let lockedForAnalysis = false
    if (existing.data) {
      eventId = existing.data.id
      const [current, legacy] = await Promise.all([
        admin.from('sera_vnext_analyses').select('id').eq('tenant_id', connection.tenant_id)
          .eq('source_reference', eventId).is('deleted_at', null).limit(1),
        admin.from('analyses').select('id').eq('tenant_id', connection.tenant_id).eq('event_id', eventId).limit(1),
      ])
      if (current.error || legacy.error) return jsonError('Não foi possível validar o estado da investigação.', 500)
      lockedForAnalysis = (existing.data.credits_used ?? 0) > 0 || !!current.data?.length || !!legacy.data?.length
      if (!lockedForAnalysis) {
        const update = await admin.from('events').update({
          title,
          raw_input: narrative,
          operation_type: operationType,
          aircraft_type: aircraftType,
          occurred_at: occurredAt,
          confidentiality_level: confidentialityLevel,
          reported_at: reportedAt,
          updated_at: new Date().toISOString(),
        }).eq('id', eventId).eq('tenant_id', connection.tenant_id)
        if (update.error) return jsonError('Não foi possível atualizar o evento integrado.', 500)
        updated = true
      }
    } else {
      const insert = await admin.from('events').insert({
        tenant_id: connection.tenant_id,
        submitted_by: null,
        title,
        raw_input: narrative,
        input_type: 'text',
        operation_type: operationType,
        aircraft_type: aircraftType,
        occurred_at: occurredAt,
        status: 'received',
        credits_used: 0,
        event_kind: 'SAFETY_REPORT',
        triage_status: 'UNTRIAGED',
        investigation_path: 'NONE',
        source_system: 'AIRTRUST',
        external_reference: externalReference,
        confidentiality_level: confidentialityLevel,
        reported_at: reportedAt,
      }).select('id').single()
      if (insert.error || !insert.data) return jsonError('Não foi possível registrar o evento integrado.', 500)
      eventId = insert.data.id
      created = true
    }

    await touchConnection(connection.id)
    await writeAuditLog({
      tenantId: connection.tenant_id,
      userId: null,
      requestId,
      eventType: 'integration_event_received',
      entityType: 'event',
      entityId: eventId,
      route: '/api/integrations/airtrust/events',
      method: 'POST',
      metadata: { provider: 'AIRTRUST', external_reference: externalReference, created, updated, locked_for_analysis: lockedForAnalysis },
    })
    return NextResponse.json({
      event_id: eventId,
      created,
      updated,
      locked_for_analysis: lockedForAnalysis,
      analysis_started: false,
      credits_used: 0,
    }, { status: created ? 201 : 200, headers: { 'x-request-id': requestId } })
  } catch (error) {
    console.error('[/api/integrations/airtrust/events POST]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Falha ao receber evento do AirTrust.', 500)
  }
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    assertServiceRoleEnv()
    const connection = await authenticate(req)
    if (!connection) return jsonError('Credencial de integração inválida ou revogada.', 401)
    const externalReference = clean(new URL(req.url).searchParams.get('external_reference'), 255)
    if (!externalReference) return jsonError('external_reference é obrigatório.', 400)
    if (!Array.isArray(connection.scopes) || !connection.scopes.includes('events:read')) {
      return jsonError('Credencial sem escopo events:read.', 403)
    }
    const admin = getSupabaseAdmin()
    const event = await admin.from('events')
      .select('id, title, status, triage_status, investigation_path, event_kind, updated_at')
      .eq('tenant_id', connection.tenant_id)
      .eq('source_system', 'AIRTRUST')
      .eq('external_reference', externalReference)
      .is('deleted_at', null)
      .maybeSingle()
    if (event.error) return jsonError('Não foi possível consultar o evento integrado.', 500)
    if (!event.data) return jsonError('Evento integrado não encontrado.', 404)
    const current = await admin.from('sera_vnext_analyses')
      .select('id, status, review_status, updated_at')
      .eq('tenant_id', connection.tenant_id)
      .eq('source_reference', event.data.id)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (current.error) return jsonError('Não foi possível consultar a análise HFA.', 500)
    await touchConnection(connection.id)
    return NextResponse.json({
      event: event.data,
      hfa_analysis: current.data?.[0] ?? null,
    }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    console.error('[/api/integrations/airtrust/events GET]', { requestId, errorType: error instanceof Error ? error.name : typeof error })
    return jsonError('Falha ao consultar evento do AirTrust.', 500)
  }
}
