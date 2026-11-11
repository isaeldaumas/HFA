import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TRIAL_DAYS, DEFAULT_TRIAL_LIMIT } from '@/lib/product/trial'
import { verifyRegistrationTurnstile } from '@/lib/server/registration-turnstile'

type AdminClient = SupabaseClient
export type RegisterDependencies = {
  createAdminClient?: (url: string, serviceRole: string) => AdminClient
  verifyChallenge?: (token: unknown, siteUrl: string) => Promise<boolean>
}

/**
 * An invite may refer to an existing unconfirmed Auth identity. Never delete
 * that user as compensation: doing so could destroy another registration.
 * Roll back only the provisional tenant and flag orphan invites for support.
 */
async function cleanupIncompleteRegistration(admin: AdminClient, tenantId: string): Promise<boolean> {
  try {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId)
    if (error) throw error
    return true
  } catch (error) {
    console.error('[auth/register] tenant cleanup failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return false
  }
}

function randomSlug(base: string): string {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 10)
  return `${clean || 'org'}-${suffix}`
}

const MAX_REGISTER_BODY_BYTES = 8_192

function inviteRedirect(siteUrl: string | undefined): string | null {
  if (!siteUrl) return null
  try {
    const origin = new URL(siteUrl)
    const localhost = origin.hostname === 'localhost' || origin.hostname === '127.0.0.1'
    if (origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && localhost && origin.protocol === 'http:')) return null
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return null
    return new URL('/accept-invite', origin).toString()
  } catch {
    return null
  }
}

/** Never buffer an unbounded request: content-length can be absent or untrusted. */
async function readLimitedRegistrationBody(req: Request): Promise<{ raw?: string; tooLarge: boolean }> {
  const declaredLength = req.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) > MAX_REGISTER_BODY_BYTES) {
    return { tooLarge: true }
  }
  const reader = req.body?.getReader()
  if (!reader) return { raw: '', tooLarge: false }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = ''
  let count = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    count += chunk.value.byteLength
    if (count > MAX_REGISTER_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      return { tooLarge: true }
    }
    raw += decoder.decode(chunk.value, { stream: true })
  }
  raw += decoder.decode()
  return { raw, tooLarge: false }
}

