export type SeraVNextEngineVersion = 'sera-vnext-v0.2.0' | 'sera-vnext-v0.3.0'

export type SeraVNextSourceType = 'neutral_trial' | 'user_event' | 'report_extract'

export type SeraVNextLocale = 'pt-BR' | 'en'

export type CanonicalSeraAxis = 'P' | 'O' | 'A'

export type CanonicalSeraCodeAxis = CanonicalSeraAxis

export type CanonicalPerceptionLeafCode = 'P-A' | 'P-B' | 'P-C' | 'P-D' | 'P-E' | 'P-F' | 'P-G' | 'P-H'

export type CanonicalObjectiveLeafCode = 'O-A' | 'O-B' | 'O-C' | 'O-D'

export type CanonicalActionLeafCode =
  | 'A-A'
  | 'A-B'
  | 'A-C'
  | 'A-D'
  | 'A-E'
  | 'A-F'
  | 'A-G'
  | 'A-H'
  | 'A-I'
  | 'A-J'

export type CanonicalSeraLeafCode = CanonicalPerceptionLeafCode | CanonicalObjectiveLeafCode | CanonicalActionLeafCode

export type CanonicalSeraProposedCode = CanonicalSeraLeafCode

export type CanonicalSeraReleasedCode = CanonicalSeraLeafCode

export type CanonicalSeraCandidateLeafCode = CanonicalSeraLeafCode

export type CanonicalSeraNonExistentLeafCode = 'O-E'

export interface SeraCanonicalQuestionTreeNode {
  nodeInventoryId: string
  sourcePath: string
  sourceStatus: string
  nodeIdType: string
  nodeId: string
  axis: CanonicalSeraAxis
  nodeOrder: number
  exactQuestionTextPt: string
  exactQuestionTextEn: string
  branchCondition: string
  nextNodeHint: string
  transitionKind: 'NEXT_NODE' | 'LEAF'
  nextNodeId: string | null
  leafCode: CanonicalSeraLeafCode | null
  canonicalStatus: string
  usableForAxisDecision: boolean
  issueFlag: string
  notes: string
}

export type SeraVNextEscapePointScopeStatus =
  | 'DEFINED_NOT_ENFORCED'
  | 'APPROVED_NOT_ENFORCED'
  | 'PASSIVE_NOT_ENFORCED'

export type SeraVNextEscapePointAgentKind =
  | 'specific_actor'
  | 'crew_collective'
  | 'multi_actor'
  | 'system_or_condition_dominant'
  | 'maintenance_or_org'
  | 'design_mgmt'
  | 'unknown'

export type SeraVNextEscapePointActOrOmissionKind =
  | 'unsafe_act'
  | 'unsafe_omission'
  | 'mixed_act_and_omission'
  | 'unknown'

export type SeraVNextEscapePointTopology = 'discrete' | 'progressive' | 'diffuse'

export type SeraVNextEscapePointEnforcementMode = 'PASSIVE_CANDIDATE_ONLY'

export interface SeraVNextEscapePointUnsafeActOrOmission {
  kind: SeraVNextEscapePointActOrOmissionKind
  statement: string
  evidenceRefs?: string[]
}

export interface SeraVNextEscapePointOperationalMoment {
  description: string
  phaseRef?: string | null
  sequenceRef?: string | null
}

export interface SeraVNextEscapePointZoneBoundary {
  earliestControllableRef: string
  latestControllableRef: string
  rationale?: string
}

export interface SeraVNextEscapePointAnchor {
  agentId: string
  agentKind: SeraVNextEscapePointAgentKind
  unsafeActOrOmission: SeraVNextEscapePointUnsafeActOrOmission
  operationalMoment: SeraVNextEscapePointOperationalMoment
  pointTopology: SeraVNextEscapePointTopology
  zoneBoundary?: SeraVNextEscapePointZoneBoundary
  boundaryEvidenceRefs?: string[]
}

export interface ApprovedEscapePointScope {
  scopeId: string
  scopeStatement: string
  boundaryEvidenceRefs: string[]
  rationale: string
  status: SeraVNextEscapePointScopeStatus
  escapePointAnchor?: SeraVNextEscapePointAnchor
  enforcementMode?: SeraVNextEscapePointEnforcementMode
}

