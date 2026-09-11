import type { PoaAxis, SeraVNextResult } from '@/lib/sera-vnext/types'

export type ShadowRunContext = {
  tenantId: string
  legacyAnalysisId: string | null
  legacyEventId: string | null
  legacyEngineVersion: string | null
  legacyCodes?: {
    perception: string | null
    objective: string | null
    action: string | null
  }
}

export type ShadowAxisDivergence = {
  axis: PoaAxis
  legacyCode: string | null
  vnextCandidateCode: string | null
  vnextStatus: string
  diverges: boolean
  note: string
}

export type ShadowRunSummary = {
  shadowRunId: string
  humanReviewRequired: boolean
  axisDivergences: ShadowAxisDivergence[]
  /** Present when comparison used SERA_SHADOW_DIVERGENCE_V1. */
  divergenceContract?: unknown
  skippedReason?: string
}

export type ShadowRunOutcome =
  | { status: 'SKIPPED_DISABLED' }
  | { status: 'SKIPPED_ALREADY_RUN'; shadowRunId: string }
  | { status: 'FAILED_SAFE'; error: string }
  | { status: 'RECORDED'; summary: ShadowRunSummary; engineOutput: SeraVNextResult }
