import { createClient } from '@supabase/supabase-js'
import { resolveAuthorizedUserContext, type IdentityBinding } from './authorized-user-context'

export type ApiUserContext = {
  /**
   * UUID from auth.users.
   * Use for: Supabase Auth Admin API (updateUserById, deleteUser etc.)
   * Do NOT use for: public.users FK lookups (submitted_by, actor_id, created_by etc.)
   */
  authUserId: string

  /**
   * UUID from public.users.
   * Use for: all FK references into public.users (submitted_by, actor_id, created_by etc.)
   * Do NOT use for: Supabase Auth Admin API calls.
   */
  publicUserId: string

  /**
   * @deprecated Use authUserId for Auth API, publicUserId for public.users FK.
   * Kept for compatibility with existing callers; always equals authUserId.
   * New code must not use this field.
   */
  userId: string

  email: string | undefined
  tenantId: string
  role: string
  accessToken: string

  /** How the public.users row was bound to the auth identity */
  identityBinding: IdentityBinding
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

  // Step 1: validate bearer token via anon client
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

  // Step 2: resolve tenant/role authoritatively from public.users via service-role.
  // Never use user_metadata or app_metadata as source of tenant/role authorization.
  if (!serviceKey) {
    throw new Response(JSON.stringify({ detail: 'Configuração de servidor ausente' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceKey)
  const result = await resolveAuthorizedUserContext(admin, {
    authUserId: user.id,
    email: user.email ?? undefined,
    emailConfirmedAt: user.email_confirmed_at ?? null,
  })

  if (!result.ok) {
    throw new Response(JSON.stringify({ detail: result.detail }), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ctx = result.context

  return {
    authUserId: ctx.authUserId,
    publicUserId: ctx.publicUserId,
    userId: ctx.authUserId, // deprecated: always equals authUserId
    email: ctx.email,
    tenantId: ctx.tenantId,
    role: ctx.role,
    accessToken: token,
    identityBinding: ctx.identityBinding,
  }
}
