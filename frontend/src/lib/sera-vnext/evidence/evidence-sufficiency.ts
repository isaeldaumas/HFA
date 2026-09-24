import type { CanonicalSeraAxis } from '../types'
import type { SeraEvidenceItem, SeraEvidenceUse } from './types'

export function axisToEvidenceUse(axis: CanonicalSeraAxis): SeraEvidenceUse {
  if (axis === 'P') return 'PERCEPTION'
  if (axis === 'O') return 'OBJECTIVE'
  return 'ACTION'
}

export function isEvidenceUsableFor(item: SeraEvidenceItem, use: SeraEvidenceUse): boolean {
  if (item.temporalRelation === 'POST_ESCAPE') return false
  if (item.assertionStatus !== 'AFFIRMED') return false
  if (item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION' || item.sourceSection === 'ADMINISTRATIVE') return false
  if (item.prohibitedFor.includes(use)) return false
  return item.supports.includes(use)
}

export function usableEvidenceForAxis(evidence: SeraEvidenceItem[], axis: CanonicalSeraAxis): SeraEvidenceItem[] {
  const use = axisToEvidenceUse(axis)
  return evidence.filter((item) => isEvidenceUsableFor(item, use))
}

export function evidenceStatements(evidence: SeraEvidenceItem[]): string[] {
  return evidence.map((item) => item.statement)
}

export function containsAnyEvidence(evidence: SeraEvidenceItem[], patterns: RegExp[]): SeraEvidenceItem[] {
  return evidence.filter((item) => patterns.some((pattern) => pattern.test(item.statement)))
}

export function hasUsableEvidence(evidence: SeraEvidenceItem[], use: SeraEvidenceUse, patterns: RegExp[]): boolean {
  return evidence.some((item) => isEvidenceUsableFor(item, use) && patterns.some((pattern) => pattern.test(item.statement)))
}
