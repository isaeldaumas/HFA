/** Challenge verification is server-side, fail-closed, and is not a rate limiter. */
export async function verifyRegistrationTurnstile(
  token: unknown,
  siteUrl: string,
  secret: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2048 || !secret) return false
  let hostname: string
  try {
    hostname = new URL(siteUrl).hostname
  } catch {
    return false
  }
  try {
    const response = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object') return false
    const payload = result as { success?: unknown; hostname?: unknown }
    return payload.success === true && payload.hostname === hostname
  } catch {
    return false
  }
}
