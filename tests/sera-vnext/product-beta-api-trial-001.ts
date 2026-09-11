import assert from 'node:assert/strict'
import type { ApiUserContext } from '../../frontend/src/lib/server/api-auth'
import {
  handleArchiveSeraVNextAnalysisRequest,
  handleCreateSeraVNextAnalysisRequest,
  handleCreateSeraVNextReviewRequest,
  handleExportSeraVNextAnalysisRequest,
  handleGetSeraVNextAnalysisRequest,
  handleListSeraVNextAnalysesRequest,
  handleReanalyzeSeraVNextAnalysisRequest,
  handleRestoreSeraVNextAnalysisRequest,
} from '../../frontend/src/lib/sera-vnext-product/api-handlers'
import type {
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
  InsertAnalysisRow,
  InsertAuditEventRow,
  InsertReviewRow,
  InsertRevisionRow,
  SeraVNextAnalysisRecord,
  SeraVNextAuditEventRecord,
  SeraVNextListAnalysesQuery,
  SeraVNextProductContext,
  SeraVNextReviewRecord,
  SeraVNextRevisionRecord,
} from '../../frontend/src/lib/sera-vnext-product'

const adminUser: ApiUserContext = {
  userId: '00000000-0000-0000-0000-0000000000aa',
  email: 'admin@example.test',
  tenantId: '00000000-0000-0000-0000-000000000001',
  role: 'admin',
  accessToken: 'token-must-not-leak',
}

class MemoryRepo {
  analyses: SeraVNextAnalysisRecord[] = []
  revisions: SeraVNextRevisionRecord[] = []
  reviews: SeraVNextReviewRecord[] = []
  events: SeraVNextAuditEventRecord[] = []
  private seq = 1

  private id(prefix: string) { return `${prefix}-${this.seq++}` }
  private now() { return new Date(1760000000000 + this.seq * 1000).toISOString() }

  async findAnalysisByClientRequest(tenantId: string, clientRequestId: string) {
    return this.analyses.find((item) => item.tenant_id === tenantId && item.client_request_id === clientRequestId) ?? null
  }
  async insertAnalysis(row: InsertAnalysisRow) {
    const created = { ...row, id: this.id('analysis'), created_at: this.now(), updated_at: this.now() } as SeraVNextAnalysisRecord
    this.analyses.push(created)
    return created
  }
  async updateAnalysis(tenantId: string, id: string, patch: Partial<SeraVNextAnalysisRecord>) {
    const index = this.analyses.findIndex((item) => item.tenant_id === tenantId && item.id === id)
    assert.notEqual(index, -1, 'analysis to update must exist')
    this.analyses[index] = { ...this.analyses[index], ...patch, updated_at: this.now() }
    return this.analyses[index]
  }
  async getAnalysis(tenantId: string, id: string, options: { includeArchived?: boolean } = {}) {
    const found = this.analyses.find((item) => item.tenant_id === tenantId && item.id === id) ?? null
    if (!found) return null
    if (!options.includeArchived && found.deleted_at) return null
    return found
  }
  async listAnalyses(tenantId: string, query: SeraVNextListAnalysesQuery) {
    let rows = this.analyses.filter((item) => item.tenant_id === tenantId && !item.deleted_at)
    if (query.search) rows = rows.filter((item) => item.title.includes(query.search ?? ''))
    return {
      items: rows.map(({ narrative: _n, engine_input: _i, engine_output: _o, ...rest }) => ({ ...rest, narrative: undefined, engine_input: undefined, engine_output: undefined })),
      page: query.page,
      pageSize: query.pageSize,
      total: rows.length,
    }
  }
  async insertRevision(row: InsertRevisionRow) {
    const created = { ...row, id: this.id('revision'), created_at: this.now() } as SeraVNextRevisionRecord
    this.revisions.push(created)
    return created
  }
  async listRevisions(tenantId: string, analysisId: string) {
    return this.revisions.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId)
  }
  async insertReview(row: InsertReviewRow) {
    const created = { ...row, id: this.id('review'), created_at: this.now(), updated_at: this.now() } as SeraVNextReviewRecord
    this.reviews.push(created)
    return created
  }
  async listReviews(tenantId: string, analysisId: string) {
    return this.reviews.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId)
  }
  async insertAuditEvent(row: InsertAuditEventRow) {
    const created = { ...row, id: this.id('event'), created_at: this.now() } as SeraVNextAuditEventRecord
    this.events.push(created)
    return created
  }
  async listAuditEvents(tenantId: string, analysisId: string) {
    return this.events.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId)
  }
}

function deps(repo: MemoryRepo) {
  const context: SeraVNextProductContext = {
    userId: adminUser.userId,
    email: adminUser.email,
    tenantId: adminUser.tenantId,
    role: adminUser.role,
    requestId: 'api-trial-request',
  }
  return {
    repository: repo,
    isEnabled: () => true,
    requireAdminUser: async () => adminUser,
    buildContext: async () => context,
    requestId: () => 'api-trial-request',
    now: () => 1000,
    logEvent: () => undefined,
  }
}

