import assert from 'node:assert/strict'
import { createSeraVNextReview } from '../../frontend/src/lib/sera-vnext-product/persistence/create-review'
import type { SeraVNextAnalysisRecord, SeraVNextAuditEventRecord, SeraVNextReviewRecord } from '../../frontend/src/lib/sera-vnext-product/types'
import type { SeraVNextProductRepository } from '../../frontend/src/lib/sera-vnext-product/persistence/repositories'

// Test-only injected incorrect candidate; never writes a fabricated candidate
// into production or changes the real CAL-21 A-B judgement.
const tenantId = 'cal21-controlled-tenant'
const analysisId = 'cal21-controlled-analysis'
const wrongCandidate = 'P-G'
const originalRevision = 1
let analysis = {
  id: analysisId, tenant_id: tenantId, current_revision: originalRevision,
  status: 'REQUIRES_MORE_EVIDENCE', review_status: 'MORE_EVIDENCE_REQUIRED',
  deleted_at: null, engine_output: {
    axes: { perception: { proposedCode: wrongCandidate }, objective: { proposedCode: null }, action: { proposedCode: null } },
    evidenceSufficiency: { status: 'NEEDS_CLARIFICATION' },
    selectedCode: null, releasedCode: null, finalConclusion: null, readyPromotion: false,
  },
} as unknown as SeraVNextAnalysisRecord
const reviews: SeraVNextReviewRecord[] = []
const audits: SeraVNextAuditEventRecord[] = []
const repo = {
  async getAnalysis(tenant: string, id: string) { return tenant === tenantId && id === analysisId ? analysis : null },
  async updateAnalysis(tenant: string, id: string, patch: Partial<SeraVNextAnalysisRecord>) {
    assert.equal(tenant, tenantId); assert.equal(id, analysisId)
    analysis = { ...analysis, ...patch }; return analysis
  },
  async listReviews(tenant: string, id: string) { assert.equal(tenant, tenantId); assert.equal(id, analysisId); return [...reviews] },
  async insertReview(row: Omit<SeraVNextReviewRecord, 'id' | 'created_at' | 'updated_at'>) {
    const item = { ...row, id: `human-review-${reviews.length+1}`, created_at: new Date().toISOString() } as SeraVNextReviewRecord
    reviews.push(item); return item
  },
  async insertAuditEvent(row: Omit<SeraVNextAuditEventRecord, 'id' | 'created_at'>) {
    const item = { ...row, id: `human-audit-${audits.length+1}`, created_at: new Date().toISOString() } as SeraVNextAuditEventRecord
    audits.push(item); return item
  },
} as unknown as SeraVNextProductRepository

async function main() {
  const notes = 'Discordo do candidato automático P-G: o relato demonstra uma etapa procedural conhecida omitida após a interrupção da checklist. Solicito reanálise do mecanismo A-B; nenhuma evidência comprova falha de atenção perceptiva.'
  const result = await createSeraVNextReview({
    analysisId,
    context: { tenantId, userId:'independent-human-reviewer', email:'cal21@example.invalid', role:'analyst', requestId:'cal21-controlled-dissent' },
    input: {
      decision: 'RETURN_FOR_REANALYSIS', evidenceSufficiency: 'INSUFFICIENT',
      requiresMoreEvidence: true, reviewNotes: notes,
      metadata: { source:'controlled_cal21_test', disputedAxis: 'P', disputedCode:wrongCandidate,
        suggestedReviewCode:'A-B', originalCandidatePreserved:true, finalClassificationNotAuthorized:true },
    },
    repository: repo,
  })
  assert.equal(result.review.review_version, 1)
  assert.equal(result.review.reviewer_id, 'independent-human-reviewer')
  assert.equal(result.review.decision, 'RETURN_FOR_REANALYSIS')
  assert.equal(result.review.review_notes, notes)
  assert.equal(result.review.metadata.disputedCode, wrongCandidate)
  assert.equal(result.review.metadata.basedOnEngineRevision, originalRevision)
  assert.equal(analysis.status, 'RETURNED_FOR_REANALYSIS')
  assert.equal(analysis.review_status, 'REANALYSIS_REQUIRED')
  assert.equal(analysis.engine_output.axes.perception.proposedCode, wrongCandidate, 'human disagreement must not silently overwrite the engine candidate')
  assert.equal(analysis.engine_output.finalConclusion, null)
  assert.equal(analysis.current_revision, originalRevision, 'human review must not impersonate an engine revision')
  assert.equal(audits.some((event) => event.event_type === 'analysis.returned'), true)
  const duplicate = await createSeraVNextReview({ analysisId,
    context: {tenantId,userId:'independent-human-reviewer',email:'cal21@example.invalid',role:'analyst',requestId:'cal21-controlled-dissent'},
    input:{decision:'RETURN_FOR_REANALYSIS',evidenceSufficiency:'INSUFFICIENT',requiresMoreEvidence:true,reviewNotes:notes}, repository:repo })
  assert.equal(duplicate.review.id, result.review.id)
  assert.equal(reviews.length, 1)
  console.log('CAL21_CONTROLLED_DISAGREEMENT_PASS: human reason preserved, candidate unchanged, no false finality, audit append-only, reanalysis requested')
}
main().catch((error) => {console.error(error);process.exitCode=1})
