import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { issueIntegrationToken } from '@/lib/server/integration-auth'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'

function requireTenantAdminRole(role: string) {
  if (String(role).toLowerCase() !== 'admin') {
    throw new Response(JSON.stringify({ detail: 'Apenas administradores podem gerenciar integrações.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    requireTenantAdminRole(user.role)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('integration_connections')
      .select('id, provider, external_tenant_ref, name, token_prefix, scopes, is_active, last_used_at, created_at, updated_at')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
    if (error) return buildErrorResponse('Falha ao listar integrações.', 500, requestId)
    return NextResponse.json(data ?? [], { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    return buildErrorResponse('Falha ao listar integrações.', 500, requestId)
  }
}
export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    requireTenantAdminRole(user.role)
    assertServiceRoleEnv()
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const provider = String(body.provider ?? '').trim().toUpperCase()
    const externalTenantRef = String(body.external_tenant_ref ?? '').trim()
    const name = String(body.name ?? '').trim()
    if (provider !== 'AIRTRUST' || !externalTenantRef || !name) {
      return buildErrorResponse('provider, external_tenant_ref e name são obrigatórios.', 400, requestId)
    }

    const { token, tokenHash, tokenPrefix } = issueIntegrationToken()
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('integration_connections')
      .upsert({
        tenant_id: user.tenantId,
        provider,
        external_tenant_ref: externalTenantRef.slice(0, 128),
        name: name.slice(0, 160),
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        scopes: ['events:write', 'events:read'],
        is_active: true,
        created_by: user.publicUserId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,provider,external_tenant_ref' })
      .select('id, provider, external_tenant_ref, name, token_prefix, scopes, is_active, last_used_at, created_at, updated_at')
      .single()
    if (error || !data) return buildErrorResponse('Falha ao criar ou rotacionar integração.', 500, requestId)

    return NextResponse.json({ ...data, token, token_visible_once: true }, {
      status: 201,
      headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return buildErrorResponse('Falha ao criar ou rotacionar integração.', 500, requestId)
  }
}
