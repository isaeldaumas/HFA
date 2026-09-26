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
  if (!item.supports.includes(use)) return false

  // P/O/A evidence must remain anchored to the direct actor at the escape point.
  // Context actors (for example a commander who only detects/recovers a maintenance
  // condition later) cannot answer another actor's canonical branch.
  if (use === 'PERCEPTION' || use === 'OBJECTIVE' || use === 'ACTION') {
    if (item.actorRelation === 'CONTEXT_ACTOR') return false
    if (item.actorRelation === 'SYSTEM_ENVIRONMENT' && use !== 'PERCEPTION') return false

    // A clarification answer is evidence for the stage/question that requested it.
    // Do not let wording in a Perception answer, for example, silently classify
    // Objective or Action (or vice versa).
    if (item.collectionSource === 'CLARIFICATION_RESPONSE' && item.clarificationStage && item.clarificationStage !== use) return false
  }

  return true
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