export async function handleRegisterRequest(req: Request, deps: RegisterDependencies = {}) {
  let activeAdmin: AdminClient | null = null
  let createdTenantId: string | null = null
  try {
    // Production admission gate must run before parsing untrusted input or
    // instantiating privileged clients. Missing flag means NO registration.
    if (process.env.HFA_REGISTRATION_INVITES_READY !== 'true') {
      return NextResponse.json({ detail: 'Novos cadastros temporariamente indisponíveis.' }, { status: 503 })
    }
    // Limit request size before parsing untrusted JSON. This is not a rate
    // limiter: it only bounds work and rejects malformed input before writes.
    const { raw, tooLarge } = await readLimitedRegistrationBody(req)
    if (tooLarge) {
      return NextResponse.json({ detail: 'Dados de cadastro excessivos.' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(raw ?? '')
    } catch {
      return NextResponse.json({ detail: 'Dados de cadastro inválidos.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ detail: 'Dados de cadastro inválidos.' }, { status: 400 })
    }
    const values = body as Record<string, unknown>
    if (typeof values.email !== 'string' || typeof values.company_name !== 'string') {
      return NextResponse.json({
        detail: 'Email e nome da empresa são obrigatórios.',
      }, { status: 400 })
    }
    if (values.full_name !== undefined && typeof values.full_name !== 'string' ||
        values.slug !== undefined && typeof values.slug !== 'string') {
      return NextResponse.json({ detail: 'Campos de cadastro inválidos.' }, { status: 400 })
    }
    const email = values.email.trim().toLowerCase()
    const company_name = values.company_name.trim()
    const full_name = typeof values.full_name === 'string' ? values.full_name.trim() : ''
    const slug = typeof values.slug === 'string' ? values.slug.trim() : ''
    if (!email || !company_name) {
      return NextResponse.json({
        detail: 'Email e nome da empresa são obrigatórios.',
      }, { status: 400 })
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        company_name.length > 255 || full_name.length > 255 ||
        slug.length > 80 || (slug && !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug))) {
      return NextResponse.json({ detail: 'Formato dos dados de cadastro inválido.' }, { status: 400 })
    }
    // Passwords are set only by the mailbox owner after accepting an invite.
    // Reject old clients that still submit a password; never accept it here.
    if (values.password !== undefined) {
      return NextResponse.json({ detail: 'A senha será definida após a confirmação por email.' }, { status: 400 })
    }

    // The early operational gate is required even with a valid request.
    const redirectTo = inviteRedirect(process.env.NEXT_PUBLIC_SITE_URL)
    if (!redirectTo) {
      return NextResponse.json({ detail: 'Serviço de convites indisponível.' }, { status: 503 })
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    const turnstileSecret = process.env.HFA_TURNSTILE_SECRET_KEY ?? ''
    if (!deps.verifyChallenge && !turnstileSecret) {
      return NextResponse.json({ detail: 'Verificação de segurança indisponível.' }, { status: 503 })
    }
    const verified = deps.verifyChallenge
      ? await deps.verifyChallenge(values.turnstile_token, siteUrl)
      : await verifyRegistrationTurnstile(values.turnstile_token, siteUrl, turnstileSecret)
    if (!verified) {
      return NextResponse.json({ detail: 'Verificação de segurança não aprovada. Tente novamente.' }, { status: 403 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!url || !service) {
      return NextResponse.json(
        { detail: 'Serviço temporariamente indisponível' },
        { status: 503 }
      )
    }

    const admin = deps.createAdminClient?.(url, service) ?? createClient(url, service)
    activeAdmin = admin

    // Do not use auth.admin.listUsers() to check for duplicates. It is
    // paginated (50 users by default) and a preflight cannot prevent races.
    // Supabase Auth enforces email uniqueness when createUser is called.
    // Cria o tenant primeiro
    const finalSlug = slug || randomSlug(company_name)

    // Garante slug único
    const { data: existingTenant } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', finalSlug)
      .maybeSingle()

    const uniqueSlug = existingTenant?.id
      ? `${finalSlug}-${Math.random().toString(36).slice(2, 8)}`
      : finalSlug

    const trialStartedAt = new Date()
    const trialExpiresAt = new Date(trialStartedAt.getTime() + DEFAULT_TRIAL_DAYS * 86_400_000)

    const { data: tenantData, error: tenantErr } = await admin
      .from('tenants')
      .insert({
        name: company_name.slice(0, 255),
        slug: uniqueSlug,
        plan: 'trial',
        credits_balance: DEFAULT_TRIAL_LIMIT,
        trial_case_limit: DEFAULT_TRIAL_LIMIT,
        trial_started_at: trialStartedAt.toISOString(),
        trial_expires_at: trialExpiresAt.toISOString(),
      })
      .select('id')
      .single()

    if (tenantErr || !tenantData?.id) {
      console.error('[auth/register] tenant creation failed', { code: tenantErr?.code ?? 'unknown' })
      return NextResponse.json(
        { detail: 'Falha ao configurar empresa. Tente novamente.' },
        { status: 500 }
      )
    }

    const tenantId = String(tenantData.id)
    createdTenantId = tenantId

    // Invitation proves mailbox possession before first authentication.
    // No user password or role/tenant claim is entrusted to user_metadata.
    // The authoritative tenant/role mapping remains public.users.
    const { data: newUser, error: createErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

    if (createErr || !newUser?.user?.id) {
      console.error('[auth/register] user creation failed', {
        code: createErr?.code,
        status: createErr?.status,
      })

      // A creation failure must not leave a newly funded trial tenant behind.
      // A failed invite call might already have created an Auth identity.
      // Its ownership cannot be proven, so only the tenant is rolled back.
      const rolledBack = await cleanupIncompleteRegistration(admin, tenantId)
      if (!rolledBack) return NextResponse.json(
        { detail: 'Falha ao concluir o cadastro. Entre em contato com o suporte.' },
        { status: 500 }
      )
      // Auth is the source of truth for duplicate identities. Preserve the
      // previous 409 contract without exposing provider errors or user lists.
      const duplicate = createErr?.code === 'email_exists' ||
        createErr?.code === 'user_already_exists'
      return NextResponse.json({
        detail: duplicate ? 'Já existe uma conta com este email. Faça login.'
          : 'Não foi possível criar o usuário. Confira os dados e tente novamente.',
      }, { status: duplicate ? 409 : 400 })
    }

    const userId = newUser.user.id

    // Insere na tabela pública users
    const { error: userInsErr } = await admin.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      email,
      full_name: (full_name?.trim() || company_name).slice(0, 255),
      role: 'admin',
      is_active: true,
    })

    if (userInsErr) {
      console.error('[auth/register] public user insert failed', {
        code: userInsErr.code,
      })
      // Never report success for an account that cannot be authorized.
      // An invitation may reuse a pending Auth identity owned by another
      // signup; deleting it would be an account integrity violation.
      const rolledBack = await cleanupIncompleteRegistration(admin, tenantId)
      return NextResponse.json(
        { detail: rolledBack
          ? 'Cadastro incompleto após o convite. Entre em contato com o suporte.'
          : 'Cadastro incompleto. Entre em contato com o suporte antes de tentar novamente.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, invite_requested: true, delivery_confirmed: false })
  } catch (e) {
    console.error('[auth/register] unexpected error', {
      errorType: e instanceof Error ? e.name : typeof e,
    })
    // Network exceptions are not returned as PostgREST { error }. They require
    // the same compensating cleanup as explicit failures after tenant creation.
    if (activeAdmin && createdTenantId) {
      const rolledBack = await cleanupIncompleteRegistration(activeAdmin, createdTenantId)
      return NextResponse.json({
        detail: rolledBack
          ? 'Cadastro não concluído. Caso tenha recebido o convite, entre em contato com o suporte.'
          : 'Cadastro incompleto. Entre em contato com o suporte antes de tentar novamente.',
      }, { status: 500 })
    }
    return NextResponse.json(
      { detail: 'Erro interno ao criar conta' },
      { status: 500 },
    )
  }
}
