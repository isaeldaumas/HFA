/**
 * Offline smoke-target allowlist. Never use fuzzy string matching to
 * determine whether a URL is staging, e.g. url.includes('staging').
 * Remote stages additionally require a separately verified project identity.
 */
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:3100', 'http://localhost:3100'])
const FORBIDDEN_ORIGINS = new Set([
  'https://systemhfa.vercel.app',
  'https://frontend-systemhfa.vercel.app',
  'https://systemhfa-systemhfa.vercel.app',
])

export function isAllowedStagingTarget(input: string, approvedOrigins: readonly string[] = []): boolean {
  let parsed: URL
  try { parsed = new URL(input) } catch { return false }
  if (parsed.username || parsed.password || parsed.hash) return false
  if (LOCAL_ORIGINS.has(parsed.origin)) return true
  if (parsed.protocol !== 'https:' || FORBIDDEN_ORIGINS.has(parsed.origin)) return false
  return approvedOrigins.some(value => {
    try {
      const allow = new URL(value)
      return allow.protocol === 'https:' &&
        !allow.username && !allow.password && !allow.hash &&
        !allow.search && allow.pathname === '/' &&
        !FORBIDDEN_ORIGINS.has(allow.origin) &&
        allow.origin === parsed.origin
    } catch { return false }
  })
}
