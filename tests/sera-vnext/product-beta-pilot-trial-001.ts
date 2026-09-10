import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import assert from 'node:assert/strict'
import {
  archiveSeraVNextAnalysis,
  createSeraVNextAnalysis,
  createSeraVNextReview,
  exportSeraVNextAnalysis,
  reanalyzeSeraVNextAnalysis,
  restoreSeraVNextAnalysis,
  validateCreateAnalysisInput,
  type InsertAnalysisRow,
  type InsertAuditEventRow,
  type InsertReviewRow,
  type InsertRevisionRow,
  type SeraVNextAnalysisRecord,
  type SeraVNextAuditEventRecord,
  type SeraVNextListAnalysesQuery,
  type SeraVNextProductContext,
  type SeraVNextReviewRecord,
  type SeraVNextRevisionRecord,
} from '../../frontend/src/lib/sera-vnext-product'

class PilotRepo {
  analyses: SeraVNextAnalysisRecord[] = []
  revisions: SeraVNextRevisionRecord[] = []
  reviews: SeraVNextReviewRecord[] = []
  events: SeraVNextAuditEventRecord[] = []
  seq = 1
  id(prefix: string) { return `${prefix}-${this.seq++}` }
  now() { return new Date(1770000000000 + this.seq * 1000).toISOString() }
  async findAnalysisByClientRequest(tenantId: string, clientRequestId: string) { return this.analyses.find((item) => item.tenant_id === tenantId && item.client_request_id === clientRequestId) ?? null }
  async insertAnalysis(row: InsertAnalysisRow) { const created = { ...row, id: this.id('analysis'), created_at: this.now(), updated_at: this.now() } as SeraVNextAnalysisRecord; this.analyses.push(created); return created }
  async updateAnalysis(tenantId: string, id: string, patch: Partial<SeraVNextAnalysisRecord>) { const index = this.analyses.findIndex((item) => item.tenant_id === tenantId && item.id === id); assert.notEqual(index, -1); this.analyses[index] = { ...this.analyses[index], ...patch, updated_at: this.now() }; return this.analyses[index] }
  async getAnalysis(tenantId: string, id: string, options: { includeArchived?: boolean } = {}) { const found = this.analyses.find((item) => item.tenant_id === tenantId && item.id === id) ?? null; if (!found) return null; if (!options.includeArchived && found.deleted_at) return null; return found }
  async listAnalyses(tenantId: string, query: SeraVNextListAnalysesQuery) { const rows = this.analyses.filter((item) => item.tenant_id === tenantId && !item.deleted_at); return { items: rows.map(({ narrative: _n, engine_input: _i, engine_output: _o, ...rest }) => ({ ...rest, narrative: undefined, engine_input: undefined, engine_output: undefined })), page: query.page, pageSize: query.pageSize, total: rows.length } }
  async insertRevision(row: InsertRevisionRow) { const created = { ...row, id: this.id('revision'), created_at: this.now() } as SeraVNextRevisionRecord; this.revisions.push(created); return created }
  async listRevisions(tenantId: string, analysisId: string) { return this.revisions.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
  async insertReview(row: InsertReviewRow) { const created = { ...row, id: this.id('review'), created_at: this.now(), updated_at: this.now() } as SeraVNextReviewRecord; this.reviews.push(created); return created }
  async listReviews(tenantId: string, analysisId: string) { return this.reviews.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
  async insertAuditEvent(row: InsertAuditEventRow) { const created = { ...row, id: this.id('event'), created_at: this.now() } as SeraVNextAuditEventRecord; this.events.push(created); return created }
  async listAuditEvents(tenantId: string, analysisId: string) { return this.events.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
}

const context: SeraVNextProductContext = {
  userId: '00000000-0000-0000-0000-0000000000bb',
  tenantId: '00000000-0000-0000-0000-000000000002',
  role: 'admin',
  email: 'pilot@example.test',
  requestId: 'pilot-request',
}

const cases = [
  ['clean anchor', 'During approach the crew observed a stable profile, maintained monitoring, and completed a safe go-around before the operation left controlled limits.'],
  ['automation boundary', 'During climb the crew noticed unexpected automation mode behavior, selected a corrective mode late, and the aircraft deviated from the intended profile before recovery.'],
  ['procedural boundary', 'During maintenance handover the technician skipped a required cross-check, released the aircraft configuration, and the discrepancy was detected later.'],
  ['technical dominant', 'During cruise an automation fault and control-law anomaly dominated the event, with no clear human escape point before the system failure sequence.'],
  ['consequence as cause', 'During taxi the crew missed a stop instruction and continued beyond the hold point; only later a collision occurred and damage was reported.'],
  ['evidence insufficient', 'The report states that an operational deviation occurred, but it does not identify the actor, cue, objective, action, or chronology around the escape point.'],
  ['no failure', 'During approach the crew detected unstable criteria early, discontinued the approach, coordinated clearly, and landed safely after a later stabilized approach.'],
  ['PF PM ambiguity', 'During final approach one pilot called a warning and the other continued descent, but the narrative does not establish which pilot was flying or monitoring.'],
] as const


async function main() {
  // Safety guard: verify staging environment before flag manipulation tests
  assertSafeTestEnvironment({ requiresFixtureIds: false })

  const repo = new PilotRepo()
  const createdIds: string[] = []
  for (const [title, narrative] of cases) {
    const input = validateCreateAnalysisInput({ title, narrative, sourceType: 'INTERNAL_PILOT', clientRequestId: `pilot-${title.replace(/\s+/g, '-')}` })
    const result = await createSeraVNextAnalysis({ input, context: { ...context, requestId: `pilot-${title}` }, repository: repo })
    createdIds.push(result.analysis.id)
    assert.equal(result.analysis.engine_output.selectedCode, null)
    assert.equal(result.analysis.engine_output.finalConclusion, null)
    assert.equal(result.analysis.engine_output.downstreamAllowed, false)
  }

  await createSeraVNextReview({
    analysisId: createdIds[0],
    context: { ...context, requestId: 'pilot-review-accept' },
    repository: repo,
    input: { decision: 'ACCEPT_AS_WORKING_HYPOTHESIS', evidenceSufficiency: 'SUFFICIENT_FOR_WORKING_HYPOTHESIS', requiresMoreEvidence: false, reviewNotes: 'Pilot accepted as working hypothesis.' },
  })
  await createSeraVNextReview({
    analysisId: createdIds[5],
    context: { ...context, requestId: 'pilot-review-evidence' },
    repository: repo,
    input: { decision: 'REQUIRES_MORE_EVIDENCE', evidenceSufficiency: 'INSUFFICIENT', requiresMoreEvidence: true, reviewNotes: 'Narrative too compressed.' },
  })
  await createSeraVNextReview({
    analysisId: createdIds[7],
    context: { ...context, requestId: 'pilot-review-return' },
    repository: repo,
    input: { decision: 'RETURN_FOR_REANALYSIS', evidenceSufficiency: 'CONFLICTING', requiresMoreEvidence: true, reviewNotes: 'PF/PM ambiguity requires reanalysis after clarification.' },
  })
  await reanalyzeSeraVNextAnalysis({ analysisId: createdIds[7], context: { ...context, requestId: 'pilot-reanalyze' }, repository: repo, reason: 'PF PM clarification retry' })
  await archiveSeraVNextAnalysis({ analysisId: createdIds[1], context: { ...context, requestId: 'pilot-archive' }, repository: repo })
  await restoreSeraVNextAnalysis({ analysisId: createdIds[1], context: { ...context, requestId: 'pilot-restore' }, repository: repo })
  const exported = await exportSeraVNextAnalysis({ analysisId: createdIds[0], context: { ...context, requestId: 'pilot-export' }, repository: repo })

  assert.equal(repo.analyses.length, 8)
  assert.equal(repo.revisions.length, 9)
  assert.equal(repo.reviews.length, 3)
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.archived'))
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.restored'))
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.exported'))
  assert.deepEqual(exported.markers, ['INTERNAL', 'NON_FINAL', 'NOT_OPERATIONAL'])
  assert.equal(repo.analyses.some((analysis) => analysis.status === 'HUMAN_REVIEW_COMPLETED_NON_FINAL'), true)
  assert.equal(repo.analyses.some((analysis) => analysis.status === 'REQUIRES_MORE_EVIDENCE'), true)

  console.log('PILOT_OK', JSON.stringify({ cases: cases.length, analyses: repo.analyses.length, revisions: repo.revisions.length, reviews: repo.reviews.length, events: repo.events.length }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
