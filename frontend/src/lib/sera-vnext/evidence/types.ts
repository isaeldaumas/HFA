import type { SeraAssertionStatus, SeraConfidence, SeraEvidenceSourceSection, SeraFactCategory } from '../engine-contract'

export type SeraEvidenceTemporalRelation = 'PRE_ESCAPE' | 'AT_ESCAPE' | 'POST_ESCAPE' | 'UNKNOWN'

export type SeraEvidenceActorRelation = 'DIRECT_ACTOR' | 'CONTEXT_ACTOR' | 'SYSTEM_ENVIRONMENT' | 'UNKNOWN'

export type SeraEvidenceType =
  | 'OBSERVED_FACT'
  | 'REPORTED_CUE'
  | 'ACTION_OR_DECISION'
  | 'CONTEXT'
  | 'OUTCOME'
  | 'UNSUPPORTED_REPORT_ANALYSIS'

export type SeraEvidenceUse =
  | 'ESCAPE_POINT'
  | 'PERCEPTION'
  | 'OBJECTIVE'
  | 'ACTION'
  | 'PRECONDITION'
  | 'LIMITATION'

export type SeraEvidenceRelationshipToFailure =
  | 'ENABLING_PRECONDITION'
  | 'CONTEXTUAL_PRECONDITION'
  | 'DIRECT_ESCAPE_POINT'
  | 'POST_ESCAPE_CONSEQUENCE'
  | 'UNRELATED_OR_UNSUPPORTED'

export type SeraEvidenceItem = {
  evidenceId: string
  statement: string
  category: SeraFactCategory
  sourceSentenceIndex: number
  sourceSection: SeraEvidenceSourceSection
  assertionStatus: SeraAssertionStatus
  temporalRelation: SeraEvidenceTemporalRelation
  actorRelation: SeraEvidenceActorRelation
  actor: string | null
  evidenceType: SeraEvidenceType
  supports: SeraEvidenceUse[]
  contradicts: SeraEvidenceUse[]
  prohibitedFor: SeraEvidenceUse[]
  relationshipToFailure: SeraEvidenceRelationshipToFailure
  confidence: SeraConfidence
  collectionSource?: 'SOURCE_NARRATIVE' | 'CLARIFICATION_RESPONSE'
  linkedQuestionId?: string | null
  rationale: string[]
}
