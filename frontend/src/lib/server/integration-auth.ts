import { createHash, randomBytes } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

export type IntegrationProvider = 'AIRTRUST'

export type IntegrationConnectionContext = {
  id: string
  tenantId: string
  provider: IntegrationProvider
  externalTenantRef: string
  scopes: string[]
}

export function hashIntegrationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function issueIntegrationToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `hfa_int_${randomBytes(32).toString('base64url')}`
  return {
    token,
    tokenHash: hashIntegrationToken(token),
    tokenPrefix: token.slice(0, 16),
  }
}
export async function requireIntegrationConnection(
  req: Request,
  provider: IntegrationProvider,
  requiredScope: string,
): Promise<IntegrationConnectionContext> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) throw new Response('Unauthorized', { status: 401 })
  const token = auth.slice(7).trim()
  if (!token.startsWith('hfa_int_') || token.length < 30) throw new Response('Unauthorized', { status: 401 })

  const admin = getSupabaseAdmin()
  const tokenHash = hashIntegrationToken(token)
  const { data, error } = await admin
    .from('integration_connections')
    .select('id, tenant_id, provider, external_tenant_ref, scopes, is_active')
    .eq('token_hash', tokenHash)
    .eq('provider', provider)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) throw new Response('Unauthorized', { status: 401 })
  const scopes = Array.isArray(data.scopes) ? data.scopes.map(String) : []
  if (!scopes.includes(requiredScope)) throw new Response('Forbidden', { status: 403 })

  void admin.from('integration_connections').update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  return {
    id: String(data.id),
    tenantId: String(data.tenant_id),
    provider,
    externalTenantRef: String(data.external_tenant_ref),
    scopes,
  }
}