export interface SeraVNextCanonicalRuntimeContext {
  approvedEscapePointScope: ApprovedEscapePointScope
}

export interface SeraVNextInput {
  inputId: string
  narrative: string
  sourceType: SeraVNextSourceType
  locale?: SeraVNextLocale
  canonicalRuntimeContext?: SeraVNextCanonicalRuntimeContext
  humanDecisionInput?: HumanDecisionInputSet
  options?: {
    allowLlm?: boolean
    requireHumanReview?: boolean
    includeDebugTrace?: boolean
  }
}

export interface FactualSummary {
  actors: string[]
  aircraftOrSystem: string[]
  operationType: string | null
  phase: string | null
  location: string | null
  sequence: string[]
  environment: string[]
  availableCues: string[]
  availableBarriers: string[]
  missingData: string[]
}

export interface OperationalUnsafeState {
  operationalUnsafeState: string | null
  decisionAntecedents: string[]
  finalOutcome: string | null
}

export type UnsafeActConditionDominance =
  | 'unsafe_act_dominant'
  | 'unsafe_condition_dominant'
  | 'mixed'
  | 'insufficient_evidence'

export interface UnsafeElementAssessment {
  statement: string | null
  evidence: string[]
  confidence: 'low' | 'medium' | 'high'
  uncertainty: string[]
  humanReviewRequired: boolean
}

export interface UnsafeActConditionAnalysis {
  unsafeAct: UnsafeElementAssessment
  unsafeCondition: UnsafeElementAssessment
  dominance: UnsafeActConditionDominance
}

export type DirectActorKind =
  | 'specific_actor'
  | 'crew_collective'
  | 'unknown'
  | 'multi_actor'
  | 'system_or_condition_dominant'

export interface DirectActorAnalysis {
  actor: string | null
  actorKind: DirectActorKind
  confidence: 'low' | 'medium' | 'high'
  evidence: string[]
  uncertainty: string[]
  humanReviewRequired: boolean
}

export interface PoaAxisStatementMeta {
  confidence: 'low' | 'medium' | 'high'
  humanReviewRequired: boolean
}

export interface PoaStatements {
  perceptionStatement: string | null
  objectiveStatement: string | null
  actionStatement: string | null
  evidenceForEach: {
    perception: string[]
    objective: string[]
    action: string[]
  }
  uncertaintyForEach: {
    perception: string[]
    objective: string[]
    action: string[]
  }
  statementMeta: {
    perception: PoaAxisStatementMeta
    objective: PoaAxisStatementMeta
    action: PoaAxisStatementMeta
  }
}

export type PoaAxis = 'perception' | 'objective' | 'action'

export type PoaAxisStatus =
  | 'CLASSIFIED'
  | 'READY_FOR_HUMAN_CLASSIFICATION'
  | 'BLOCKED_BY_GUARDRAIL'
  | 'REVIEW_REQUIRED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NOT_IMPLEMENTED'

export type PoaEvidenceSufficiency = 'sufficient' | 'partial' | 'insufficient'

export type PoaEligibilityStatus =
  | 'NOT_ELIGIBLE'
  | 'ELIGIBLE_FOR_HUMAN_REVIEW'
  | 'BLOCKED_BY_GUARDRAIL'

export interface PoaEligibilityCheck {
  checkId: string
  passed: boolean
  details: string
  isAbsoluteBlocker?: boolean
}

export interface PoaClassificationEligibility {
  eligibilityStatus: PoaEligibilityStatus
  eligibleForHumanClassification: boolean
  eligibilityChecks: PoaEligibilityCheck[]
  unmetCriteria: string[]
  waiverRequired: boolean
  waiverAllowed: boolean
  waiverProhibitedReason: string | null
  absoluteBlockers: string[]
  whyBlocked: string | null
  whyNotEligible: string | null
  readyForHumanClassificationReason: string | null
}

