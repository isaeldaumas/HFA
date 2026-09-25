function toIsoNoonUtc(day: number, month: number, year: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date.toISOString()
}

export function inferOccurrenceDateFromNarrative(narrative?: string | null): string | null {
  if (!narrative) return null
  const explicitPatterns = [
    /\bdata\s*\/?\s*hora\s+da\s+ocorr[eê]ncia\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
    /\bdata\s+da\s+ocorr[eê]ncia\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
    /\boccurrence\s+date(?:\/time)?\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
  ]
  for (const pattern of explicitPatterns) {
    const match = narrative.match(pattern)
    if (!match) continue
    const value = toIsoNoonUtc(Number(match[1]), Number(match[2]), Number(match[3]))
    if (value) return value
  }
  return null
}
