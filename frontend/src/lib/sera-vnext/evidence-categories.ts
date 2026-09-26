import type { SeraVNextEvidenceCategory, SeraVNextEvidenceCategoryHint } from './types'

const CATEGORY_SET = new Set<SeraVNextEvidenceCategory>([
  'PHYSICAL_CAPABILITY',
  'INTENT_AWARENESS',
  'TIME_PRESSURE',
  'COMMUNICATION_INFORMATION',
  'PROCEDURAL_MONITORING',
  'KNOWLEDGE_TRAINING',
  'SUPERVISION_COORDINATION',
  'OPERATIONAL_EFFICIENCY_PRESSURE',
  'SENSORY_LIMITATION',
  'PERCEPTUAL_AMBIGUITY',
  'FEEDBACK_VERIFICATION',
  'RULE_NORM_CONTEXT',
  'UNKNOWN_OR_UNCATEGORIZED',
])

const CODE_HINT_MAP: Partial<Record<string, SeraVNextEvidenceCategory[]>> = {
  'A-D': ['PHYSICAL_CAPABILITY'],
  'O-B': ['INTENT_AWARENESS', 'RULE_NORM_CONTEXT'],
  'O-C': ['INTENT_AWARENESS', 'RULE_NORM_CONTEXT'],
  'O-D': ['INTENT_AWARENESS', 'OPERATIONAL_EFFICIENCY_PRESSURE'],
  'P-D': ['TIME_PRESSURE'],
  'P-G': ['PROCEDURAL_MONITORING', 'FEEDBACK_VERIFICATION'],
  'P-H': ['COMMUNICATION_INFORMATION'],
  'A-C': ['PROCEDURAL_MONITORING', 'FEEDBACK_VERIFICATION'],
  'A-H': ['TIME_PRESSURE'],
  'A-I': ['TIME_PRESSURE'],
  'A-J': ['TIME_PRESSURE', 'COMMUNICATION_INFORMATION', 'FEEDBACK_VERIFICATION'],
}

const TEXT_HINTS: Array<{ category: SeraVNextEvidenceCategory; tokens: string[] }> = [
  { category: 'PHYSICAL_CAPABILITY', tokens: ['physical', 'motor', 'ergonomic'] },
  { category: 'INTENT_AWARENESS', tokens: ['intent', 'intentional', 'conscious'] },
  { category: 'TIME_PRESSURE', tokens: ['time pressure', 'time-critical', 'schedule pressure', 'rushed sequence'] },
  { category: 'COMMUNICATION_INFORMATION', tokens: ['communication', 'readback', 'briefing', 'information'] },
  { category: 'PROCEDURAL_MONITORING', tokens: ['monitoring', 'cross-check', 'procedure', 'verification'] },
  { category: 'KNOWLEDGE_TRAINING', tokens: ['knowledge', 'training', 'competence'] },
  { category: 'SUPERVISION_COORDINATION', tokens: ['supervision', 'coordination', 'delegation'] },
  { category: 'OPERATIONAL_EFFICIENCY_PRESSURE', tokens: ['efficiency', 'throughput', 'schedule pressure'] },
  { category: 'SENSORY_LIMITATION', tokens: ['visibility', 'noise', 'sensory', 'weather'] },
  { category: 'PERCEPTUAL_AMBIGUITY', tokens: ['ambiguous', 'uncertain cue', 'misinterpretation'] },
  { category: 'FEEDBACK_VERIFICATION', tokens: ['feedback', 'verify', 'verification', 'check result'] },
  { category: 'RULE_NORM_CONTEXT', tokens: ['rule', 'normalization', 'norm'] },
]

function normalizeCategory(value: string): SeraVNextEvidenceCategory | null {
  const category = value.trim().toUpperCase() as SeraVNextEvidenceCategory
  return CATEGORY_SET.has(category) ? category : null
}

function addHint(target: SeraVNextEvidenceCategoryHint[], hint: SeraVNextEvidenceCategoryHint): void {
  if (!CATEGORY_SET.has(hint.category)) {
    return
  }

  const exists = target.some(
    (item) =>
      item.category === hint.category &&
      item.source === hint.source &&
      (item.evidenceRef || '') === (hint.evidenceRef || '') &&
      (item.note || '') === (hint.note || '')
  )

  if (!exists) {
    target.push(hint)
  }
}

function includesAny(text: string, tokens: string[]): boolean {
  const normalized = text.toLowerCase()
  return tokens.some((token) => normalized.includes(token.toLowerCase()))
}

export function normalizePassiveEvidenceCategoryHints(
  hints?: Array<SeraVNextEvidenceCategoryHint | SeraVNextEvidenceCategory | string>
): SeraVNextEvidenceCategoryHint[] {
  if (!hints || hints.length === 0) {
    return []
  }

  const normalized: SeraVNextEvidenceCategoryHint[] = []

  for (const hint of hints) {
    if (typeof hint === 'string') {
      const category = normalizeCategory(hint)
      if (category) {
        addHint(normalized, { category, source: 'manual' })
      }
      continue
    }

    const category = normalizeCategory(hint.category)
    if (!category) {
      continue
    }

    addHint(normalized, {
      category,
      source: hint.source,
      evidenceRef: hint.evidenceRef,
      note: hint.note,
    })
  }

  return normalized
}

export function buildPassiveEvidenceCategoryHints(input: {
  releasedCode?: string | null
  evidenceRefs?: string[]
  rationaleRefs?: string[]
  providedHints?: Array<SeraVNextEvidenceCategoryHint | SeraVNextEvidenceCategory | string>
}): SeraVNextEvidenceCategoryHint[] {
  const hints: SeraVNextEvidenceCategoryHint[] = normalizePassiveEvidenceCategoryHints(input.providedHints)

  const code = (input.releasedCode || '').toUpperCase()
  const mapped = CODE_HINT_MAP[code] || []
  for (const category of mapped) {
    addHint(hints, {
      category,
      source: 'mapped',
      note: `Mapped from released code ${code}`,
    })
  }

  const evidenceText = [...(input.evidenceRefs || []), ...(input.rationaleRefs || [])].join(' ')
  if (evidenceText.trim().length > 0) {
    for (const rule of TEXT_HINTS) {
      if (includesAny(evidenceText, rule.tokens)) {
        addHint(hints, {
          category: rule.category,
          source: 'inferred',
          note: 'Conservative passive text hint from evidence/rationale.',
        })
      }
    }
  }

  return hints
}
