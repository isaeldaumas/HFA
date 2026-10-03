import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getOrCreateRequestId(req)
  try {
    const user = await requireBearerUser(req)
    if (String(user.role).toLowerCase() !== 'admin') {
      return buildErrorResponse('Apenas administradores podem revogar integrações.', 403, requestId)
    }
    assertServiceRoleEnv()
    const { id } = await params
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('integration_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id')
      .maybeSingle()
    if (error) return buildErrorResponse('Falha ao revogar integração.', 500, requestId)
    if (!data) return buildErrorResponse('Integração não encontrada.', 404, requestId)
    return NextResponse.json({ ok: true, id }, { headers: { 'x-request-id': requestId } })
  } catch (error) {
    if (error instanceof Response) return error
    return buildErrorResponse('Falha ao revogar integração.', 500, requestId)
  }
}
