import type { ApiUserContext } from '@/lib/server/api-auth'
import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import type { SeraReviewerOutput } from './reviewer-output'
import type {
  SeraVNextAnalysisStatus,
  SeraVNextAuditEventType,
  SeraVNextReviewDecision,
  SeraVNextReviewStatus,
} from './statuses'
import type { SeraVNextProductVersionSet } from './versioning'

export type SeraVNextProductContext = Pick<ApiUserContext, 'userId' | 'tenantId' | 'role' | 'email'> & {
  requestId: string
}

export type SeraVNextProductSourceType = 'REAL_EVENT' | 'TRAINING' | 'INTERNAL_PILOT' | 'OTHER'

export type SeraVNextCreateAnalysisInput = {
  title: string
  narrative: string
  sourceType: SeraVNextProductSourceType
  sourceReference?: string | null
  clientRequestId: string
  metadata?: Record<string, unknown>
}

export type SeraVNextListAnalysesQuery = {
  page: number
  pageSize: number
  status?: SeraVNextAnalysisStatus
  reviewStatus?: SeraVNextReviewStatus
  createdBy?: string
  search?: string
  from?: string
  to?: string
  sort: 'created_at_desc' | 'created_at_asc' | 'updated_at_desc'
}

export type SeraVNextReviewInput = {
  decision: SeraVNextReviewDecision
  reviewNotes?: string | null
  escapePointAssessment?: string | null
  perceptionAssessment?: string | null
  objectiveAssessment?: string | null
  actionAssessment?: string | null
  preconditionsAssessment?: string | null
  evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS' | 'INSUFFICIENT' | 'CONFLICTING' | 'UNRESOLVED'
  requiresMoreEvidence: boolean
  metadata?: Record<string, unknown>
}

export type SeraVNextAnalysisRecord = {
  id: string
  tenant_id: string
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  status: SeraVNextAnalysisStatus
  review_status: SeraVNextReviewStatus
  title: string
  narrative: string
  narrative_hash: string
  source_type: SeraVNextProductSourceType
  source_reference: string | null
  client_request_id: string
  request_id: string
  engine_version: string
  engine_runtime_version: string | null
  methodology_version: string
  baseline_id: string
  fixture_set_id: string
  input_schema_version: string
  output_schema_version: string
  code_commit: string
  source_flow: string | null
  canonical_tree_version: string | null
  engine_input: SeraVNextEngineInput
  engine_output: SeraVNextEngineOutput
  engine_output_hash: string
  escape_point_status: string | null
  escape_point_statement: string | null
  direct_actor: string | null
  perception_candidate_code: string | null
  objective_candidate_code: string | null
  action_candidate_code: string | null
  warnings: string[]
  uncertainties: string[]
  limitations: string[]
  current_revision: number
  metadata: Record<string, unknown>

  // Proveniência metodológica (auditoria HFA, 3ª etapa) — opcionais para não quebrar
  // fixtures/tipos existentes; NULL em linhas anteriores a esta coluna (não inventar valor).
  engine_id?: string | null
  taxonomy_version?: string | null
  risk_method_id?: string | null
  risk_method_version?: string | null
  generated_by_type?: string | null
  generated_by_id?: string | null
  validation_status?: string | null
  validated_at?: string | null
  validated_by?: string | null
  source_analysis_version?: string | null
}

export type SeraVNextRevisionRecord = {
  id: string
  analysis_id: string
  tenant_id: string
  revision_number: number
  created_by: string
  created_at: string
  request_id: string
  engine_version: string
  engine_runtime_version: string | null
  source_flow: string | null
  engine_input: SeraVNextEngineInput
  engine_output: SeraVNextEngineOutput
  engine_output_hash: string
  reason: string
  metadata: Record<string, unknown>
}

export type SeraVNextReviewRecord = {
  id: string
  analysis_id: string
  tenant_id: string
  reviewer_id: string
  created_at: string
  updated_at: string
  decision: SeraVNextReviewDecision
  review_notes: string | null
  escape_point_assessment: string | null
  perception_assessment: string | null
  objective_assessment: string | null
  action_assessment: string | null
  preconditions_assessment: string | null
  evidence_sufficiency: SeraVNextReviewInput['evidenceSufficiency']
  requires_more_evidence: boolean
  review_version: number
  request_id: string
  metadata: Record<string, unknown>
}

export type SeraVNextAuditEventRecord = {
  id: string
  analysis_id: string | null
  tenant_id: string
  actor_id: string | null
  event_type: SeraVNextAuditEventType
  created_at: string
  request_id: string
  from_status: SeraVNextAnalysisStatus | null
  to_status: SeraVNextAnalysisStatus | null
  payload: Record<string, unknown>
  metadata: Record<string, unknown>
}

export type SeraVNextAnalysisSummary = Omit<
  SeraVNextAnalysisRecord,
  'narrative' | 'engine_input' | 'engine_output'
> & {
  narrative: undefined
  engine_input: undefined
  engine_output: undefined
}

export type SeraVNextAnalysisDetail = {
  analysis: SeraVNextAnalysisRecord
  revisions: SeraVNextRevisionRecord[]
  reviews: SeraVNextReviewRecord[]
  events: SeraVNextAuditEventRecord[]
  versions: SeraVNextProductVersionSet
  locks: {
    humanReviewRequired: true
    selectedCode: null
    releasedCode: null
    finalConclusion: null
    classifiedOutput: false
    readyPromotion: false
    downstreamAllowed: false
  }
  reviewerOutput: SeraReviewerOutput
}

export type SeraVNextCreateAnalysisResult = {
  analysis: SeraVNextAnalysisRecord
  revision: SeraVNextRevisionRecord
  idempotent: boolean
}

export type SeraVNextListResult = {
  items: SeraVNextAnalysisSummary[]
  page: number
  pageSize: number
  total: number
}

export type SeraVNextExportPayload = {
  markers: ['INTERNAL', 'NON_FINAL', 'NOT_OPERATIONAL']
  analysis: Omit<SeraVNextAnalysisRecord, 'narrative' | 'engine_input' | 'engine_output'> & { narrative: '[REDACTED_IN_EXPORT_SUMMARY]' }
  candidateOutput: SeraVNextEngineOutput
  reviewerOutput: SeraReviewerOutput
  versions: SeraVNextProductVersionSet
  reviews: SeraVNextReviewRecord[]
  auditSummary: Array<Pick<SeraVNextAuditEventRecord, 'event_type' | 'created_at' | 'request_id' | 'from_status' | 'to_status'>>
}
