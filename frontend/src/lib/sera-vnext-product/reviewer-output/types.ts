export type SeraReviewerRecommendedNextStep =
  | 'ACCEPT_AS_WORKING_HYPOTHESIS'
  | 'REJECT_WORKING_HYPOTHESIS'
  | 'REQUIRES_MORE_EVIDENCE'
  | 'RETURN_FOR_REANALYSIS'

export type SeraAxisLabel = 'P' | 'O' | 'A'

export type SeraReviewerAxisCard = {
  axis: SeraAxisLabel
  plainLanguageQuestion: string
  candidateStatus: string
  candidateCode: string | null
  candidateMeaning: string | null
  statementAtEscapePoint: string | null
  whyCandidateWasSuggested: string[]
  whyItMayBeWrong: string[]
  alternativesConsidered: string[]
  evidenceUsed: string[]
  evidenceExcluded: string[]
  confidence: string
  reviewerMustDecide: string[]
}

export type SeraReviewerPreconditionCard = {
  category: string
  canonicalCategory: string | null
  plainLanguageLabel: string
  description: string
  evidence: string[]
  relationship: string
  explicitlyNotEscapePoint: true
  reviewerQuestion: string
  confidence: string
}

export type SeraReviewerOutput = {
  summary: {
    headline: string
    nonFinalNotice: string
    overallUsefulnessWarning?: string
  }

  escapePointReview: {
    candidateStatement: string | null
    reviewerQuestion: string
    whyThisMatters: string
    supportingEvidence: string[]
    counterEvidence: string[]
    boundaryWarnings: string[]
    confidence: string
    reviewerOptions: string[]
  }

  axisReviews: {
    perception: SeraReviewerAxisCard
    objective: SeraReviewerAxisCard
    action: SeraReviewerAxisCard
  }

  preconditionReview: {
    cards: SeraReviewerPreconditionCard[]
    absentOrInsufficient: string[]
    reviewerQuestions: string[]
  }

  uncertaintyReview: {
    uncertainties: string[]
    unansweredQuestions: string[]
    evidenceNeeded: string[]
  }

  humanDecisionGuide: {
    recommendedNextStep: SeraReviewerRecommendedNextStep
    rationale: string
    decisionChecklist: string[]
  }
}
