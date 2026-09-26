export type EngineValidationGroup = 'official' | 'human' | 'generalization' | 'adversarial'

export type EngineValidationCase = {
  caseId: string
  title: string
  group: EngineValidationGroup
  sourceType: 'real_event' | 'human_applied_reference' | 'synthetic' | 'control' | 'neutral_trial'
  narrative: string
}

export type ExpectedActor = Array<string | null> | 'UNRESOLVED_BY_AUTHOR'
export type ExpectedCodes = Array<string | null> | 'UNRESOLVED_BY_AUTHOR'

export type EngineValidationExpectedCase = {
  caseId: string
  expectedEscapePointStatus: Array<'CANDIDATE' | 'PROGRESSIVE_ZONE' | 'NO_HUMAN_ESCAPE_POINT' | 'INSUFFICIENT_EVIDENCE'>
  expectedEscapePointBoundary: string | 'UNRESOLVED_BY_AUTHOR' | null
  expectedDirectActor: ExpectedActor
  allowedPCodes: ExpectedCodes
  forbiddenPCodes: string[]
  allowedOCodes: ExpectedCodes
  forbiddenOCodes: string[]
  allowedACodes: ExpectedCodes
  forbiddenACodes: string[]
  expectedPreconditionCategories: string[]
  forbiddenInferences: string[]
  requiredGuardrails: Array<
    | 'consequenceUsedAsCause'
    | 'postEscapeHuntingDetected'
    | 'oeUsed'
    | 'inventedQuestionDetected'
    | 'actorMigrationDetected'
    | 'preconditionUsedAsEscapePoint'
  >
  postEscapeEvidenceToExclude: string[]
  minimumUncertainties: number
}

export type EngineValidationFinding = {
  severity: 'pass' | 'partial' | 'fail' | 'error'
  detail: string
}

export type EngineValidationCaseResult = {
  caseId: string
  title: string
  group: EngineValidationGroup
  passed: boolean
  findings: EngineValidationFinding[]
  outputSummary: {
    escapePointStatus: string
    directActor: string | null
    pCode: string | null
    oCode: string | null
    aCode: string | null
    unansweredQuestions: number
    uncertainties: number
  }
}

export type DeterminismCaseResult = {
  caseId: string
  runs: number
  structuralDeterminism: number
  semanticEquivalence: number
  identical: boolean
}

export type ProductAlphaParityResult = {
  passed: boolean
  findings: string[]
}

export type EngineValidationRunReport = {
  generatedAt: string
  totalCases: number
  groups: Record<EngineValidationGroup, number>
  passCount: number
  failCount: number
  errorCount: number
  partialCount: number
  caseResults: EngineValidationCaseResult[]
  determinism: DeterminismCaseResult[]
  productAlphaParity: ProductAlphaParityResult
  finalDecision: 'SERA_VNEXT_ENGINE_V0_INTERNALLY_VALIDATED' | 'SERA_VNEXT_ENGINE_V0_VALIDATION_BLOCKED'
  productBetaGate: 'PRODUCT_BETA_FOUNDATION_ALLOWED' | 'PRODUCT_BETA_FOUNDATION_BLOCKED'
  blockingReasons: string[]
}
