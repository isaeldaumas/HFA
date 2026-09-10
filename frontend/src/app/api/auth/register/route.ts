import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function randomSlug(base: string): string {
  const clean = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = Math.random().toString(36).slice(2, 10)
  return `${clean || 'org'}-${suffix}`
}

export async function POST(req: Request) {
  try {
    const { email, password, company_name, slug } = (await req.json()) as {
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

    const admin = createClient(url, service)

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

    const { data: tenantData, error: tenantErr } = await admin
      .from('tenants')
      .insert({
        name: company_name.slice(0, 255),
        slug: uniqueSlug,
        plan: 'trial',
        credits_balance: 3,
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

      // Rollback: remove o tenant criado
      await admin.from('tenants').delete().eq('id', tenantId)

      const msg = createErr?.message || 'Falha ao criar usuário'
      return NextResponse.json(
        { detail: msg },
        { status: 400 }
      )
    }

    const userId = newUser.user.id

    // Insere na tabela pública users
    const { error: userInsErr } = await admin.from('users').insert({
      id: userId,
      tenant_id: tenantId,
      email,
      full_name: company_name.slice(0, 255),
      role: 'admin',
      is_active: true,
    })

    if (userInsErr) {
      console.error('[auth/register] public user insert failed', userInsErr)
    }

    return NextResponse.json({ ok: true, tenant_id: tenantId })
  } catch (e) {
    console.error('[auth/register] unexpected error', e)
    return NextResponse.json(
      { detail: 'Erro interno ao criar conta' },
      { status: 500 }
    )
  }
}
