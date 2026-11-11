/** Bounds the integration payload without losing exact source evidence. */
export function parseAirTrustNarrative(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 200_000) return null
  return value
}

const MAX_JSON_BYTES = 1024 * 1024

type EventBodyResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'too_large' }
  | { kind: 'invalid' }

/** Enforce a byte limit regardless of Content-Length; never buffer unlimited JSON. */
export async function readAirTrustEventBody(req: Request): Promise<EventBodyResult> {
  const length = req.headers.get('content-length')
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_JSON_BYTES) return { kind: 'too_large' }
  const reader = req.body?.getReader()
  if (!reader) return { kind: 'invalid' }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { kind: 'too_large' }
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
    raw += decoder.decode()
    const body: unknown = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { kind: 'invalid' }
    return { kind: 'ok', body: body as Record<string, unknown> }
  } catch {
    return { kind: 'invalid' }
  }
}
