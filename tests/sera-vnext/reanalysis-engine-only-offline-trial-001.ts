import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { reanalyzeSeraVNextAnalysis } from '../../frontend/src/lib/sera-vnext-product/persistence/reanalyze-analysis'
import { sha256Hex } from '../../frontend/src/lib/sera-vnext-product/hashing'
import { SERA_ENGINE_REFRESH_EPOCH } from '../../frontend/src/lib/sera-vnext-product/engine-refresh'
import type { SeraVNextEngineInput, SeraSemanticEvidenceAnnotation } from '../../frontend/src/lib/sera-vnext/engine-contract'
import type { SeraVNextAnalysisRecord, SeraVNextRevisionRecord, SeraVNextProductContext } from '../../frontend/src/lib/sera-vnext-product/types'
import type { SeraVNextProductRepository } from '../../frontend/src/lib/sera-vnext-product/persistence/repositories'

const narrative = 'O piloto retirou a mão do coletivo para pegar documentos. Um defeito na aeronave foi descoberto posteriormente.'
const annotation: SeraSemanticEvidenceAnnotation = {
  id: 'INITIAL-V1-SOURCE', sourceQuote: 'O piloto retirou a mão do coletivo para pegar documentos.',
  sourceSentenceIndex: 0, roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_STRATEGY'], concepts: [],
  actor: 'piloto', temporalRelation: 'AT_ESCAPE', assertionStatus: 'AFFIRMED',
  occurrenceScope: 'CURRENT_EVENT', preconditionCategory: null, preconditionCausalStatus: null,
  actionFailureMechanism: 'NONE_OR_UNKNOWN', actionMechanismEvidenceQuote: null,
  displayInterpretation: null, confidence: 'HIGH', rationale: 'Source interview',
}
const engineInput: SeraVNextEngineInput = {
  inputId: 'DAUMAS-EVENT3-V1', requestId: 'old-req', sourceType: 'real_event', mode: 'CANDIDATE_ONLY',
  narrative, locale: 'pt-BR', semanticEvidence: [annotation],
  semanticEnrichmentMeta: {
    provider: 'frozen', model: 'v1-snapshot', requestedAt: '2026-09-30',
    acceptedAnnotations: 1, rejectedAnnotations: 0, schemaVersion: 'SERA_SEMANTIC_AI_V1',
  },
  options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: true },
}
const baseline = runSeraVNextEngineV0(engineInput)
const context: SeraVNextProductContext = {
  tenantId: 'tenant-fixture', userId: 'analyst-fixture', role: 'admin',
  requestId: 'request-fixture', email: 'test@example.invalid',
}

async function main() {
  let stored = {
    id: 'same-analysis-id', tenant_id: context.tenantId, source_reference: 'same-event-id',
    source_flow: 'VNEXT_CANONICAL', client_request_id: 'canonical-daumas-3',
    status: 'REQUIRES_MORE_EVIDENCE', review_status: 'MORE_EVIDENCE_REQUIRED',
    narrative, narrative_hash: sha256Hex(narrative), current_revision: 1,
    engine_input: engineInput, engine_output: baseline, deleted_at: null,
    generated_by_type: 'llm_suggestion',
  } as unknown as SeraVNextAnalysisRecord
  const frozenOriginal = JSON.stringify(stored)
  const priorRevision = {
    id: 'previous-revision-id', analysis_id: stored.id, tenant_id: context.tenantId,
    revision_number: 1, engine_input: engineInput, engine_output: baseline,
    created_at: '2026-09-30',
  } as unknown as SeraVNextRevisionRecord
  const priorSnapshot = JSON.stringify(priorRevision)
  const appended: SeraVNextRevisionRecord[] = [priorRevision]
  const audits: Array<{ event_type?: string }> = []
  const repo = {
    async getAnalysis(_tenant: string, id: string) { assert.equal(id, stored.id); return stored },
    async insertAuditEvent(row: { event_type?: string }) { audits.push(row); return row },
    async insertRevision(row: SeraVNextRevisionRecord) {
      appended.push({ ...row, id: 'new-revision-id', created_at: '2026-10-14' })
      return appended[appended.length - 1]
    },
    async updateAnalysis(_tenant: string, _id: string, patch: Partial<SeraVNextAnalysisRecord>) {
      stored = { ...stored, ...patch }
      return stored
    },
  } as unknown as SeraVNextProductRepository
  let aiCalls = 0
  const semanticEnricher = async (): Promise<never> => {
    aiCalls += 1
    throw new Error('EXTERNAL_AI_MUST_NOT_BE_CALLED_DURING_ENGINE_ONLY_REFRESH')
  }
  const revised = await reanalyzeSeraVNextAnalysis({
    analysisId: stored.id, updatedNarrative: narrative, context, repository: repo,
    reprocessCurrentEngine: true, semanticEnricher,
  })
  assert.equal(aiCalls, 0)
  assert.equal(revised.analysis.id, 'same-analysis-id')
  assert.equal(revised.analysis.current_revision, 2)
  assert.equal(appended.length, 2)
  assert.equal(JSON.stringify(appended[0]), priorSnapshot, 'prior revision must be immutable')
  assert.equal(appended[1].revision_number, 2)
  assert.equal(appended[1].metadata.engineRefreshEpoch, SERA_ENGINE_REFRESH_EPOCH)
  assert.equal(appended[1].metadata.provenance.semanticLayer, 'REUSED_SOURCE_ANCHORED_SEMANTICS_DETERMINISTIC_TRAVERSAL')
  assert.equal(revised.analysis.narrative, narrative)
  assert.deepEqual(revised.analysis.engine_input.semanticEvidence, [annotation])
  assert.equal(revised.analysis.engine_input.semanticEnrichmentMeta?.schemaVersion, 'SERA_SEMANTIC_AI_V1')
  assert.equal(revised.analysis.engine_output.humanReviewRequired, true)
  assert.equal(revised.analysis.engine_output.selectedCode, null)
  assert.equal(revised.analysis.engine_output.releasedCode, null)
  assert.equal(audits.filter((item) => item.event_type === 'analysis.reanalyzed').length, 1)
  assert.notEqual(frozenOriginal, JSON.stringify(stored), 'current snapshot advances, immutable prior version is kept separately')
  assert.equal(revised.analysis.engine_output.escapePoint.firstDepartureCandidate, baseline.escapePoint.firstDepartureCandidate)
  await assert.rejects(() => reanalyzeSeraVNextAnalysis({
    analysisId: stored.id, updatedNarrative: narrative + ' Evidência nova.', context, repository: repo,
    reprocessCurrentEngine: true, semanticEnricher,
  }), /sem fatos novos/)
  assert.equal(appended.length, 2)
  assert.equal(aiCalls, 0)
  const route = readFileSync('frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts', 'utf8')
  assert.ok(route.includes('if (!requestedEngineRefresh) await applyUserAiSettingsToEnv(admin, user.userId)'), 'replay cannot depend on configured AI API key')
  console.log('ENGINE_ONLY_REPLAY_OFFLINE_PASS: no LLM dependency; same analysis ID; revision appended; human gate intact; evidence unchanged')
}
main().catch((err) => { console.error(err); process.exitCode = 1 })
