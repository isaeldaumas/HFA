import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computeRiskAttentionIndex } from '../../frontend/src/lib/risk-profile/attention-score'
import { normalizeRiskProfileVNextPreconditions } from '../../frontend/src/lib/risk-profile/precondition-normalization'
import { normalizeRiskProfileVNextStatus } from '../../frontend/src/lib/risk-profile/source-status'
import { buildSeraActionSuggestions } from '../../frontend/src/lib/corrective-actions/sera-suggestions'
import { buildPreconditionContextReadout } from '../../frontend/src/lib/sera-vnext/precondition-presentation'

const psCdq = computeRiskAttentionIndex([
  { perceptionCode: 'P-G', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 0, openNoOwner: 0, openTotal: 0, totalActions: 0 })
assert.equal(Math.round(psCdq.base), 42)
assert.equal(psCdq.actionPenalty, 0)
assert.equal(psCdq.score, 42)

const withActions = computeRiskAttentionIndex([
  { perceptionCode: 'P-G', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 1, openNoOwner: 1, openTotal: 2, totalActions: 4 })
assert.equal(withActions.actionPenalty, 17)
assert.equal(withActions.score, 59)

const noFailure = computeRiskAttentionIndex([
  { perceptionCode: 'P-A', objectiveCode: 'O-A', actionCode: 'A-A' },
], { openOverdue: 0, openNoOwner: 0, openTotal: 0, totalActions: 0 })
assert.equal(noFailure.score, 0)

const supportedPreconditions = normalizeRiskProfileVNextPreconditions({
  preconditions: [
    { category: 'ENVIRONMENTAL_CONTEXT', relationship: 'CONTEXTUAL_PRECONDITION' },
    { category: 'ATTENTION_WORKLOAD_CONTEXT', relationship: 'UNRELATED_OR_UNSUPPORTED' },
    { category: 'TEAM_COORDINATION', relationship: 'UNRELATED_OR_UNSUPPORTED' },
    { category: 'FEEDBACK_VERIFICATION', relationship: 'ENABLING_PRECONDITION' },
  ],
})
assert.deepEqual(supportedPreconditions, ['ENVIRONMENTAL_CONTEXT', 'FEEDBACK_VERIFICATION'])

assert.equal(normalizeRiskProfileVNextStatus('REQUIRES_MORE_EVIDENCE', 'MORE_EVIDENCE_REQUIRED', null), 'received')
assert.equal(normalizeRiskProfileVNextStatus('CANDIDATE_ANALYSIS_CREATED', 'NOT_REVIEWED', null), 'provisional')
assert.equal(normalizeRiskProfileVNextStatus('HUMAN_REVIEW_COMPLETED_NON_FINAL', 'REVIEWED', null), 'completed')

const treatmentSuggestions = buildSeraActionSuggestions({
  analysisId: 'analysis-1',
  eventId: 'event-1',
  analysisTitle: 'Evento teste',
  output: {
    preconditions: [
      {
        id: 'PC-EVIDENCE-SUPERVISION',
        label: 'PROCEDURAL_MONITORING',
        description: 'Supervisão inadequada sustentada por evidência factual.',
        category: 'PROCEDURAL_MONITORING',
        evidence: ['A checagem independente prevista não foi executada.'],
        relationship: 'ENABLING_PRECONDITION',
        sourceEvidence: [],
        sourceRuleIds: ['SERA-HENDY-ANNEX-B-MONITORING_SUPERVISION'],
        linkedActor: 'maintenance team',
        explicitlyNotEscapePoint: true,
        basedOnCandidateCode: false,
        nonFinal: true,
        confidence: 'MEDIUM',
        canonicalCategory: 'MONITORING_SUPERVISION',
        canonicalLevel: 'COMMAND_CONTROL_SUPERVISION',
        likelyForActiveFailureCodes: ['A-C'],
        methodologyMatch: 'MOST_LIKELY_AND_EVIDENCED',
      },
      {
        id: 'PC-INVESTIGATE-TRAINING',
        label: 'TRAINING_SELECTION',
        description: 'Treinamento deve ser verificado antes de qualquer conclusão causal.',
        category: 'KNOWLEDGE_TRAINING',
        evidence: [],
        relationship: 'UNRELATED_OR_UNSUPPORTED',
        sourceEvidence: [],
        sourceRuleIds: ['SERA-HENDY-TABLE1-A-C-TRAINING_SELECTION'],
        linkedActor: 'maintenance team',
        explicitlyNotEscapePoint: true,
        basedOnCandidateCode: true,
        nonFinal: true,
        confidence: 'LOW',
        canonicalCategory: 'TRAINING_SELECTION',
        canonicalLevel: 'IMMEDIATE',
        likelyForActiveFailureCodes: ['A-C'],
        methodologyMatch: 'HYPOTHESIS_ONLY',
      },
    ],
  } as any,
})
assert.equal(treatmentSuggestions.length, 2)
assert.equal(treatmentSuggestions[0].kind, 'CORRECTIVE_PREVENTIVE')
assert.equal(treatmentSuggestions[0].relatedFailure, 'PC:MONITORING_SUPERVISION')
assert.equal(treatmentSuggestions[0].preconditionId, 'PC-EVIDENCE-SUPERVISION')
assert.equal(treatmentSuggestions[0].preconditionLabel, 'Monitoramento e supervisão')
assert.equal(treatmentSuggestions[0].preconditionLevel, 'COMMAND_CONTROL_SUPERVISION')
assert.ok(treatmentSuggestions[0].sourceRuleIds.includes('SERA-HENDY-ANNEX-B-MONITORING_SUPERVISION'))
assert.equal(treatmentSuggestions[1].kind, 'INVESTIGATION')
assert.equal(treatmentSuggestions[1].relatedFailure, 'INVESTIGATE:TRAINING_SELECTION')
assert.equal(treatmentSuggestions[1].preconditionId, 'PC-INVESTIGATE-TRAINING')


const psCdqEnvironment = {
  id: 'PC-EVIDENCE-ENVIRONMENT',
  canonicalCategory: 'ENVIRONMENT',
  evidence: [
    'Tínhamos em nossa rota a PCP1 e o destino PCP2 fica próximo.',
    'Já estávamos fazendo o planejamento devido ao vento de aproximadamente 30°.',
  ],
} as any
const psCdqReadout = buildPreconditionContextReadout({
  factualExtraction: {
    evidence: [
      { statement: 'Mencionou que ficaram focados no vento, o que poderia ter ocasionado distração.', assertionStatus: 'AFFIRMED', occurrenceScope: 'CURRENT_EVENT', temporalRelation: 'PRE_ESCAPE' },
      { statement: 'Condições meteorológicas – Visibilidade – Não interferiu.', assertionStatus: 'REJECTED_AS_FACTOR', occurrenceScope: 'CURRENT_EVENT', temporalRelation: 'PRE_ESCAPE' },
    ],
  },
} as any, psCdqEnvironment, true)
assert.ok(psCdqReadout)
assert.ok(psCdqReadout?.supported.some((item) => /proximidade|geometria/i.test(item)))
assert.ok(psCdqReadout?.contextual.some((item) => /vento/i.test(item)))
assert.ok(psCdqReadout?.rejected.some((item) => /visibilidade/i.test(item)))

const psCdqTreatment = buildSeraActionSuggestions({
  analysisId: 'analysis-pscdq',
  eventId: 'event-pscdq',
  analysisTitle: 'PS-CDQ',
  output: {
    factualExtraction: { evidence: [
      { sourceSection: 'REPORT_ANALYSIS', assertionStatus: 'AFFIRMED', statement: 'Na aproximação final, o PF deve anunciar o código 9P para que o PM confirme a unidade; o PM é a última barreira contra WDL.' },
    ] },
    preconditions: [{
      ...psCdqEnvironment,
      label: 'ENVIRONMENT',
      description: 'Geometria operacional e proximidade das unidades.',
      category: 'ENVIRONMENTAL_CONTEXT',
      relationship: 'CONTEXTUAL_PRECONDITION',
      sourceEvidence: [], sourceRuleIds: [], linkedActor: 'copiloto (PF)',
      explicitlyNotEscapePoint: true, basedOnCandidateCode: false, nonFinal: true,
      confidence: 'MEDIUM', canonicalLevel: 'IMMEDIATE', likelyForActiveFailureCodes: ['P-G'], methodologyMatch: 'MOST_LIKELY_AND_EVIDENCED',
    }],
  } as any,
})
assert.equal(psCdqTreatment[0].kind, 'CORRECTIVE_PREVENTIVE')
assert.match(psCdqTreatment[0].title, /identificação positiva|PF–PM/i)
assert.match(psCdqTreatment[0].description, /9P|confirmação independente/i)

const riskProfileServer = readFileSync('frontend/src/lib/risk-profile/server.ts', 'utf8')
assert.match(riskProfileServer, /related_failure/)
assert.match(riskProfileServer, /action_kind === 'CORRECTIVE_PREVENTIVE'/, 'only precondition-linked corrective treatment may affect action risk metrics')
assert.match(riskProfileServer, /activeEventIds/, 'risk universe must be rebuilt from active events on every request')
assert.match(riskProfileServer, /activeVNextRows/, 'soft-deleted events must not contribute current SERA analyses')
assert.match(riskProfileServer, /effectiveness_pending/)
assert.match(riskProfileServer, /effectiveness_ineffective/)
const effectivenessMigration = readFileSync('supabase/migrations/20260928234247_corrective_action_effectiveness_cycle.sql', 'utf8')
assert.match(effectivenessMigration, /PENDING_VERIFICATION/)
assert.match(effectivenessMigration, /PARTIALLY_EFFECTIVE/)
const actionsPatchRoute = readFileSync('frontend/src/app/api/actions/[id]/route.ts', 'utf8')
assert.match(actionsPatchRoute, /A eficácia só pode ser avaliada após a conclusão da ação/)
assert.match(actionsPatchRoute, /effectiveness_reviewed_at/)

console.log('PASS risk profile provisional analyses and corrective-action weighting')
