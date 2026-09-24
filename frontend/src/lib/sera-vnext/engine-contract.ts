import type { CanonicalSeraAxis } from './types'
import type { SeraEvidenceItem, SeraEvidenceRelationshipToFailure } from './evidence/types'

export type SeraConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

export type SeraVNextEngineMode = 'CANDIDATE_ONLY' | 'VALIDATION'

export type SeraVNextEngineSourceType =
  | 'real_event'
  | 'human_applied_reference'
  | 'synthetic'
  | 'control'
  | 'neutral_trial'

export type SeraFactCategory =
  | 'actor'
  | 'action'
  | 'condition'
  | 'environment'
  | 'timeline'
  | 'outcome'
  | 'decision'
  | 'control_input'
  | 'cue'
  | 'warning'
  | 'other'

export type SeraEvidenceSourceSection = 'FACTUAL' | 'REPORT_ANALYSIS' | 'RECOMMENDATION' | 'ADMINISTRATIVE' | 'UNKNOWN'
export type SeraAssertionStatus = 'AFFIRMED' | 'REJECTED_AS_FACTOR' | 'UNCERTAIN'

export type SeraFact = {
  id: string
  statement: string
  category: SeraFactCategory
  sourceSentenceIndex: number
  sourceSection?: SeraEvidenceSourceSection
  assertionStatus?: SeraAssertionStatus
}

export type SeraTimelineItem = {
  id: string
  order: number
  statement: string
  temporalCue: string | null
  sourceSentenceIndex: number
  sourceSection?: SeraEvidenceSourceSection
  assertionStatus?: SeraAssertionStatus
}

export type SeraCanonicalPath = {
  axis: CanonicalSeraAxis
  candidateCode: string | null
  status: 'COMPLETED_CANDIDATE_ONLY' | 'PARTIAL' | 'INSUFFICIENT_EVIDENCE'
  nodeIds: string[]
  questionPath: string[]
  answers: Array<{
    nodeId: string
    question: string
    exactQuestionTextENAnchor?: string
    answer: string
    nextNodeId: string | null
    terminalCode: string | null
    supportingEvidence?: string[]
    counterEvidence?: string[]
    prohibitedInferenceChecks?: string[]
    confidence?: SeraConfidence
    rationale?: string
  }>
}

export type SeraDecisionTraceItem = {
  step: string
  decision: string
  evidence: string[]
}

export type SeraEvidenceTraceItem = {
  evidenceId: string
  statement: string
  category: SeraFactCategory
  sourceSentenceIndex: number
  usedBy: string[]
}

export type SeraAxisCandidate = {
  axis: CanonicalSeraAxis
  proposedCode: string | null
  status: 'CANDIDATE' | 'NO_FAILURE' | 'INSUFFICIENT_EVIDENCE' | 'UNRESOLVED'
  actor: string | null
  statementAtEscapePoint: string | null
  supportingEvidence: string[]
  counterEvidence: string[]
  excludedPostEscapeEvidence: string[]
  alternativesConsidered: string[]
  canonicalPath: string[]
  confidence: SeraConfidence
}

export type SeraPreconditionCategory =
  | 'PHYSICAL_CAPABILITY'
  | 'SENSORY_LIMITATION'
  | 'KNOWLEDGE_TRAINING'
  | 'TIME_PRESSURE'
  | 'ATTENTION_WORKLOAD_CONTEXT'
  | 'COMMUNICATION_INFORMATION'
  | 'PROCEDURAL_MONITORING'
  | 'FEEDBACK_VERIFICATION'
  | 'INTENT_AWARENESS'
  | 'TEAM_COORDINATION'
  | 'ENVIRONMENTAL_CONTEXT'
  | 'TECHNICAL_CONTEXT'
  | 'ORGANIZATIONAL_CONTEXT'

export type SeraPreconditionCandidate = {
  id: string
  label: string
  description: string
  category: SeraPreconditionCategory
  evidence: string[]
  relationship: SeraEvidenceRelationshipToFailure
  sourceEvidence: SeraEvidenceItem[]
  sourceRuleIds: string[]
  linkedActor: string | null
  explicitlyNotEscapePoint: true
  basedOnCandidateCode: boolean
  nonFinal: true
  confidence: SeraConfidence
}

