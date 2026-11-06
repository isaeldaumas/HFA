import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePlatformAdmin } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'

type PasswordResetDependencies = {
  authorize?: (req: Request) => Promise<unknown>
  getAdmin?: () => SupabaseClient
  siteUrl?: string | null
}

function recoveryRedirect(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null
  try {
    const url = new URL(siteUrl)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local && url.protocol === 'http:')) return null
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    return new URL('/update-password', url).toString()
  } catch {
    return null
  }
}

/**
 * Admin-only recovery request. Supabase Auth queues a recovery email via its
 * configured mailer; a successful API response is NOT proof of inbox delivery.
 * No token/link is generated or exposed to the browser or application logs.
 */
export async function handleAdminPasswordResetRequest(
  req: Request,
  deps: PasswordResetDependencies = {},
) {
  try {
    await (deps.authorize ?? requirePlatformAdmin)(req)
    const redirectTo = recoveryRedirect(deps.siteUrl === undefined
      ? process.env.NEXT_PUBLIC_SITE_URL
      : deps.siteUrl)
    if (!redirectTo) {
      return NextResponse.json(
        { detail: 'Recuperação indisponível: endereço público HTTPS do HFA não configurado.' },
        { status: 503 },
      )
    }

    const admin = (deps.getAdmin ?? getSupabaseAdmin)()
    const { data, error: lookupError } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_email')
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ detail: 'Não foi possível consultar o email administrativo.' }, { status: 503 })
    }
    const email = String(data?.value ?? '').trim().toLowerCase()
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ detail: 'Salve um email administrativo válido antes de solicitar a recuperação.' }, { status: 400 })
    }

    // Reject a stale or tampered browser value. The destination is always the
    // server-stored address, never an arbitrary email submitted by the browser.
    const body = await req.json().catch(() => ({})) as { email?: unknown }
    if (body.email !== undefined && (
      typeof body.email !== 'string' || body.email.trim().toLowerCase() !== email
    )) {
      return NextResponse.json({ detail: 'Email alterado. Salve as configurações e tente novamente.' }, { status: 409 })
    }

    const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) {
      console.error('[admin/password-reset] mailer request rejected', {
        code: error.code ?? 'unknown',
        status: error.status ?? null,
      })
      return NextResponse.json(
        { detail: 'O serviço de autenticação não aceitou a solicitação. Verifique o envio de emails no Supabase.' },
        { status: 502 },
      )
    }

    return NextResponse.json({
      ok: true,
      request_accepted: true,
      delivery_confirmed: false,
    })
  } catch (error) {
    if (error instanceof Response) return error
    console.error('[admin/password-reset] unexpected failure', {
      errorType: error instanceof Error ? error.name : typeof error,
    })
    return NextResponse.json({ detail: 'Não foi possível solicitar a recuperação de senha.' }, { status: 500 })
  }
}