function request(url: string, method = 'GET', body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function json(response: Response) {
  return await response.json() as Record<string, unknown>
}

async function ensureResponse(value: Promise<Response | undefined>): Promise<Response> {
  const response = await value
  assert.ok(response, 'handler must return a response')
  return response
}

const narrative = 'During approach the crew noticed an unstable condition, continued below the safe profile, and the operation left the safe envelope before corrective action was completed.'

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const repo = new MemoryRepo()
  let res = await ensureResponse(handleCreateSeraVNextAnalysisRequest(request('http://localhost/api/admin/sera-vnext/analyses', 'POST', { title: 'Disabled', narrative, clientRequestId: 'disabled' }), {
    ...deps(repo),
    isEnabled: () => false,
  }))
  assert.equal(res.status, 404)

  res = await ensureResponse(handleCreateSeraVNextAnalysisRequest(request('http://localhost/api/admin/sera-vnext/analyses', 'POST', { title: 'Unauthorized', narrative, clientRequestId: 'unauth' }), {
    ...deps(repo),
    requireAdminUser: async () => { throw new Response(JSON.stringify({ detail: 'Não autorizado' }), { status: 401 }) },
  }))
  assert.equal(res.status, 401)

  res = await ensureResponse(handleCreateSeraVNextAnalysisRequest(request('http://localhost/api/admin/sera-vnext/analyses', 'POST', {
    title: 'API Trial', narrative, sourceType: 'INTERNAL_PILOT', clientRequestId: 'same-id', metadata: { pilot: true },
  }), deps(repo)))
  assert.equal(res.status, 201)
  const created = await json(res)
  const analysis = created.analysis as SeraVNextAnalysisRecord
  assert.equal(analysis.engine_output.selectedCode, null)
  assert.equal(analysis.engine_output.downstreamAllowed, false)

  res = await ensureResponse(handleCreateSeraVNextAnalysisRequest(request('http://localhost/api/admin/sera-vnext/analyses', 'POST', {
    title: 'API Trial', narrative, sourceType: 'INTERNAL_PILOT', clientRequestId: 'same-id', metadata: { retry: true },
  }), deps(repo)))
  assert.equal(res.status, 200)
  assert.equal((await json(res)).idempotent, true)

  res = await ensureResponse(handleCreateSeraVNextAnalysisRequest(request('http://localhost/api/admin/sera-vnext/analyses', 'POST', {
    title: 'Divergent', narrative, sourceType: 'INTERNAL_PILOT', clientRequestId: 'same-id',
  }), deps(repo)))
  assert.equal(res.status, 409)

  res = await ensureResponse(handleListSeraVNextAnalysesRequest(request('http://localhost/api/admin/sera-vnext/analyses?page=1&pageSize=10'), deps(repo)))
  assert.equal(res.status, 200)
  assert.equal(((await json(res)).items as unknown[]).length, 1)

  res = await ensureResponse(handleGetSeraVNextAnalysisRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}`), analysis.id, deps(repo)))
  assert.equal(res.status, 200)
  assert.equal(((await json(res)).analysis as SeraVNextAnalysisRecord).id, analysis.id)

  res = await ensureResponse(handleCreateSeraVNextReviewRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}/reviews`, 'POST', {
    decision: 'RETURN_FOR_REANALYSIS', evidenceSufficiency: 'INSUFFICIENT', reviewNotes: 'Needs source clarification.', requiresMoreEvidence: true,
  }), analysis.id, deps(repo)))
  assert.equal(res.status, 201)
  assert.equal(repo.analyses[0].status, 'RETURNED_FOR_REANALYSIS')

  res = await ensureResponse(handleReanalyzeSeraVNextAnalysisRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}/reanalyze`, 'POST', { reason: 'pilot retry' }), analysis.id, deps(repo)))
  assert.equal(res.status, 200)
  assert.equal(repo.analyses[0].current_revision, 2)

  res = await ensureResponse(handleArchiveSeraVNextAnalysisRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}/archive`, 'POST', {}), analysis.id, deps(repo)))
  assert.equal(res.status, 200)
  assert.equal(repo.analyses[0].status, 'ARCHIVED')

  res = await ensureResponse(handleRestoreSeraVNextAnalysisRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}/restore`, 'POST', {}), analysis.id, deps(repo)))
  assert.equal(res.status, 200)
  assert.equal(repo.analyses[0].status, 'CANDIDATE_ANALYSIS_CREATED')

  res = await ensureResponse(handleExportSeraVNextAnalysisRequest(request(`http://localhost/api/admin/sera-vnext/analyses/${analysis.id}/export`), analysis.id, deps(repo)))
  assert.equal(res.status, 200)
  const exported = await json(res)
  assert.deepEqual(exported.markers, ['INTERNAL', 'NON_FINAL', 'NOT_OPERATIONAL'])
  const exportedAnalysis = exported.analysis as Record<string, unknown>
  assert.equal(exportedAnalysis.narrative, '[REDACTED_IN_EXPORT_SUMMARY]')
  assert.equal(Object.prototype.hasOwnProperty.call(exportedAnalysis, 'engine_input'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(exportedAnalysis, 'engine_output'), false)
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.created'))
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.review_submitted' || event.event_type === 'analysis.returned'))
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.exported'))

  console.log('API_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