export interface PoaAxisReviewTrace {
  reviewReason: string
  reviewReasonCode: string
  linkedUncertainties: string[]
  linkedEvidence: string[]
  blockingForClassification: string[]
  requiredHumanDecision: string
  transitionCriteria: string[]
}

export interface PoaAxisClassification {
  axis: PoaAxis
  selectedCode: string
  status: PoaAxisStatus
  confidence: 'low' | 'medium' | 'high'
  evidence: string[]
  alternativesConsidered: string[]
  rejectionReason: string | null
  reviewReason: string | null
  reviewReasonCode: string
  linkedUncertainties: string[]
  linkedEvidence: string[]
  blockingForClassification: string[]
  requiredHumanDecision: string
  transitionCriteria: string[]
  reviewTrace: PoaAxisReviewTrace
  humanReviewRequired: boolean
  evidenceSufficiency: PoaEvidenceSufficiency
  semanticGuardrails: string[]
  codeMeaning: string
  disallowedInterpretations: string[]
  classificationEligibility: PoaClassificationEligibility
}

export interface PoaClassification {
  perception: PoaAxisClassification
  objective: PoaAxisClassification
  action: PoaAxisClassification
}

export interface PreconditionsAnalysis {
  items: Array<{
    code: string
    statement: string
    evidence: string[]
    confidence: 'low' | 'medium' | 'high'
  }>
}

export interface Limitation {
  id: string
  statement: string
  impact: 'low' | 'medium' | 'high'
}

export interface Recommendation {
  id: string
  statement: string
  linkedFinding: string
  confidence: 'low' | 'medium' | 'high'
  scopeLimit: string | null
}

export type CausalAssuranceStatus =
  | 'SKELETON_NOT_VALIDATED'
  | 'PARTIAL_STEPS_1_3_NOT_CLASSIFIED'
  | 'PARTIAL_STEPS_1_5_NOT_CLASSIFIED'
  | 'PARTIAL_POA_REVIEW_REQUIRED'
  | 'PARTIAL_POA_REVIEW_TRACEABLE'
  | 'PARTIAL_ELIGIBILITY_CHECKED_NOT_CLASSIFIED'
  | 'PARTIAL_ELIGIBILITY_CALIBRATED_NOT_CLASSIFIED'
  | 'PARTIAL_READINESS_REFINED_NOT_CLASSIFIED'
  | 'PARTIAL_HUMAN_REVIEW_GATE_READY_NOT_CLASSIFIED'
  | 'PARTIAL_HUMAN_DECISION_INPUT_VALIDATED_NOT_CLASSIFIED'
  | 'PARTIAL_MANUAL_CLASSIFICATION_DRY_RUN_NOT_RELEASED'
  | 'PASSED'
  | 'FAILED'
  | 'REVIEW_REQUIRED'

export interface CausalAssurance {
  status: CausalAssuranceStatus
  blockingIssues: string[]
  warnings: string[]
  checks: Array<{
    checkId: string
    passed: boolean
    details: string
  }>
}

export type HumanReviewAxisDecisionStatus =
  | 'HUMAN_DECISION_REQUIRED'
  | 'READY_FOR_HUMAN_DECISION'
  | 'NOT_READY_FOR_HUMAN_DECISION'
  | 'BLOCKED_BY_GUARDRAIL'

export interface HumanReviewAxisOutputLock {
  autoClassificationForbidden: boolean
  prohibitedOutputs: string[]
  prohibitedStatuses: string[]
}

export interface HumanReviewAxisDecisionContract {
  axis: PoaAxis
  decisionStatus: HumanReviewAxisDecisionStatus
  eligibleForDecision: boolean
  requiredInputs: string[]
  requiredEvidenceReferences: string[]
  waiverDecisionRequired: boolean
  waiverDecisionAllowed: boolean
  waiverDecisionProhibitedReason: string | null
  allowedReviewerActions: string[]
  prohibitedReviewerActions: string[]
  decisionChecklist: string[]
  residualUncertainty: string[]
  traceLinks: string[]
  outputLock: HumanReviewAxisOutputLock
}

