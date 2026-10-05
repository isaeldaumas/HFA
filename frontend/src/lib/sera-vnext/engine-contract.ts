import type { CanonicalSeraAxis } from './types'
import type { SeraEvidenceItem, SeraEvidenceRelationshipToFailure } from './evidence/types'

export type SeraConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

export type SeraVNextEngineMode = 'CANDIDATE_ONLY' | 'VALIDATION'

import type { SeraCanonicalPreconditionCategory, SeraPreconditionLevel } from './precondition-taxonomy'

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
export type SeraOccurrenceScope = 'CURRENT_EVENT' | 'PRE_EVENT_CAUSAL_HISTORY' | 'HISTORICAL_COMPARATOR' | 'GENERAL_CONTEXT' | 'UNKNOWN'

export type SeraFact = {
  id: string
  statement: string
  category: SeraFactCategory
  sourceSentenceIndex: number
  sourceSection?: SeraEvidenceSourceSection
  assertionStatus?: SeraAssertionStatus
  occurrenceScope?: SeraOccurrenceScope
}

export type SeraTimelineItem = {
  id: string
  order: number
  statement: string
  temporalCue: string | null
  sourceSentenceIndex: number
  sourceSection?: SeraEvidenceSourceSection
  assertionStatus?: SeraAssertionStatus
  occurrenceScope?: SeraOccurrenceScope
  semanticRoles?: SeraSemanticEvidenceRole[]
  semanticActor?: string | null
  semanticPreconditionCategory?: SeraCanonicalPreconditionCategory | null
  semanticConfidence?: SeraConfidence
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
    /** Substantive response to descriptive/root questions. START remains an internal branch token only. */
    responseText?: string | null
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
  canonicalCategory?: SeraCanonicalPreconditionCategory | null
  canonicalLevel?: SeraPreconditionLevel | null
  likelyForActiveFailureCodes?: string[]
  methodologyMatch?: 'MOST_LIKELY_AND_EVIDENCED' | 'EVIDENCED_OUTSIDE_MOST_LIKELY_SET' | 'HYPOTHESIS_ONLY'
}

export type SeraClarificationQuestion = {
  id: string
  stage: 'SAFE_OPERATION' | 'ESCAPE_POINT' | 'DIRECT_ACTOR' | 'PERCEPTION' | 'OBJECTIVE' | 'ACTION'
  blocking: true
  question: string
  whyNeeded: string
  linkedNodeId: string | null
  requestedEvidence: string[]
}

