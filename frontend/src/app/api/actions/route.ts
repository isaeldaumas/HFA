import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()

    const { data, error } = await admin
      .from('corrective_actions')
      .select('id, title, description, related_failure, status, responsible, due_date, completed_at, created_at, analysis_id, sera_vnext_analysis_id')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
    if (error) return jsonError(error.message, 500)

    const legacyIds = (data ?? []).map((row) => row.analysis_id).filter((id): id is string => typeof id === 'string')
    const currentIds = (data ?? []).map((row) => row.sera_vnext_analysis_id).filter((id): id is string => typeof id === 'string')

    const [legacyRows, currentRows] = await Promise.all([
      legacyIds.length
        ? admin.from('analyses').select('id, event_id').eq('tenant_id', user.tenantId).in('id', legacyIds)
        : Promise.resolve({ data: [], error: null }),
      currentIds.length
        ? admin.from('sera_vnext_analyses').select('id, source_reference').eq('tenant_id', user.tenantId).in('id', currentIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (legacyRows.error || currentRows.error) return jsonError('Não foi possível resolver a origem das ações.', 500)

    const legacyEventByAnalysis = new Map((legacyRows.data ?? []).map((row) => [String(row.id), row.event_id as string | null]))
    const currentEventByAnalysis = new Map((currentRows.data ?? []).map((row) => [String(row.id), row.source_reference as string | null]))

    const rows = (data ?? []).map((row) => {
      const currentId = row.sera_vnext_analysis_id as string | null
      const legacyId = row.analysis_id as string | null
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        related_failure: row.related_failure,
        status: row.status,
        responsible: row.responsible,
        due_date: row.due_date,
        completed_at: row.completed_at,
        created_at: row.created_at,
        analysis_id: currentId ?? legacyId,
        analysis_engine: currentId ? 'SERA_ENGINE_0_3' : 'LEGACY_HISTORICAL',
        event_id: currentId
          ? currentEventByAnalysis.get(currentId) ?? null
          : legacyId
            ? legacyEventByAnalysis.get(legacyId) ?? null
            : null,
      }
    })
    return NextResponse.json(rows, { headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[/api/actions GET]', { requestId, errorType: e instanceof Error ? e.name : typeof e })
    return jsonError('Não foi possível listar as ações.', 500)
  }
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const { analysis_id, title, description, related_failure } = body as {
      analysis_id?: string; title?: string; description?: string; related_failure?: string
    }
    if (!analysis_id || !title?.trim()) return jsonError('analysis_id e title são obrigatórios', 400)

    const { data: currentAnalysis } = await admin
      .from('sera_vnext_analyses')
      .select('id')
      .eq('id', analysis_id)
      .eq('tenant_id', user.tenantId)
      .is('deleted_at', null)
      .maybeSingle()

    let legacyAnalysis: { id: string } | null = null
    if (!currentAnalysis) {
      const legacyLookup = await admin
        .from('analyses')
        .select('id')
        .eq('id', analysis_id)
        .eq('tenant_id', user.tenantId)
        .maybeSingle()
      legacyAnalysis = legacyLookup.data as { id: string } | null
    }
    if (!currentAnalysis && !legacyAnalysis) return jsonError('Análise não encontrada ou acesso negado', 404)

    const { data, error } = await admin
      .from('corrective_actions')
      .insert({
        analysis_id: legacyAnalysis?.id ?? null,
        sera_vnext_analysis_id: currentAnalysis?.id ?? null,
        tenant_id: user.tenantId,
        title: title.trim(),
        description: description?.trim() || null,
        related_failure: related_failure || null,
        status: 'pending',
      })
      .select('id, title, status, related_failure, analysis_id, sera_vnext_analysis_id')
      .single()
    if (error) return jsonError(error.message, 500)

    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'corrective_action_created', entityType: 'corrective_action', entityId: data.id,
      route: '/api/actions', method: 'POST',
      metadata: { analysis_id, analysis_engine: currentAnalysis ? 'SERA_ENGINE_0_3' : 'LEGACY_HISTORICAL' },
    })

    return NextResponse.json({
      id: data.id, title: data.title, status: data.status, related_failure: data.related_failure,
      analysis_id, analysis_engine: currentAnalysis ? 'SERA_ENGINE_0_3' : 'LEGACY_HISTORICAL',
    }, { status: 201, headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[/api/actions POST]', { requestId, errorType: e instanceof Error ? e.name : typeof e })
    return jsonError('Não foi possível criar a ação.', 500)
  }
}
