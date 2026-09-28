import type { DataConfidence } from '@/lib/sera/data-confidence'
import type { HfaErcCategory } from '@/lib/sera/erc-conversion'
import type { RiskQualityTrendPoint } from '@/lib/sera/risk-quality-trend'
import type { SafetyIssueCandidate } from '@/lib/sera/safety-issue-candidates'
import type { ErcPresentationMode } from './erc-containment'
import type { SeraObservedRiskSignature } from '@/lib/sera-vnext/risk-management'

export type RiskProfileSourceType = 'legacy_event' | 'sera_vnext_analysis'

export type RiskProfileSourceStatus =
  | 'received'
  | 'processing'
  | 'completed'
  | 'error'
  | 'draft'
  | 'provisional'
  | 'archived'

export type RiskProfileSourceEvent = {
  id: string
  tenantId: string
  title: string
  occurredAt?: string | null
  createdAt: string
  status: RiskProfileSourceStatus
  source: RiskProfileSourceType
  sourceFlow?: string | null
  sourceReference?: string | null
  analysisId?: string | null
  engineVersion?: string | null
  engineRuntimeVersion?: string | null
  methodologyVersion?: string | null
  canonicalTreeVersion?: string | null
  reviewStatus?: string | null
  isProvisional?: boolean
  erc?: {
    code?: string | null
    severity?: string | null
    label?: string | null
    category?: HfaErcCategory | null
  }
  perceptionCode?: string | null
  objectiveCode?: string | null
  actionCode?: string | null
  preconditions?: string[]
  warnings?: string[]
  isExcludedFromRiskProfile: boolean
  exclusionId?: string | null
  exclusionReason?: string | null
  exclusionAt?: string | null
}

export type RiskProfileDistributionBucket = {
  code: string
  count: number
}

export type RiskProfilePreconditionBucket = {
  code: string
  count: number
  pct: number
  name: string
}

export type RiskProfileRecurringPattern = {
  pattern: string
  count: number
  evidenceEventIds: string[]
}

export type RiskProfileSummary = {
  score: { value: number; level: 'critical' | 'warning' | 'ok'; label: string }
  distribution: {
    perception: { count: number; pct: number; top_code: string | null; top_codes: RiskProfileDistributionBucket[] }
    objective: { count: number; pct: number; top_code: string | null; top_codes: RiskProfileDistributionBucket[] }
    action: { count: number; pct: number; top_code: string | null; top_codes: RiskProfileDistributionBucket[] }
    total: number
  }
  top_preconditions: RiskProfilePreconditionBucket[]
  top_combinations: Array<{ pair: string; count: number; pct: number }>
  sera_observed_profile: SeraObservedRiskSignature
  sera_risk_method: {
    tacticalModel: 'HENDY_2003_TACTICAL_PROTOTYPE'
    strategicModel: 'HENDY_2003_STRATEGIC_PROTOTYPE'
    validationStatus: 'NOT_VALIDATED_PROTOTYPE'
    note: string
  }
  actions: {
    total: number
    open_total: number
    open_overdue: number
    open_no_owner: number
    closed_last_30d: number
    resolution_rate: number
    effectiveness_pending: number
    effectiveness_overdue: number
    effectiveness_effective: number
    effectiveness_partial: number
    effectiveness_ineffective: number
  }
  trend: Array<{ month: string; count: number }>
  alerts: string[]
  total_analyses: number
  total_events_90d: number
  modal_erc_level: HfaErcCategory | null
  /** D3-b presentation mode for consolidated numeric ERC. */
  erc_presentation_mode: ErcPresentationMode
  d3_decision: 'D3_B'
  safety_issue_candidates: SafetyIssueCandidate[]
  quality_trend: RiskQualityTrendPoint[]
  data_confidence: DataConfidence

  total_events: number
  included_events: number
  excluded_events: number
  completed_analyses: number
  reviewed_analyses: number
  provisional_analyses: number
  pending_analyses: number
  error_analyses: number
  confidence: DataConfidence['level']
  erc_distribution: Array<{ code: string; label: string; count: number }>
  perception_distribution: RiskProfileDistributionBucket[]
  objective_distribution: RiskProfileDistributionBucket[]
  action_distribution: RiskProfileDistributionBucket[]
  precondition_distribution: Array<{ category: string; count: number }>
  recurring_patterns: RiskProfileRecurringPattern[]
  source_events_included: RiskProfileSourceEvent[]
  source_events_pending: RiskProfileSourceEvent[]
  source_events_excluded: RiskProfileSourceEvent[]
  recent_events: Array<{
    id: string
    title: string
    created_at: string
    perception_code: string | null
    objective_code: string | null
    action_code: string | null
  }>
  limitations: string[]
  generated_at: string
}