export type SeraEvidenceSufficiencyGate = {
  status: 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS' | 'NEEDS_CLARIFICATION' | 'NO_HUMAN_ESCAPE_POINT'
  minimumEvidenceSatisfied: boolean
  blockingReasons: string[]
  questions: SeraClarificationQuestion[]
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

export type SeraSupplementalEvidenceInput = {
  evidenceId: string
  statement: string
  linkedQuestionId: string
  stage: SeraClarificationQuestion['stage']
  temporalRelation: 'PRE_ESCAPE' | 'AT_ESCAPE'
}

/**
 * Semantic evidence extracted by AI from the source narrative. The AI is allowed to
 * identify meaning and relationships, but not to release SERA codes. Every annotation
 * must be anchored to a verbatim source sentence validated by the server before the
 * deterministic Hendy/SERA traversal consumes it.
 */
export type SeraSemanticEvidenceRole =
  | 'FIRST_DEPARTURE'
  | 'CRITICAL_UNSAFE_ACT'
  | 'DIRECT_ACTOR'
  | 'PERCEPTION_STATE'
  | 'OBJECTIVE_INTENT'
  | 'ACTION_STRATEGY'
  | 'PRECONDITION'
  | 'BARRIER'
  | 'OUTCOME'
  | 'CONTEXT'

export type SeraSemanticDecisionConcept =
  | 'adequateAssessment'
  | 'inadequateAssessment'
  | 'sensoryLimitation'
  | 'knowledgeLimitation'
  | 'perceptionCapabilityPresent'
  | 'attentionPressure'
  | 'timeManagementPressure'
  | 'informationAmbiguous'
  | 'informationAvailableCorrect'
  | 'informationUnavailable'
  | 'safeGoal'
  | 'knownRule'
  | 'explicitAwareness'
  | 'consciousDeviation'
  | 'routineDeviation'
  | 'exceptionalDeviation'
  | 'managedRisk'
  | 'unmanagedRisk'
  | 'efficiencyObjective'
  | 'safeAction'
  | 'implementedAction'
  | 'feedbackImplementationFailure'
  | 'slipLapse'
  | 'proceduralOmission'
  | 'implementationMismatch'
  | 'correctAction'
  | 'incorrectAction'
  | 'physicalActionLimitation'
  | 'actionKnowledgeLimitation'
  | 'actionCapabilityPresent'
  | 'selectionUnderPressureFailed'
  | 'feedbackUnderPressureFailed'
  | 'selectionSubtype'
  | 'feedbackSubtype'
  | 'timeManagementAction'

export type SeraSemanticPreconditionCausalStatus =
  | 'PRESENT_CONTEXT'
  | 'SOURCE_LINKED'

export type SeraSemanticEvidenceAnnotation = {
  id: string
  sourceQuote: string
  sourceSentenceIndex: number
  roles: SeraSemanticEvidenceRole[]
  concepts?: SeraSemanticDecisionConcept[]
  actor: string | null
  temporalRelation: 'PRE_ESCAPE' | 'AT_ESCAPE' | 'POST_ESCAPE' | 'UNKNOWN'
  assertionStatus: SeraAssertionStatus
  occurrenceScope: SeraOccurrenceScope
  preconditionCategory?: SeraCanonicalPreconditionCategory | null
  /**
   * Semantic interpretation of what the source itself says about a candidate precondition.
   * PRESENT_CONTEXT means the factor is factually present before/at the escape point but
   * the source does not explicitly link it to the active failure. SOURCE_LINKED is reserved
   * for an explicit source statement that the factor contributed to or enabled the failure.
   * This is evidence interpretation only; the deterministic SERA engine still decides how
   * the factor may be used methodologically.
   */
  preconditionCausalStatus?: SeraSemanticPreconditionCausalStatus | null
  /**
   * Required for SOURCE_LINKED in semantic schema V2. It must quote the selected
   * FIRST_DEPARTURE verbatim (or a verbatim span containing it) so the deterministic
   * engine can verify that an AI causal claim is anchored to the actual SERA failure,
   * rather than to another event, consequence, or contextual condition.
   */
  preconditionCausalTargetQuote?: string | null
  /**
   * Optional display-only normalization for P/O/A descriptive roots. It may improve
   * grammar in the human report, but is never evidence and is never consumed by the
   * deterministic SERA branch logic.
   */
  displayInterpretation?: string | null
  confidence: SeraConfidence
  rationale?: string | null
}

export type SeraSemanticSafeOperationModel = {
  expectedSafeState: string
  expectedSafeAction: string
  evidenceQuotes: string[]
  confidence: SeraConfidence
}

export type SeraSemanticEnrichmentMeta = {
  provider: string
  model: string
  requestedAt: string
  acceptedAnnotations: number
  rejectedAnnotations: number
  schemaVersion: 'SERA_SEMANTIC_AI_V1' | 'SERA_SEMANTIC_AI_V2'
}

export type SeraVNextEngineInput = {
  inputId: string
  narrative: string
  locale: 'pt-BR' | 'en'
  sourceType: SeraVNextEngineSourceType
  sourceReference?: string
  requestId: string
  mode: SeraVNextEngineMode
  supplementalEvidence?: SeraSupplementalEvidenceInput[]
  semanticEvidence?: SeraSemanticEvidenceAnnotation[]
  semanticSafeOperationModel?: SeraSemanticSafeOperationModel
  semanticEnrichmentMeta?: SeraSemanticEnrichmentMeta
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
    /** Hendy: first observable departure from safe operation on the occurrence trajectory. */
    earliestCandidate: string | null
    /** Hendy: most critical unsafe act/condition, when distinguishable from the first departure. */
    latestCandidate: string | null
    firstDepartureCandidate?: string | null
    criticalUnsafeActCandidate?: string | null
    /** Actor attached to the first safe→unsafe departure; this is also the SERA P/O/A actor when identified. */
    firstDepartureActor?: string | null
    /** Actor attached to a later critical unsafe act, retained descriptively when distinct from the escape point. */
    criticalUnsafeActActor?: string | null
    criticalCandidateAlternatives?: string[]
    irreversibilityBoundaryCandidate?: string | null
    anchorBasis?: 'FIRST_DEPARTURE_AND_CRITICAL_ACT' | 'FIRST_DEPARTURE_PRIMARY' | 'FIRST_DEPARTURE_ONLY' | 'UNRESOLVED'
    /** Evidence supporting the Hendy first-departure landmark used as the primary P/O/A anchor. */
    firstDepartureSupportingEvidence?: string[]
    /** Evidence supporting a later critical unsafe act/condition, preserved as a distinct downstream landmark. */
    criticalUnsafeActSupportingEvidence?: string[]
    /**
     * Unique landmark used for Hendy's P/O/A questions. Under the frozen HFA/SERA
     * methodology this must be the first observable safe→unsafe departure. A later
     * critical act may be retained descriptively but cannot replace this anchor.
     */
    poaAnchorCandidate?: string | null
    poaAnchorSupportingEvidence?: string[]
    poaAnchorBasis?: 'FIRST_DEPARTURE' | 'UNRESOLVED'
    directActor: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    excludedPostEscapeEvidence: string[]
    confidence: SeraConfidence
    humanFactorGate?: {
      status: 'PASSED' | 'BLOCKED'
      anchorType: 'UNSAFE_ACT' | 'OPERATOR_CONTROLLED_UNSAFE_CONDITION' | null
      rationale: string[]
    }
    episodeCandidates?: Array<{
      phase: 'DISPATCH' | 'MAINTENANCE' | 'INFLIGHT' | 'APPROACH' | 'GROUND' | 'GENERIC'
      anchorStatement: string
      supportingEvidence: string[]
      occurrenceScope?: SeraOccurrenceScope
      seraRole?: 'HUMAN_FACTOR_CANDIDATE' | 'TECHNICAL_ENVIRONMENT'
      humanFactorEligible?: boolean
      selected: boolean
    }>
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

  evidenceSufficiency: SeraEvidenceSufficiencyGate

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
    nonCausalEvidenceUsed: boolean
    escapePointReferenceContamination: boolean
    candidateEvidenceMinimumMissing: boolean
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