export type HumanReviewDecisionGateStatus =
  | 'HUMAN_DECISION_GATE_READY'
  | 'HUMAN_DECISION_GATE_PARTIAL'
  | 'HUMAN_DECISION_GATE_BLOCKED'

export interface HumanReviewDecisionGate {
  required: boolean
  status: HumanReviewDecisionGateStatus
  axisContracts: HumanReviewAxisDecisionContract[]
  globalProhibitedOutputs: string[]
  globalDecisionRules: string[]
}

export type HumanDecisionIntent =
  | 'PROPOSE_CODE'
  | 'DEFER_AXIS'
  | 'REQUEST_MORE_EVIDENCE'
  | 'REJECT_AXIS_CLASSIFICATION'

export interface HumanWaiverDecision {
  requested: boolean
  approved: boolean
  rationale: string | null
  acceptedResidualUncertainty: string[]
  prohibitedIfAbsoluteBlocker: boolean
}

export interface HumanAxisDecisionInput {
  axis: PoaAxis
  decisionIntent: HumanDecisionIntent
  proposedCode: string | null
  evidenceReferences: string[]
  reviewerRationale: string
  acceptedUncertainties: string[]
  rejectedUncertainties: string[]
  waiverDecision: HumanWaiverDecision
  guardrailAcknowledgements: string[]
  limitations: string[]
  confidenceByReviewer: 'low' | 'medium' | 'high'
  requestedDownstreamOutputs?: string[]
}

export interface HumanDecisionInputSet {
  inputId: string
  reviewerId?: string
  reviewTimestamp?: string
  axisDecisions: HumanAxisDecisionInput[]
}

export type HumanDecisionValidationStatus =
  | 'VALID_FOR_RELEASE_GATE'
  | 'INVALID_NOT_READY'
  | 'INVALID_MISSING_EVIDENCE_REFERENCES'
  | 'INVALID_MISSING_RATIONALE'
  | 'INVALID_WAIVER_CONFLICT'
  | 'INVALID_GUARDRAIL_CONFLICT'

export interface HumanDecisionValidationResult {
  axis: PoaAxis
  valid: boolean
  status: HumanDecisionValidationStatus
  blockingIssues: string[]
  warnings: string[]
  acceptedForNextGate: boolean
}

export interface HumanDecisionInputValidation {
  inputProvided: boolean
  inputId: string | null
  results: HumanDecisionValidationResult[]
  allValid: boolean
  acceptedAxesForNextGate: PoaAxis[]
  rejectedAxesForNextGate: PoaAxis[]
  blockingIssues: string[]
  warnings: string[]
}

export type ManualClassificationDryRunReleaseStatus =
  | 'MANUAL_INPUT_VALIDATED_NOT_RELEASED'
  | 'MANUAL_INPUT_REJECTED'

export interface ManualClassificationDryRunResult {
  inputId: string
  axisDecisionInputs: HumanAxisDecisionInput[]
  validationResults: HumanDecisionValidationResult[]
  acceptedForNextGate: boolean
  releaseStatus: ManualClassificationDryRunReleaseStatus
  releaseBlockedReason: string
  selectedCodesRemainUnresolved: boolean
  proposedCodes: Partial<Record<PoaAxis, string>>
  outputLocks: string[]
}

export interface HumanValidatedAxisClassification {
  axis: PoaAxis
  releasedCode: CanonicalSeraReleasedCode | null
  source: 'HUMAN_REVIEW'
  reviewerRationale: string
  evidenceReferences: string[]
  acceptedUncertainties: string[]
  waiverApplied: boolean
  guardrailAcknowledgements: string[]
  releaseStatus: 'RELEASED_BY_HUMAN_REVIEW' | 'RELEASE_BLOCKED'
  releaseBlockingIssues: string[]
  auditTrace: string[]
}

export interface CodeReleaseGateResult {
  inputId: string
  gateStatus: 'RELEASE_READY_FOR_CAUSAL_CORE' | 'PARTIAL_RELEASE' | 'RELEASE_BLOCKED'
  axisReleases: HumanValidatedAxisClassification[]
  globalBlockingIssues: string[]
  outputLocks: string[]
  downstreamStillLocked: boolean
  finalConclusionStillLocked: boolean
  causalCoreOnly: boolean
}

