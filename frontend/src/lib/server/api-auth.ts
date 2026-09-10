import { createClient } from '@supabase/supabase-js'
import { resolveAuthorizedUserContext } from './authorized-user-context'

export type ApiUserContext = {
  /** authUserId: use for Supabase Auth Admin API (updateUserById etc.) */
  userId: string
  email: string | undefined
  tenantId: string
  role: string
  accessToken: string
}

export async function requireBearerUser(req: Request): Promise<ApiUserContext> {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ detail: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const token = auth.slice(7)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon) {
    throw new Response(JSON.stringify({ detail: 'Supabase não configurado' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Step 1: validate bearer token
  const supabase = createClient(url, anon)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    throw new Response(JSON.stringify({ detail: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Step 2: resolve tenant/role authoritatively from public.users via service-role
  // Never use user_metadata or app_metadata as source of tenant/role authorization.
  if (!serviceKey) {
    throw new Response(JSON.stringify({ detail: 'Configuração de servidor ausente' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceKey)
  const result = await resolveAuthorizedUserContext(admin, user.id, user.email ?? undefined)

  if (!result.ok) {
    throw new Response(JSON.stringify({ detail: result.detail }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx = result.context

  return {
    userId: ctx.authUserId,
    email: ctx.email,
    tenantId: ctx.tenantId,
    role: ctx.role,
    accessToken: token,
  }
}
