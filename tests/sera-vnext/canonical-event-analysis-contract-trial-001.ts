import assert from 'node:assert/strict'
import {
  buildCanonicalEventAnalysisInput,
  buildCanonicalEventClientRequestId,
  canonicalAnalyzeResponse,
  createCanonicalEventAnalysis,
} from '../../frontend/src/lib/sera-vnext-runtime/canonical-event-analysis'

async function main() {
  assert.equal(
    buildCanonicalEventClientRequestId({ eventId: 'event-1', requestId: 'req-1', mode: 'INITIAL' }),
    'CANONICAL_ROUTE_event-1',
  )
  assert.equal(
    buildCanonicalEventClientRequestId({ eventId: 'event-1', requestId: 'req-2', mode: 'REANALYSIS' }),
    'CANONICAL_REANALYSIS_event-1_req-2',
  )

  const reanalysisInput = buildCanonicalEventAnalysisInput({
    eventId: 'event-1',
    title: 'Evento 1',
    narrative: 'Narrativa suficientemente longa para um evento de teste do fluxo canônico vNext.',
    requestId: 'req-2',
    mode: 'REANALYSIS',
  })
  assert.equal(reanalysisInput.sourceReference, 'event-1')
  assert.equal(reanalysisInput.sourceFlowOverride, 'VNEXT_CANONICAL')
  assert.equal(reanalysisInput.metadata.eventId, 'event-1')
  assert.equal(reanalysisInput.metadata.source, 'canonical_reanalysis')
  assert.equal(reanalysisInput.metadata.candidateOnly, true)

  let captured: any = null
  const fakeResult: any = {
    analysis: {
      id: 'analysis-vnext-1',
      source_flow: 'VNEXT_CANONICAL',
      engine_runtime_version: 'runtime-test',
      canonical_tree_version: 'tree-test',
      warnings: ['NON_FINAL_OUTPUT_ONLY'],
      limitations: ['test limitation'],
      engine_output: {
        guardrails: { consequenceUsedAsCause: false },
        guardrailEvidence: { consequenceUsedAsCause: [] },
        escapePoint: { status: 'CANDIDATE', statement: 'Quando ...' },
        axes: {
          perception: { proposedCode: 'P-G' },
          objective: { proposedCode: 'O-A' },
          action: { proposedCode: 'A-A' },
        },
        preconditions: [],
      },
    },
    revision: {},
    idempotent: false,
  }

  const created = await createCanonicalEventAnalysis({
    eventId: 'event-1',
    title: 'Evento 1',
    narrative: 'Narrativa suficientemente longa para um evento de teste do fluxo canônico vNext.',
    mode: 'REANALYSIS',
    context: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      role: 'admin',
      email: 'admin@example.test',
      requestId: 'req-2',
    },
    create: (async (args: any) => {
      captured = args
      return fakeResult
    }) as any,
  })

  assert.equal(created.analysis.id, 'analysis-vnext-1')
  assert.equal(captured.input.sourceReference, 'event-1')
  assert.equal(captured.input.clientRequestId, 'CANONICAL_REANALYSIS_event-1_req-2')
  assert.equal(captured.input.metadata.eventId, 'event-1')
  assert.equal(captured.context.requestId, 'req-2')

  const response = canonicalAnalyzeResponse(fakeResult, 'event-1')
  assert.equal(response.event_id, 'event-1')
  assert.equal(response.analysis_id, 'analysis-vnext-1')
  assert.equal(response.candidateOnly, true)
  assert.equal(response.humanReviewRequired, true)
  assert.equal(response.seraAnalysis, null)
  assert.equal(response.axes.perception.proposedCode, 'P-G')
  assert.equal('risk' in response, false)
  assert.equal('hfacs' in response, false)
  assert.equal('finalConclusion' in response, false)
  assert.match(response.vnextNotice, /revisão humana/i)

  console.log('PASS canonical event analysis contract')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
