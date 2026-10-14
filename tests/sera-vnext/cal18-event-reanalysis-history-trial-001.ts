import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildBlockingDiagnostic } from '../../frontend/src/lib/sera-vnext/presentation'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { createCanonicalEventAnalysis, mergeCanonicalReanalysisNarrative } from '../../frontend/src/lib/sera-vnext-product/canonical-event-analysis'
import { canTransitionAnalysisStatus } from '../../frontend/src/lib/sera-vnext-product/transitions'
import { reanalyzeSeraVNextAnalysis } from '../../frontend/src/lib/sera-vnext-product/persistence/reanalyze-analysis'
import { sha256Hex } from '../../frontend/src/lib/sera-vnext-product/hashing'
import type { SeraVNextProductRepository } from '../../frontend/src/lib/sera-vnext-product/persistence/repositories'
import type { SeraVNextAnalysisRecord, SeraVNextRevisionRecord } from '../../frontend/src/lib/sera-vnext-product/types'
import type { SeraVNextProductContext } from '../../frontend/src/lib/sera-vnext-product/types'

const firstNarrative = 'Durante uma aproximação, houve um desvio de trajetória corrigido antes do pouso. O relatório inicial não informa o que a tripulação percebeu nem a origem do desvio. Não há depoimentos na primeira submissão.'
const newEvidence = 'Nova evidência obtida durante a investigação: o copiloto havia transmitido ao comandante uma altitude diferente da autorizada; o comandante repetiu o valor incorreto e iniciou a descida com base nessa informação. A gravação confirma a transmissão incorreta.'
const merged = mergeCanonicalReanalysisNarrative({ baseNarrative: firstNarrative, additionalInformation: newEvidence })
assert.ok(merged.startsWith(firstNarrative))
assert.ok(merged.includes(newEvidence))
assert.equal(mergeCanonicalReanalysisNarrative({ baseNarrative: merged, additionalInformation: newEvidence }), merged)
const initialEngine = runSeraVNextEngineV0({
  inputId: 'CAL18-INITIAL', narrative: firstNarrative, locale: 'pt-BR', sourceType: 'real_event',
  requestId: 'CAL18-INITIAL', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true },
})
const initialDiagnostic = buildBlockingDiagnostic({ narrative: firstNarrative, output: initialEngine, pt: true })
assert.ok(initialDiagnostic, 'incomplete first narrative needs a diagnostic')
assert.ok(initialDiagnostic.evidence.some((item) => item.includes('não informa') || item.includes('depoimentos')))
assert.ok(!initialDiagnostic.evidence.some((item) => /no explicit consequence|multiple departure|first departure from safe|Hendy|Independent semantic|human safe/i.test(item)))
const route = readFileSync('frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts', 'utf8')
assert.ok(route.includes('existingAnalysisId: latestVNext?.id'), 'reanalysis must reuse existing analysis ID')
assert.ok(route.includes("mode: 'REANALYSIS'"))
const persistence = readFileSync('frontend/src/lib/sera-vnext-product/persistence/reanalyze-analysis.ts', 'utf8')
assert.ok(persistence.includes('narrative_hash: sha256Hex(narrative)'), 'updated narrative must be persisted')
assert.ok(persistence.includes('revision_number: nextRevision'), 'new evidence must append a numbered revision')
assert.ok(canTransitionAnalysisStatus('CANDIDATE_ANALYSIS_CREATED', 'REQUIRES_MORE_EVIDENCE'))
assert.ok(canTransitionAnalysisStatus('HUMAN_REVIEW_COMPLETED_NON_FINAL', 'CANDIDATE_ANALYSIS_CREATED'))

