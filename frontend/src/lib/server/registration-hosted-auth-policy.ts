/**
 * Invitations may only be activated when hosted Supabase Auth blocks direct
 * signup and still permits verified email sign-in. Never use service_role here.
 */
export async function isHostedAuthSignupLocked(
  supabaseUrl: string | undefined,
  publicKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!supabaseUrl || !publicKey) return false
  let url: URL
  try {
    url = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) {
      return false
    }
  } catch {
    return false
  }
  try {
    const response = await fetcher(new URL('/auth/v1/settings', url), {
      method: 'GET',
      headers: { apikey: publicKey },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const data: unknown = await response.json()
    if (!data || typeof data !== 'object') return false
    const settings = data as { disable_signup?: unknown; mailer_autoconfirm?: unknown; external?: unknown }
    return settings.disable_signup === true && settings.mailer_autoconfirm === false &&
      !!settings.external && typeof settings.external === 'object' &&
      (settings.external as {email?: unknown}).email === true
  } catch {
    return false
  }
}
