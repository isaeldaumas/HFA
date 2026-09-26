const RISK_PROFILE_RELATIONSHIPS = new Set([
  'ENABLING_PRECONDITION',
  'CONTEXTUAL_PRECONDITION',
])

export function normalizeRiskProfileVNextPreconditions(engineOutput: unknown): string[] {
  if (!engineOutput || typeof engineOutput !== 'object') return []
  const value = (engineOutput as { preconditions?: unknown }).preconditions
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const candidate = item as { category?: unknown; relationship?: unknown }
      if (typeof candidate.relationship !== 'string' || !RISK_PROFILE_RELATIONSHIPS.has(candidate.relationship)) return null
      return typeof candidate.category === 'string' && candidate.category.trim().length > 0 ? candidate.category : null
    })
    .filter((category): category is string => !!category)
}
