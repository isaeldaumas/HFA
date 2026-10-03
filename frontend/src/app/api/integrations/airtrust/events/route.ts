import { NextResponse } from 'next/server'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { requireIntegrationConnection } from '@/lib/server/integration-auth'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'

function text(value: unknown, max = 10000): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, max) : null
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    assertServiceRoleEnv()
    const connection = await requireIntegrationConnection(req, 'AIRTRUST', 'events:write')
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const externalTenantRef = text(body.external_tenant_ref, 128)
    const externalReference = text(body.external_reference, 200)
    const title = text(body.title, 300)
    const rawInput = text(body.raw_input, 50000)
    if (!externalTenantRef || externalTenantRef !== connection.externalTenantRef) return jsonError('Tenant externo incompatível com a conexão.', 403)
    if (!externalReference || !title || !rawInput) return jsonError('external_reference, title e raw_input são obrigatórios.', 400)

    const admin = getSupabaseAdmin()
    const { data: existing, error: existingError } = await admin
      .from('events')
      .select('id, triage_status, investigation_path')
      .eq('tenant_id', connection.tenantId)
      .eq('source_system', 'AIRTRUST')
      .eq('external_reference', externalReference)
      .is('deleted_at', null)
      .maybeSingle()
    if (existingError) return jsonError('Falha ao verificar evento integrado.', 500)

    const common = {
      title,
      raw_input: rawInput,
      input_type: 'text',
      operation_type: text(body.operation_type, 120),
      aircraft_type: text(body.aircraft_type, 120),
      occurred_at: text(body.occurred_at, 64),
      confidentiality_level: body.confidentiality_level === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'STANDARD',
      source_system: 'AIRTRUST',
      external_reference: externalReference,
      event_kind: 'SAFETY_REPORT',
      credits_used: 0,
      status: 'received',
    }

    let eventId: string
    let created = false
    if (existing?.id) {
      const { data, error } = await admin.from('events').update(common).eq('id', existing.id).eq('tenant_id', connection.tenantId).select('id').single()
      if (error || !data) return jsonError('Falha ao atualizar evento integrado.', 500)
      eventId = String(data.id)
    } else {
      const { data, error } = await admin.from('events').insert({
        tenant_id: connection.tenantId,
        submitted_by: null,
        ...common,
        triage_status: 'UNTRIAGED',
        investigation_path: 'NONE',
      }).select('id').single()
      if (error || !data) return jsonError('Falha ao criar evento integrado.', 500)
      eventId = String(data.id)
      created = true
    }

    await writeAuditLog({
      tenantId: connection.tenantId,
      userId: null,
      requestId,
      eventType: 'safety_event_reported',
      entityType: 'event',
      entityId: eventId,
      route: '/api/integrations/airtrust/events',
      method: 'POST',
      metadata: { source_system: 'AIRTRUST', external_reference: externalReference, integration_connection_id: connection.id, created },
    })

    return NextResponse.json({ event_id: eventId, created, analysis_started: false, credits_used: 0 }, {
      status: created ? 201 : 200,
      headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError('Falha ao sincronizar evento do AirTrust.', 500)
  }
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    assertServiceRoleEnv()
    const connection = await requireIntegrationConnection(req, 'AIRTRUST', 'events:read')
    const url = new URL(req.url)
    const externalReference = text(url.searchParams.get('external_reference'), 200)
    if (!externalReference) return jsonError('external_reference é obrigatório.', 400)
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('events')
      .select('id, title, status, triage_status, investigation_path, updated_at')
      .eq('tenant_id', connection.tenantId)
      .eq('source_system', 'AIRTRUST')
      .eq('external_reference', externalReference)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return jsonError('Falha ao consultar evento integrado.', 500)
    if (!data) return jsonError('Evento integrado não encontrado.', 404)
    return NextResponse.json(data, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
  } catch (error) {
    if (error instanceof Response) return error
    return jsonError('Falha ao consultar evento integrado.', 500)
  }
}
