/** Preserve the exact safety narrative; never silently truncate evidence. */
export function parseAirTrustRawInput(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!value.trim() || value.length > 50_000) return null
  return value
}