async function main() {
  let calls = 0
  let actualNarrative = ''
  const context: SeraVNextProductContext = { tenantId: 'tenant-18', userId: 'analyst-18', role: 'analyst', email: 'cal18@test.invalid', requestId: 'req-18' }
  const mockAnalysis = {
    id: 'analysis-18', source_reference: 'event-18', current_revision: 2,
    engine_output: { evidenceSufficiency: { status: 'NEEDS_CLARIFICATION' } },
    engine_input: { locale: 'pt-BR' },
  }
  const result = await createCanonicalEventAnalysis({
    eventId: 'event-18', title: 'CAL-18', narrative: merged, mode: 'REANALYSIS', existingAnalysisId: 'analysis-18',
    context,
    reanalyze: async (args) => {
      calls += 1
      assert.equal(args.analysisId, 'analysis-18')
      actualNarrative = args.updatedNarrative ?? ''
      return { analysis: mockAnalysis, revision: { revision_number: 2 } } as Awaited<ReturnType<typeof import('../../frontend/src/lib/sera-vnext-product/persistence/reanalyze-analysis').reanalyzeSeraVNextAnalysis>>
    },
    create: async () => { throw Error('MUST_NOT_CREATE_NEW_ANALYSIS') },
  })
  assert.equal(calls, 1)
  assert.equal(actualNarrative, merged)
  assert.equal(result.analysis.id, 'analysis-18')
  assert.equal(result.revision.revision_number, 2)
  // Exercise persistence itself, not only the canonical adapter: first revision
  // remains immutable while the current analysis advances to revision two.
  const rawInput = {
    inputId: 'CAL18-FIRST', narrative: firstNarrative, locale: 'pt-BR' as const,
    sourceType: 'real_event' as const, requestId: 'CAL18-1', mode: 'CANDIDATE_ONLY' as const,
    options: { allowLlm: false, requireHumanReview: true as const },
  }
  let stored = {
    id: 'analysis-18', tenant_id: context.tenantId, status: 'REQUIRES_MORE_EVIDENCE',
    review_status: 'MORE_EVIDENCE_REQUIRED', deleted_at: null, source_reference: 'event-18',
    current_revision: 1, narrative: firstNarrative, narrative_hash: sha256Hex(firstNarrative),
    engine_input: rawInput, engine_output: runSeraVNextEngineV0(rawInput),
    source_flow: 'VNEXT_PRODUCT_BETA', client_request_id: 'CAL18-FIRST',
  } as unknown as SeraVNextAnalysisRecord
  const revisions: SeraVNextRevisionRecord[] = []
  const repo = {
    async getAnalysis() { return stored },
    async insertAuditEvent(row: Record<string, unknown>) { return { ...row, id: 'audit-18', created_at: new Date().toISOString() } },
    async insertRevision(row: Record<string, unknown>) {
      const revision = { ...row, id: 'revision-18-2', created_at: new Date().toISOString() } as unknown as SeraVNextRevisionRecord
      revisions.push(revision)
      return revision
    },
    async updateAnalysis(_tenant: string, _id: string, patch: Partial<SeraVNextAnalysisRecord>) { stored = { ...stored, ...patch }; return stored },
  } as unknown as SeraVNextProductRepository
  const saved = await reanalyzeSeraVNextAnalysis({ analysisId: stored.id, updatedNarrative: merged,
    reason: 'CAL18-NEW-EVIDENCE', context, repository: repo })
  assert.equal(saved.analysis.id, 'analysis-18')
  assert.equal(saved.analysis.current_revision, 2)
  assert.equal(saved.revision.revision_number, 2)
  assert.equal(saved.revision.engine_input.narrative, merged)
  assert.equal(saved.analysis.narrative, merged)
  assert.equal(saved.analysis.narrative_hash, sha256Hex(merged))
  assert.equal(saved.analysis.source_flow, 'VNEXT_PRODUCT_BETA')
  assert.equal(revisions.length, 1, 'a single new immutable revision should be appended')
  assert.equal(revisions[0].metadata.additionalNarrativeEvidenceApplied, true)
  await assert.rejects(() => reanalyzeSeraVNextAnalysis({ analysisId: stored.id, updatedNarrative: 'Texto que substitui o original.', context, repository: repo }), /preservados integralmente/)
  assert.equal(stored.current_revision, 2)
  console.log('CAL18_EVENT_HISTORY_PASS', { reusedAnalysisId: result.analysis.id, revision: saved.analysis.current_revision, portugueseEvidence: true, originalNarrativeRetained: true })
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
