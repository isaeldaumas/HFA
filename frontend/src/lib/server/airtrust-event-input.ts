/** A source narrative must be preserved exactly; truncation destroys evidence. */
export function parseAirTrustRawInput(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.trim() || value.length > 50_000) return null
  return value
}

const MAX_JSON_BYTES = 256 * 1024

type EventBodyResult =
  | { kind: 'ok'; body: Record<string, unknown> }
  | { kind: 'too_large' }
  | { kind: 'invalid' }

/** Bound request-body bytes even when Content-Length is absent or incorrect. */
export async function readAirTrustEventBody(req: Request): Promise<EventBodyResult> {
  const declaredLength = req.headers.get('content-length')
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_JSON_BYTES) {
    return { kind: 'too_large' }
  }
  const reader = req.body?.getReader()
  if (!reader) return { kind: 'invalid' }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let raw = ''
  let count = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      count += chunk.value.byteLength
      if (count > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { kind: 'too_large' }
      }
      raw += decoder.decode(chunk.value, { stream: true })
    }
    raw += decoder.decode()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { kind: 'invalid' }
    return { kind: 'ok', body: parsed as Record<string, unknown> }
  } catch {
    return { kind: 'invalid' }
  }
}
