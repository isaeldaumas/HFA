import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_TRIAL_DAYS, DEFAULT_TRIAL_LIMIT } from '@/lib/product/trial'

type AdminClient = SupabaseClient
export type RegisterDependencies = {
  createAdminClient?: (url: string, serviceRole: string) => AdminClient
}

/**
 * Compensating cleanup for a multi-API signup. Auth and PostgREST writes
 * cannot be committed atomically; report errors rather than claiming success.
 */
async function cleanupIncompleteRegistration(
  admin: AdminClient,
  tenantId: string,
  authUserId: string | null,
): Promise<boolean> {
  let clean = true
  if (authUserId) {
    try {
      const { error } = await admin.auth.admin.deleteUser(authUserId)
      if (error) throw error
    } catch (error) {
      clean = false
      console.error('[auth/register] auth cleanup failed', {
        errorType: error instanceof Error ? error.name : typeof error,
      })
    }
  }
  try {
    const { error } = await admin.from('tenants').delete().eq('id', tenantId)
    if (error) throw error
  } catch (error) {
    clean = false
    console.error('[auth/register] tenant cleanup failed', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
  }
  return clean
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

export async function handleRegisterRequest(req: Request, deps: RegisterDependencies = {}) {
  let activeAdmin: AdminClient | null = null
  let createdTenantId: string | null = null
  let createdAuthUserId: string | null = null
  try {
    const { full_name, email, password, company_name, slug } = (await req.json()) as {
      full_name?: string
      email?: string
      password?: string
      company_name?: string
      slug?: string
    }

    if (!email || !password || !company_name) {
      return NextResponse.json(
        { detail: 'Email, senha e nome da empresa são obrigatórios' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { detail: 'A senha deve ter pelo menos 8 caracteres' },
        { status: 400 }
      )
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

    // Verifica se o email já existe
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const alreadyExists = existingUsers?.users?.some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )

    if (alreadyExists) {
      return NextResponse.json(
        { detail: 'Já existe uma conta com este email. Faça login.' },
        { status: 409 }
      )
    }

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
      console.error('[auth/register] tenant creation failed', tenantErr)
      return NextResponse.json(
        { detail: 'Falha ao configurar empresa. Tente novamente.' },
        { status: 500 }
      )
    }

    const tenantId = String(tenantData.id)
    createdTenantId = tenantId

    // Cria o usuário no Auth (admin, sem rate limit nem email confirmation).
    // tenant_id e role NÃO são colocados em user_metadata (user-controlled).
    // Autorização é resolvida exclusivamente por public.users (service-role query).
    // app_metadata é registrado como referência descritiva apenas — não é fonte autoritativa.
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { tenant_id: tenantId, role: 'admin' },
    })

    if (createErr || !newUser?.user?.id) {
      console.error('[auth/register] user creation failed', createErr)

      // A creation failure must not leave a newly funded trial tenant behind.
      // On a failed createUser call, ownership of any returned Auth identity
      // is unproven. Never delete someone else's account on this branch.
      const rolledBack = await cleanupIncompleteRegistration(admin, tenantId, null)
      if (!rolledBack) return NextResponse.json(
        { detail: 'Falha ao concluir o cadastro. Entre em contato com o suporte.' },
        { status: 500 }
      )
      const msg = createErr?.message || 'Falha ao criar usuário'
      return NextResponse.json(
        { detail: msg },
        { status: 400 }
      )
    }

    const userId = newUser.user.id
    createdAuthUserId = userId

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
      // Cleanup is best-effort across separate Supabase APIs.
      const rolledBack = await cleanupIncompleteRegistration(admin, tenantId, userId)
      return NextResponse.json(
        { detail: rolledBack
          ? 'Não foi possível concluir o cadastro. Tente novamente.'
          : 'Cadastro incompleto. Entre em contato com o suporte antes de tentar novamente.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, tenant_id: tenantId })
  } catch (e) {
    console.error('[auth/register] unexpected error', {
      errorType: e instanceof Error ? e.name : typeof e,
    })
    // Network exceptions are not returned as PostgREST { error }. They require
    // the same compensating cleanup as explicit failures after tenant creation.
    if (activeAdmin && createdTenantId) {
      const rolledBack = await cleanupIncompleteRegistration(activeAdmin, createdTenantId, createdAuthUserId)
      return NextResponse.json({
        detail: rolledBack
          ? 'Não foi possível concluir o cadastro. Tente novamente.'
          : 'Cadastro incompleto. Entre em contato com o suporte antes de tentar novamente.',
      }, { status: 500 })
    }
    return NextResponse.json(
      { detail: 'Erro interno ao criar conta' },
      { status: 500 },
    )
  }
}