export interface ReleasedCodeSemanticCheck {
  checkId: string
  passed: boolean
  details: string
}

export interface ReleasedCodeAcknowledgementCheck {
  checkId: string
  passed: boolean
  details: string
}

export interface ReleasedCodeWaiverConsistency {
  waiverRequired: boolean
  waiverApplied: boolean
  consistent: boolean
  details: string
}

export interface ReleasedCodeSemanticConsistencyResult {
  axis: PoaAxis
  releasedCode: CanonicalSeraReleasedCode | null
  status: 'SEMANTICALLY_CONSISTENT' | 'SEMANTIC_REVIEW_REQUIRED' | 'SEMANTICALLY_BLOCKED'
  checks: ReleasedCodeSemanticCheck[]
  blockingIssues: string[]
  warnings: string[]
  requiredEvidence: string[]
  matchedEvidence: string[]
  missingEvidence: string[]
  acknowledgementChecks: ReleasedCodeAcknowledgementCheck[]
  waiverConsistency: ReleasedCodeWaiverConsistency
  semanticRuleVersion: string
}

export interface SemanticConsistencyGateResult {
  inputId: string
  gateStatus: 'SEMANTIC_GATE_READY' | 'SEMANTIC_GATE_PARTIAL' | 'SEMANTIC_GATE_BLOCKED'
  axisResults: ReleasedCodeSemanticConsistencyResult[]
  globalBlockingIssues: string[]
  outputLocks: string[]
  downstreamStillLocked: boolean
  finalConclusionStillLocked: boolean
  causalCoreOnly: boolean
}

export type PreconditionCandidateStatus = 'CANDIDATE_PRECONDITION' | 'REVIEW_REQUIRED' | 'BLOCKED'

export interface VNextPreconditionCandidate {
  id: string
  label: string
  category: string
  sourceAxis: PoaAxis
  sourceReleasedCode: string
  sourceEvidenceRefs: string[]
  sourceRationaleRefs: string[]
  sourceTraceabilityRefs?: string[]
  sourceHendyCategory?: SeraVNextHendyCategory
  sourceIsNoFailure?: boolean
  sourceTimePressureExcessive?: boolean | null
  evidenceCategoryHints?: SeraVNextEvidenceCategoryHint[]
  traceabilityVersion?: string | null
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'
  status: PreconditionCandidateStatus
  limitations: string[]
  derivedBy: 'SERA_VNEXT_PRECONDITION_RULE'
  taxonomyVersion: 'SERA_PT_CANONICAL_v1.0'
  authorDecisionVersion: 'SERA_PT_AUTHOR_DECISION_AA_CANONICALIZATION_v1.0'
  blockingIssues: string[]
}

export interface PreconditionsFromReleasedCodesResult {
  inputId: string
  gateStatus: 'PRECONDITION_CANDIDATES_READY' | 'PRECONDITION_CANDIDATES_PARTIAL' | 'PRECONDITION_CANDIDATES_BLOCKED'
  candidates: VNextPreconditionCandidate[]
  globalBlockingIssues: string[]
  outputLocks: string[]
  downstreamLocked: true
  finalConclusionLocked: true
  hfacsLocked: true
  riskLocked: true
  recommendationsLocked: true
  selectedCodesRemainUnresolved: boolean
  causalCoreOnly: true
}

export type SeraVNextHendyCategory = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | null

export interface SeraVNextDerivationStep {
  step: string
  answer: string
  rationale?: string
}

export type SeraVNextCodeTraceabilityStatus = 'TRACEABLE' | 'NON_EXISTENT_CODE' | 'BLOCKED'

export interface SeraVNextCodeTraceability {
  axis: PoaAxis
  code: string
  hendyCategory: SeraVNextHendyCategory
  isNoFailure: boolean
  timePressureExcessive: boolean | null
  evidenceCategoryHints?: SeraVNextEvidenceCategoryHint[]
  derivationPath: SeraVNextDerivationStep[]
  evidenceRefs: string[]
  rationaleRefs: string[]
  source: 'HUMAN_REVIEW'
  taxonomyVersion: 'SERA_PT_CANONICAL_v1.0'
  authorDecisionVersion: 'SERA_PT_AUTHOR_DECISION_AA_CANONICALIZATION_v1.0'
  traceabilityVersion: 'v0.2.0'
  status: SeraVNextCodeTraceabilityStatus
  warnings: string[]
  blockingIssues: string[]
}

