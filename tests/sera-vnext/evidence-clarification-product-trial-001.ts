import assert from 'node:assert/strict'
import {
  createSeraVNextAnalysis,
  reanalyzeSeraVNextAnalysis,
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

class Repo {
  analyses: SeraVNextAnalysisRecord[] = []
  revisions: SeraVNextRevisionRecord[] = []
  reviews: SeraVNextReviewRecord[] = []
  events: SeraVNextAuditEventRecord[] = []
  seq = 1
  id(prefix: string) { return `${prefix}-${this.seq++}` }
  now() { return new Date(1771000000000 + this.seq * 1000).toISOString() }
  async findAnalysisByClientRequest(tenantId: string, clientRequestId: string) { return this.analyses.find((item) => item.tenant_id === tenantId && item.client_request_id === clientRequestId) ?? null }
  async insertAnalysis(row: InsertAnalysisRow) { const created = { ...row, id: this.id('analysis'), created_at: this.now(), updated_at: this.now() } as SeraVNextAnalysisRecord; this.analyses.push(created); return created }
  async updateAnalysis(tenantId: string, id: string, patch: Partial<SeraVNextAnalysisRecord>) { const index = this.analyses.findIndex((item) => item.tenant_id === tenantId && item.id === id); assert.notEqual(index, -1); this.analyses[index] = { ...this.analyses[index], ...patch, updated_at: this.now() }; return this.analyses[index] }
  async getAnalysis(tenantId: string, id: string) { return this.analyses.find((item) => item.tenant_id === tenantId && item.id === id) ?? null }
  async listAnalyses(tenantId: string, query: SeraVNextListAnalysesQuery) { const rows = this.analyses.filter((item) => item.tenant_id === tenantId); return { items: rows.map(({ narrative: _n, engine_input: _i, engine_output: _o, ...rest }) => ({ ...rest, narrative: undefined, engine_input: undefined, engine_output: undefined })), page: query.page, pageSize: query.pageSize, total: rows.length } }
  async insertRevision(row: InsertRevisionRow) { const created = { ...row, id: this.id('revision'), created_at: this.now() } as SeraVNextRevisionRecord; this.revisions.push(created); return created }
  async listRevisions(tenantId: string, analysisId: string) { return this.revisions.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
  async insertReview(row: InsertReviewRow) { const created = { ...row, id: this.id('review'), created_at: this.now(), updated_at: this.now() } as SeraVNextReviewRecord; this.reviews.push(created); return created }
  async listReviews(tenantId: string, analysisId: string) { return this.reviews.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
  async insertAuditEvent(row: InsertAuditEventRow) { const created = { ...row, id: this.id('event'), created_at: this.now() } as SeraVNextAuditEventRecord; this.events.push(created); return created }
  async listAuditEvents(tenantId: string, analysisId: string) { return this.events.filter((item) => item.tenant_id === tenantId && item.analysis_id === analysisId) }
}

async function main() {
  const repo = new Repo()
  const context: SeraVNextProductContext = {
    userId: '00000000-0000-0000-0000-0000000000cc',
    tenantId: '00000000-0000-0000-0000-000000000003',
    role: 'admin',
    email: 'clarify@example.test',
    requestId: 'clarify-create',
  }

  const originalNarrative = [
    'O primeiro destino planejado era UNIT-B.',
    'O copiloto era PF e o comandante PM.',
    'A tripulação iniciou a aproximação para UNIT-A.',
    'O relato não informa o que o copiloto acreditava estar vendo, qual era sua intenção nem se a ação executada correspondia ao que pretendia fazer.',
  ].join(' ')

  const created = await createSeraVNextAnalysis({
    input: validateCreateAnalysisInput({
      title: 'clarification flow',
      narrative: originalNarrative,
      sourceType: 'INTERNAL_PILOT',
      clientRequestId: 'clarification-flow-001',
    }),
    context,
    repository: repo,
  })

  assert.equal(created.analysis.status, 'REQUIRES_MORE_EVIDENCE')
  assert.equal(created.analysis.review_status, 'MORE_EVIDENCE_REQUIRED')
  assert.equal(created.analysis.engine_output.evidenceSufficiency.status, 'NEEDS_CLARIFICATION')
  assert.equal(created.analysis.engine_output.axes.perception.proposedCode, null)
  assert.equal(created.analysis.engine_output.axes.objective.proposedCode, null)
  assert.equal(created.analysis.engine_output.axes.action.proposedCode, null)
  assert.equal(created.analysis.narrative, originalNarrative)
  assert.ok(created.analysis.engine_output.evidenceSufficiency.questions.length >= 1)

  const questions = created.analysis.engine_output.evidenceSufficiency.questions
  const responses = questions.map((question) => {
    if (question.stage === 'PERCEPTION') {
      return { questionId: question.id, response: 'No ponto de fuga, o copiloto acreditava que UNIT-A era UNIT-B. O GPS indicava corretamente UNIT-B e a informação estava disponível em cabine.' }
    }
    if (question.stage === 'OBJECTIVE') {
      return { questionId: question.id, response: 'O objetivo do copiloto permanecia cumprir o primeiro pouso planejado em UNIT-B; ele não pretendia escolher deliberadamente outro destino.' }
    }
    if (question.stage === 'ACTION') {
      return { questionId: question.id, response: 'A aproximação para UNIT-A foi executada conforme a identificação que o copiloto mantinha do destino, sem deslize, lapso ou erro independente de manipulação.' }
    }
    if (question.stage === 'DIRECT_ACTOR') {
      return { questionId: question.id, response: 'O copiloto era PF e conduziu a aproximação; o comandante era PM.' }
    }
    return { questionId: question.id, response: 'A primeira saída controlável ocorreu quando a tripulação passou a tratar UNIT-A como o destino planejado e iniciou a aproximação para ela.' }
  })

  const reanalyzed = await reanalyzeSeraVNextAnalysis({
    analysisId: created.analysis.id,
    reason: 'clarification_evidence',
    clarificationResponses: responses,
    context: { ...context, requestId: 'clarify-reanalyze' },
    repository: repo,
  })

  assert.equal(reanalyzed.analysis.narrative, originalNarrative, 'original narrative must remain immutable')
  assert.equal(reanalyzed.analysis.engine_input.narrative, originalNarrative)
  assert.equal(reanalyzed.analysis.engine_input.supplementalEvidence?.length, responses.length)
  assert.ok(reanalyzed.analysis.engine_input.supplementalEvidence?.every((item) => item.linkedQuestionId.startsWith('CLARIFY-')))
  assert.equal(reanalyzed.analysis.current_revision, 2)
  assert.equal(repo.revisions.length, 2)
  assert.deepEqual((repo.revisions[1].metadata.clarificationResponses as Array<{ questionId: string }>).map((item) => item.questionId), responses.map((item) => item.questionId))
  assert.equal(reanalyzed.analysis.engine_output.evidenceSufficiency.status, 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS')
  assert.equal(reanalyzed.analysis.status, 'CANDIDATE_ANALYSIS_CREATED')
  assert.equal(reanalyzed.analysis.review_status, 'NOT_REVIEWED')
  assert.equal(reanalyzed.analysis.engine_output.axes.perception.proposedCode, 'P-G')
  assert.equal(reanalyzed.analysis.engine_output.axes.objective.proposedCode, 'O-A')
  assert.equal(reanalyzed.analysis.engine_output.axes.action.proposedCode, 'A-A')
  assert.ok(repo.events.some((event) => event.event_type === 'analysis.reanalyzed' && event.to_status === 'CANDIDATE_ANALYSIS_CREATED'))

  // Multi-round flow: start from outcome-only information, establish escape point first,
  // then continue asking only the canonical questions that remain unresolved.
  const iterativeRepo = new Repo()
  const outcomeOnlyNarrative = 'A aeronave pousou em uma unidade diferente da planejada. O resumo não informa qual piloto tomou a decisão, quando a identificação mudou nem como a aproximação começou.'
  const outcomeOnly = await createSeraVNextAnalysis({
    input: validateCreateAnalysisInput({
      title: 'outcome-only clarification flow',
      narrative: outcomeOnlyNarrative,
      sourceType: 'INTERNAL_PILOT',
      clientRequestId: 'clarification-flow-outcome-only-001',
    }),
    context: { ...context, requestId: 'clarify-outcome-create' },
    repository: iterativeRepo,
  })
  assert.equal(outcomeOnly.analysis.engine_output.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
  assert.equal(outcomeOnly.analysis.status, 'REQUIRES_MORE_EVIDENCE')
  const escapeQuestion = outcomeOnly.analysis.engine_output.evidenceSufficiency.questions.find((item) => item.stage === 'ESCAPE_POINT')
  assert.ok(escapeQuestion)

  let iterative = await reanalyzeSeraVNextAnalysis({
    analysisId: outcomeOnly.analysis.id,
    reason: 'establish_escape_point',
    clarificationResponses: [{
      questionId: escapeQuestion!.id,
      response: 'O copiloto era PF e o comandante era PM. A tripulação confundiu UNIT-A com UNIT-B e iniciou a aproximação para UNIT-A.',
    }],
    context: { ...context, requestId: 'clarify-outcome-escape' },
    repository: iterativeRepo,
  })
  assert.equal(iterative.analysis.narrative, outcomeOnlyNarrative)
  assert.equal(iterative.analysis.engine_output.escapePoint.status, 'CANDIDATE')
  assert.match(iterative.analysis.engine_output.escapePoint.statement ?? '', /confundiu UNIT-A com UNIT-B/i)
  assert.equal(iterative.analysis.engine_output.directActor.actor, 'copiloto (PF)')
  assert.equal(iterative.analysis.status, 'REQUIRES_MORE_EVIDENCE')
  assert.ok(iterative.analysis.engine_output.escapePoint.excludedPostEscapeEvidence.some((item) => /pousou em uma unidade diferente/i.test(item)))

  const answerFor = (question: typeof iterative.analysis.engine_output.evidenceSufficiency.questions[number]): string => {
    switch (question.linkedNodeId) {
      case 'P_ASSESSMENT': return 'No ponto de fuga, o copiloto acreditava que UNIT-A era UNIT-B, mas o destino real e planejado era UNIT-B.'
      case 'P_CAPABILITY': return 'O copiloto estava treinado e habilitado, sem limitação sensorial conhecida, e o GPS continha o destino correto UNIT-B.'
      case 'P_TIME_PRESSURE': return 'Não havia pressão de tempo excessiva no momento do ponto de fuga.'
      case 'P_INFORMATION_AMBIGUOUS': return 'A informação de navegação não era ambígua nem conflitante; o GPS indicava UNIT-B.'
      case 'P_INFORMATION_AVAILABLE': return 'A informação necessária estava disponível e correta no GPS, mas não foi integrada ao identificar visualmente a unidade.'
      case 'O_RULES': return 'O objetivo do copiloto era cumprir o primeiro pouso planejado em UNIT-B; não havia intenção de escolher deliberadamente outro destino.'
      case 'O_MANAGED_RISK': return 'O objetivo permanecia o destino planejado e não havia meta independente de aceitar ou aumentar risco.'
      case 'O_ROUTINE': return 'Não houve desvio consciente ou prática rotineira de violação neste evento.'
      case 'A_IMPLEMENTED': return 'A aproximação para UNIT-A foi executada conforme a identificação que o copiloto mantinha do destino, sem deslize ou lapso independente de execução.'
      case 'A_CORRECT': return 'A ação era coerente com a identificação percebida pelo copiloto e não houve mecanismo independente de ação inadequada.'
      case 'A_CAPABILITY': return 'O copiloto possuía capacidade, conhecimento e habilidade para executar a aproximação conforme pretendida.'
      case 'A_TIME_PRESSURE': return 'Não havia pressão de tempo excessiva afetando a execução da ação.'
      default:
        if (question.stage === 'DIRECT_ACTOR') return 'O copiloto era PF e conduziu a aproximação; o comandante era PM.'
        if (question.stage === 'PERCEPTION') return 'O copiloto acreditava que UNIT-A era UNIT-B; o GPS correto indicava UNIT-B.'
        if (question.stage === 'OBJECTIVE') return 'O objetivo era cumprir o destino planejado UNIT-B.'
        if (question.stage === 'ACTION') return 'A aproximação foi executada conforme a identificação percebida, sem erro independente de execução.'
        return 'A informação factual solicitada confirma a sequência descrita no ponto de fuga.'
    }
  }

  let rounds = 0
  while (iterative.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION' && rounds < 8) {
    const active = iterative.analysis.engine_output.evidenceSufficiency.questions
    assert.ok(active.length > 0, 'clarification gate must provide actionable questions')
    iterative = await reanalyzeSeraVNextAnalysis({
      analysisId: iterative.analysis.id,
      reason: `canonical_clarification_round_${rounds + 1}`,
      clarificationResponses: active.map((question) => ({ questionId: question.id, response: answerFor(question) })),
      context: { ...context, requestId: `clarify-outcome-round-${rounds + 1}` },
      repository: iterativeRepo,
    })
    assert.equal(iterative.analysis.narrative, outcomeOnlyNarrative)
    rounds += 1
  }

  assert.ok(rounds > 0 && rounds < 8, `expected finite clarification rounds, got ${rounds}`)
  assert.equal(iterative.analysis.engine_output.evidenceSufficiency.status, 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS')
  assert.equal(iterative.analysis.status, 'CANDIDATE_ANALYSIS_CREATED')
  assert.equal(iterative.analysis.engine_output.axes.perception.proposedCode, 'P-G')
  assert.equal(iterative.analysis.engine_output.axes.objective.proposedCode, 'O-A')
  assert.equal(iterative.analysis.engine_output.axes.action.proposedCode, 'A-A')
  assert.ok((iterative.analysis.engine_input.supplementalEvidence ?? []).every((item) => item.collectionSource === undefined))
  assert.ok((iterative.analysis.engine_input.supplementalEvidence ?? []).some((item) => item.stage === 'ESCAPE_POINT'))

  console.log('PASS clarification product reanalysis flow')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