export type SeraVNextHumanReviewPackage = {
  inputSummary: string
  escapePointCandidate: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  axes: SeraVNextEngineOutput['axes']
  preconditions: SeraVNextEngineOutput['preconditions']
  uncertainties: string[]
  unansweredQuestions: string[]
  criticalWarnings: string[]
  reviewerDecisionsRequired: string[]
}

export type SeraVNextEngineInput = {
  inputId: string
  narrative: string
  locale: 'pt-BR' | 'en'
  sourceType: SeraVNextEngineSourceType
  sourceReference?: string
  requestId: string
  mode: SeraVNextEngineMode
  options?: {
    includeDebugTrace?: boolean
    requireHumanReview?: true
    allowLlm?: boolean
  }
}

export type SeraVNextEngineOutput = {
  engineVersion: string
  methodologyVersion: string
  baselineId: 'SERA_VNEXT_BASELINE_V0'
  fixtureSetId: 'SERA_VNEXT_FIXTURE_SET_V0'
  mode: SeraVNextEngineMode

  factualExtraction: {
    facts: SeraFact[]
    timeline: SeraTimelineItem[]
    evidence: SeraEvidenceItem[]
    explicitlyUnsupportedClaims: string[]
  }

  safeOperationModel: {
    expectedSafeState: string | null
    expectedSafeAction: string | null
    evidence: string[]
    confidence: SeraConfidence
  }

  escapePoint: {
    status: 'CANDIDATE' | 'PROGRESSIVE_ZONE' | 'NO_HUMAN_ESCAPE_POINT' | 'INSUFFICIENT_EVIDENCE'
    statement: string | null
    earliestCandidate: string | null
    latestCandidate: string | null
    directActor: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    excludedPostEscapeEvidence: string[]
    confidence: SeraConfidence
  }

  unsafeState: {
    statement: string | null
    evidence: string[]
  }

  unsafeActOrCondition: {
    type: 'UNSAFE_ACT' | 'UNSAFE_CONDITION' | 'UNRESOLVED'
    statement: string | null
    evidence: string[]
  }

  directActor: {
    actor: string | null
    status: 'IDENTIFIED' | 'AMBIGUOUS' | 'NOT_APPLICABLE'
    alternatives: string[]
    actorMigrationWarnings: string[]
  }

  axes: {
    perception: SeraAxisCandidate
    objective: SeraAxisCandidate
    action: SeraAxisCandidate
  }

  preconditions: SeraPreconditionCandidate[]

  canonicalTraversal: {
    status: 'COMPLETED_CANDIDATE_ONLY' | 'PARTIAL' | 'REAL_TREE_MISSING' | 'INSUFFICIENT_EVIDENCE'
    paths: SeraCanonicalPath[]
    unansweredQuestions: string[]
  }

  guardrails: {
    consequenceUsedAsCause: boolean
    postEscapeHuntingDetected: boolean
    postEscapeEvidenceUsed: boolean
    oeUsed: boolean
    inventedQuestionDetected: boolean
    actorMigrationDetected: boolean
    preconditionUsedAsEscapePoint: boolean
    codeFirstPathDetected: boolean
    awarenessMissingForViolation: boolean
  }

  guardrailEvidence: Record<string, string[]>

  validationOutcome?: {
    status:
      | 'CORRECT_CODE'
      | 'CORRECT_ABSTENTION'
      | 'INCORRECT_CODE'
      | 'INCORRECT_ABSTENTION'
      | 'INSUFFICIENT_EVIDENCE'
      | 'ENGINE_ERROR'
    rationale: string
  }

  uncertainties: string[]
  limitations: string[]
  decisionTrace: SeraDecisionTraceItem[]
  evidenceTrace: SeraEvidenceTraceItem[]
  humanReviewPackage: SeraVNextHumanReviewPackage

  humanReviewRequired: true

  selectedCode: null
  releasedCode: null
  finalConclusion: null
  classifiedOutput: false
  readyPromotion: false
  downstreamAllowed: false
}
