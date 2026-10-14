import assert from 'node:assert/strict'
import { createSeraVNextReview } from '../../frontend/src/lib/sera-vnext-product/persistence/create-review'
import { hasNoNewActorEvidence } from '../../frontend/src/lib/sera-vnext-product/clarification-factuality'
import type { SeraVNextProductRepository } from '../../frontend/src/lib/sera-vnext-product/persistence/repositories'
import type { SeraVNextAnalysisRecord, SeraVNextReviewRecord, SeraVNextAuditEventRecord, SeraVNextProductContext } from '../../frontend/src/lib/sera-vnext-product/types'

let seq = 0
const stamp = () => new Date(1781500000000 + (++seq) * 1000).toISOString()
const analysisId = 'e4000000-0000-0000-0000-000000000017'
const tenantId = 'e5000000-0000-0000-0000-000000000017'
const pilotId = 'e6000000-0000-0000-0000-000000000017'
const secondId = 'e7000000-0000-0000-0000-000000000017'
const engineOutput = { evidenceSufficiency: { status: 'NEEDS_CLARIFICATION' } }
let current = {
  id: analysisId, tenant_id: tenantId, deleted_at: null,
  status: 'REQUIRES_MORE_EVIDENCE', review_status: 'MORE_EVIDENCE_REQUIRED',
  current_revision: 1, engine_output: engineOutput,
} as unknown as SeraVNextAnalysisRecord
const reviews: SeraVNextReviewRecord[] = []
const audit: SeraVNextAuditEventRecord[] = []
const repo = {
  async getAnalysis(tenant: string, id: string) { return tenant === tenantId && id === analysisId ? current : null },
  async updateAnalysis(tenant: string, id: string, patch: Partial<SeraVNextAnalysisRecord>) {
    assert.equal(tenant, tenantId); assert.equal(id, analysisId)
    current = { ...current, ...patch }; return current
  },
  async listReviews(tenant: string, id: string) { assert.equal(tenant, tenantId); assert.equal(id, analysisId); return [...reviews] },
  async insertReview(row: Omit<SeraVNextReviewRecord, 'id' | 'created_at' | 'updated_at'>) {
    assert.equal(reviews.some((item) => item.review_version === row.review_version), false, 'Duplicate review version')
    const item = { ...row, id: `review-${reviews.length + 1}`, created_at: stamp(), updated_at: stamp() } as SeraVNextReviewRecord
    reviews.push(item); return item
  },
  async insertAuditEvent(row: Omit<SeraVNextAuditEventRecord, 'id' | 'created_at'>) {
    const item = { ...row, id: `audit-${audit.length + 1}`, created_at: stamp() } as SeraVNextAuditEventRecord
    audit.push(item); return item
  },
} as unknown as SeraVNextProductRepository
const context = (userId: string, requestId: string): SeraVNextProductContext => ({
  tenantId, userId, requestId, email: 'cal17@example.test', role: 'analyst',
})
const input = (reviewNotes: string) => ({
  decision: 'REQUIRES_MORE_EVIDENCE' as const, evidenceSufficiency: 'INSUFFICIENT' as const,
  reviewNotes, requiresMoreEvidence: true,
})

async function main() {
  const first = await createSeraVNextReview({ analysisId, input: input('Ator direto não individualizado no relato original.'), context: context(pilotId, 'cal17-first'), repository: repo })
  assert.equal(first.review.review_version, 1)
  assert.equal(first.status, 'REQUIRES_MORE_EVIDENCE')
  assert.equal(current.current_revision, 1)
  const second = await createSeraVNextReview({ analysisId, input: input('Segunda revisão: a ambiguidade de PF/PM permanece e exige evidência independente.'), context: context(secondId, 'cal17-second'), repository: repo })
  assert.equal(second.review.review_version, 2)
  assert.equal(reviews.length, 2)
  assert.notEqual(reviews[0].reviewer_id, reviews[1].reviewer_id)
  assert.equal(reviews[0].review_notes, 'Ator direto não individualizado no relato original.')
  assert.equal(reviews[1].metadata.basedOnEngineRevision, 1)
  assert.equal(current.status, 'REQUIRES_MORE_EVIDENCE')
  assert.equal(current.current_revision, 1)
  assert.equal(audit.filter((e) => e.event_type === 'analysis.review_submitted').length, 2)
  const replay = await createSeraVNextReview({ analysisId, input: input('Ator direto não individualizado no relato original.'), context: context(pilotId, 'cal17-first'), repository: repo })
  assert.equal(replay.review.id, first.review.id)
  assert.equal(reviews.length, 2)
  await assert.rejects(() => createSeraVNextReview({ analysisId,
    input: { decision: 'ACCEPT_AS_WORKING_HYPOTHESIS', evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS', requiresMoreEvidence: false },
    context: context(pilotId, 'cal17-invalid'), repository: repo }), /bloqueada/)
  assert.equal(reviews.length, 2)
  assert.equal(hasNoNewActorEvidence([{ id: 'ACTOR', stage: 'DIRECT_ACTOR' }], [{ questionId: 'ACTOR', response: 'O relato disponível não identifica os papéis de PF e PM. Também não individualiza qual tripulante deixou de acompanhar o display. Portanto, não há evidência suficiente para determinar o ator direto.' }]), true)
  assert.equal(hasNoNewActorEvidence([{ id: 'ACTOR', stage: 'DIRECT_ACTOR' }], [{ questionId: 'ACTOR', response: 'O PF era o comandante e ele confirmou que não acompanhou a indicação.' }]), false)
  current = { ...current, status: 'HUMAN_REVIEW_COMPLETED_NON_FINAL', review_status: 'WORKING_HYPOTHESIS_ACCEPTED', engine_output: { evidenceSufficiency: { status: 'SUFFICIENT' } } } as SeraVNextAnalysisRecord
  const challenge = await createSeraVNextReview({ analysisId, input: input('Revisão independente posterior contesta a suficiência anterior.'), context: context(secondId, 'cal17-challenge'), repository: repo })
  assert.equal(challenge.review.review_version, 3)
  assert.equal(challenge.status, 'REQUIRES_MORE_EVIDENCE')
  console.log('CAL17_HUMAN_REVIEW_PASS', { reviewers: 2, recordedDecisions: reviews.length, engineRevision: current.current_revision, appendOnlyHistory: true })
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
