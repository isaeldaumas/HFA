const LEGACY_API = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '') || ''

/**
 * Resolve URL para chamadas à API.
 * Rotas SERA migradas (`/events`, `/analyses`) usam sempre `/api/*` na mesma origem.
 * Demais rotas (`/auth`, `/actions`, …) usam `NEXT_PUBLIC_API_URL` quando definida.
 */
export function resolveApiUrl(endpoint: string): string {
  let p = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)

  const localSera =
    p === '/events' || p.startsWith('/events/') || p.startsWith('/analyses/')

  if (localSera) return `/api${p}`

  if (LEGACY_API) return `${LEGACY_API}${p}`
  return `/api${p}`
}

export async function apiCall(
  endpoint: string,
  options: RequestInit = {},
  token?: string
) {
  const url = resolveApiUrl(endpoint)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(url, { ...options, headers })
  } catch {
    throw new Error(
      'Não foi possível conectar à API. Confirme a rede. Rotas /auth e /actions ainda podem exigir NEXT_PUBLIC_API_URL apontando para o backend legado.'
    )
  }
  if (!res.ok) {
    // Vercel WAF often sends HTML rather than JSON on a 429. Do not surface
    // its opaque body or the unhelpful 'HTTP 429' fallback to signup users.
    if (res.status === 429) {
      throw new Error('Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.')
    }
    const error = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    const detail =
      typeof error.detail === 'string'
        ? error.detail
        : Array.isArray(error.detail)
          ? error.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ')
          : error.message
    throw new Error(detail || `Erro na requisição (${res.status})`)
  }
  return res.json()
}
