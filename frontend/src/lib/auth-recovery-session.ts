/**
 * Accept only a verified password recovery callback, not an existing session
 * opened on the password page. OAuth login and arbitrary query fragments must
 * not grant recovery eligibility.
 */
export type RecoveryAuth = {
  getSession: () => Promise<{ data: { session: unknown | null }; error: unknown | null }>
  exchangeCodeForSession: (code: string) => Promise<{ data: { session: unknown | null }; error: unknown | null }>
}

export function isPasswordRecoveryEvent(event: string, session: unknown | null): boolean {
  return event === 'PASSWORD_RECOVERY' && Boolean(session)
}

export async function verifyPasswordRecoveryCallback(auth: RecoveryAuth, href: string): Promise<boolean> {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }

  // A failed confirmation / expired-token redirect must never be interpreted
  // as eligible even if there is a previous authenticated session.
  if (url.searchParams.has('error') || url.searchParams.has('error_code')) return false

  const code = url.searchParams.get('code')
  if (code !== null) {
    if (!code || code.length > 2048) return false
    try {
      const { data, error } = await auth.exchangeCodeForSession(code)
      // Never fall back to getSession: it may belong to a different login.
      return !error && Boolean(data.session)
    } catch {
      return false
    }
  }

  // Implicit recovery links contain both tokens and an explicit recovery type.
  // `#type=recovery` alone must not elevate an already logged-in session.
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (hash.get('type') !== 'recovery' || !hash.get('access_token') || !hash.get('refresh_token')) {
    return false
  }
  try {
    const { data, error } = await auth.getSession()
    return !error && Boolean(data.session)
  } catch {
    return false
  }
}
