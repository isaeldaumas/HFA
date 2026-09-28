import assert from 'node:assert/strict'
import {
  buildCanonicalEventAnalysisInput,
  buildCanonicalEventClientRequestId,
  canonicalAnalyzeResponse,
  mergeCanonicalReanalysisNarrative,
  mergeCanonicalSupplementalEvidence,
  createCanonicalEventAnalysis,
} from '../../frontend/src/lib/sera-vnext-product/canonical-event-analysis'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

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
  assert.equal(reanalysisInput.metadata.source, 'primary_sera_reanalysis')
  assert.equal(reanalysisInput.metadata.candidateOnly, true)

  const mergedSupplemental = mergeCanonicalSupplementalEvidence([
    { supplementalEvidence: [
      { evidenceId: 'latest-p', statement: 'Percepção mais recente', linkedQuestionId: 'CLARIFY-P-P_ROOT', stage: 'PERCEPTION', temporalRelation: 'AT_ESCAPE' },
      { evidenceId: 'latest-o', statement: 'Objetivo mais recente', linkedQuestionId: 'CLARIFY-O-O_ROOT', stage: 'OBJECTIVE', temporalRelation: 'AT_ESCAPE' },
    ] },
    { supplementalEvidence: [
      { evidenceId: 'old-p', statement: 'Percepção antiga substituída', linkedQuestionId: 'CLARIFY-P-P_ROOT', stage: 'PERCEPTION', temporalRelation: 'AT_ESCAPE' },
      { evidenceId: 'old-a', statement: 'Resposta de ação preservada', linkedQuestionId: 'CLARIFY-A-A_IMPLEMENTED', stage: 'ACTION', temporalRelation: 'AT_ESCAPE' },
    ] },
    { supplementalEvidence: [
      { evidenceId: 'old-escape', statement: 'Ponto de fuga previamente esclarecido', linkedQuestionId: 'CLARIFY-ESCAPE-POINT', stage: 'ESCAPE_POINT', temporalRelation: 'AT_ESCAPE' },
    ] },
  ])
  assert.deepEqual(mergedSupplemental.map((item) => item.linkedQuestionId), [
    'CLARIFY-P-P_ROOT',
    'CLARIFY-O-O_ROOT',
    'CLARIFY-P-P_ROOT',
    'CLARIFY-A-A_IMPLEMENTED',
    'CLARIFY-ESCAPE-POINT',
  ])
  assert.deepEqual(
    mergedSupplemental.filter((item) => item.linkedQuestionId === 'CLARIFY-P-P_ROOT').map((item) => item.statement),
    ['Percepção mais recente', 'Percepção antiga substituída'],
  )

  const mergedAdditional = mergeCanonicalReanalysisNarrative({
    baseNarrative: 'Relato original do evento.',
    additionalInformation: 'Nova evidência documental: o operador declarou que pretendia manter a aproximação.',
  })
  assert.match(mergedAdditional, /Relato original do evento/)
  assert.match(mergedAdditional, /INFORMAÇÕES ADICIONAIS PARA REANÁLISE/)
  assert.match(mergedAdditional, /pretendia manter a aproximação/)
  const mergedAgain = mergeCanonicalReanalysisNarrative({
    baseNarrative: mergedAdditional,
    additionalInformation: 'Nova evidência documental: o operador declarou que pretendia manter a aproximação.',
  })
  assert.equal(mergedAgain, mergedAdditional, 'repeated additional information must be deduplicated')
  const fullResubmission = mergeCanonicalReanalysisNarrative({
    baseNarrative: 'Relato original do evento.',
    submittedNarrative: `Relato original do evento.\n\nComplemento já anexado pelo cliente.`,
    originalNarrative: 'Relato original do evento.',
  })
  assert.match(fullResubmission, /Complemento já anexado pelo cliente/)


  const successiveFullResubmission = mergeCanonicalReanalysisNarrative({
    baseNarrative: mergedAdditional,
    submittedNarrative: `Relato original do evento.

Segundo complemento factual.`,
    originalNarrative: 'Relato original do evento.',
  })
  assert.equal((successiveFullResubmission.match(/Relato original do evento/g) ?? []).length, 1)
  assert.match(successiveFullResubmission, /pretendia manter a aproximação/)
  assert.match(successiveFullResubmission, /Segundo complemento factual/)

  const baseForAdditionalEvidence = 'Durante a atuação do stick pusher, o SIC aplicou esforço NOSE UP na coluna de comando, em oposição ao stick pusher, contrariando o QRH. Como consequência, a aeronave perdeu o controle e colidiu contra o solo.'
  const beforeAdditional = runSeraVNextEngineV0({
    inputId: 'REANALYSIS-BEFORE', narrative: baseForAdditionalEvidence, locale: 'pt-BR', sourceType: 'real_event', requestId: 'before', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true },
  })
  assert.equal(beforeAdditional.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]?.answer, 'INSUFFICIENT_EVIDENCE')
  const reanalysisNarrative = mergeCanonicalReanalysisNarrative({
    baseNarrative: baseForAdditionalEvidence,
    additionalInformation: 'O SIC declarou que, naquele momento, seu objetivo era reduzir a razão de descida para recuperar a trajetória.',
  })
  const afterAdditional = runSeraVNextEngineV0({
    inputId: 'REANALYSIS-AFTER', narrative: reanalysisNarrative, locale: 'pt-BR', sourceType: 'real_event', requestId: 'after', mode: 'CANDIDATE_ONLY', options: { allowLlm: false, requireHumanReview: true },
  })
  const addedEvidence = afterAdditional.factualExtraction.evidence.find((item) => /seu objetivo era reduzir a razão de descida/i.test(item.statement))
  assert.ok(addedEvidence, 'free-form reanalysis information must reach factual evidence extraction')
  assert.equal(addedEvidence?.occurrenceScope, 'CURRENT_EVENT')
  assert.notEqual(addedEvidence?.temporalRelation, 'POST_ESCAPE', 'appended reanalysis evidence must not become post-escape merely because it is appended to the document')
  const afterObjectiveRoot = afterAdditional.canonicalTraversal.paths.find((path) => path.axis === 'O')?.answers[0]
  assert.equal(afterObjectiveRoot?.answer, 'START', 'new factual objective evidence must change O_ROOT on reanalysis')
  assert.match(afterObjectiveRoot?.responseText ?? '', /objetivo do operador|operador pretendia|reduzir a razão de descida/i)

  let captured: any = null
  const fakeResult: any = {
    analysis: {
      id: 'analysis-vnext-1',
      source_flow: 'VNEXT_CANONICAL',
      engine_runtime_version: 'runtime-test',
      canonical_tree_version: 'tree-test',
      warnings: ['NON_FINAL_OUTPUT_ONLY'],
      engine_input: { locale: 'pt-BR' },
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
        evidenceSufficiency: { status: 'SUFFICIENT', questions: [] },
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
    supplementalEvidence: mergedSupplemental,
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
  assert.equal(captured.input.supplementalEvidence.length, 5)
  assert.equal(captured.input.supplementalEvidence[3].linkedQuestionId, 'CLARIFY-A-A_IMPLEMENTED')
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