export interface ReleasedCodeTraceabilityResult {
  inputId: string
  traces: SeraVNextCodeTraceability[]
  globalBlockingIssues: string[]
  outputLocks: string[]
  downstreamLocked: true
  finalConclusionLocked: true
  hfacsLocked: true
  riskLocked: true
  recommendationsLocked: true
  selectedCodesRemainUnresolved: boolean
  causalCoreOnly: true
}

export type SeraVNextEvidenceCategory =
  | 'PHYSICAL_CAPABILITY'
  | 'INTENT_AWARENESS'
  | 'TIME_PRESSURE'
  | 'COMMUNICATION_INFORMATION'
  | 'PROCEDURAL_MONITORING'
  | 'KNOWLEDGE_TRAINING'
  | 'SUPERVISION_COORDINATION'
  | 'OPERATIONAL_EFFICIENCY_PRESSURE'
  | 'SENSORY_LIMITATION'
  | 'PERCEPTUAL_AMBIGUITY'
  | 'FEEDBACK_VERIFICATION'
  | 'RULE_NORM_CONTEXT'
  | 'UNKNOWN_OR_UNCATEGORIZED'

export type SeraVNextEvidenceCategoryMode = 'PASSIVE_OPTIONAL_METADATA'

export interface SeraVNextEvidenceCategoryHint {
  category: SeraVNextEvidenceCategory
  source: 'manual' | 'inferred' | 'mapped'
  evidenceRef?: string
  note?: string
}

export type EvidenceCategoryCoverageStatus = 'PASSIVE_COVERAGE_RECORDED' | 'PASSIVE_COVERAGE_INCOMPLETE'

export interface EvidenceCategoryCoverageFinding {
  axis: PoaAxis | 'unknown'
  code: string
  requiredCategories: SeraVNextEvidenceCategory[]
  matchedCategories: SeraVNextEvidenceCategory[]
  missingCategories: SeraVNextEvidenceCategory[]
  severity: 'PASSIVE_OK' | 'PASSIVE_GAP'
  note: string
}

export interface EvidenceCategoryCoverageSummary {
  status: EvidenceCategoryCoverageStatus
  mode: SeraVNextEvidenceCategoryMode
  totalItemsAudited: number
  totalHintsObserved: number
  categoriesObservedCount: Partial<Record<SeraVNextEvidenceCategory, number>>
  findings: EvidenceCategoryCoverageFinding[]
  passiveDiagnostics: string[]
}

export type HumanReviewStatusCode = 'HUMAN_DECISION_REQUIRED' | 'HUMAN_DECISION_CONTRACT_READY'

export interface HumanReviewStatus {
  required: boolean
  status: HumanReviewStatusCode
  rationale: string
  checklist: string[]
  prohibitedOutputs: string[]
}

export interface SeraVNextTrace {
  stepOrder: string[]
  stepStatus: Record<string, 'stub' | 'done' | 'skipped'>
  notes: string[]
}

export interface SeraVNextResult {
  engineVersion: SeraVNextEngineVersion
  inputId: string
  factualSummary: FactualSummary
  unsafeState: OperationalUnsafeState
  unsafeActCondition: UnsafeActConditionAnalysis
  directActor: DirectActorAnalysis
  poaStatements: PoaStatements
  poaClassification: PoaClassification
  preconditions: PreconditionsAnalysis
  limitations: Limitation[]
  recommendations: Recommendation[]
  causalAssurance: CausalAssurance
  humanReviewRequired: boolean
  humanReview: HumanReviewStatus
  humanReviewDecisionGate: HumanReviewDecisionGate
  humanDecisionValidation: HumanDecisionInputValidation
  trace: SeraVNextTrace
}
