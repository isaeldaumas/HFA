import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraSemanticEvidenceAnnotation, SeraSemanticHumanEscapeDisposition } from '../../frontend/src/lib/sera-vnext/engine-contract'
import { buildBlockingDiagnostic, buildExecutiveSummary } from '../../frontend/src/lib/sera-vnext/presentation'
import { buildReviewerOutput } from '../../frontend/src/lib/sera-vnext-product/reviewer-output/build-reviewer-output'

function run(
  inputId: string,
  narrative: string,
  semanticEvidence: SeraSemanticEvidenceAnnotation[],
  humanEscapeDisposition: SeraSemanticHumanEscapeDisposition,
) {
  return runSeraVNextEngineV0({
    inputId,
    narrative,
    locale: 'pt-BR',
    sourceType: 'real_event',
    requestId: inputId,
    mode: 'CANDIDATE_ONLY',
    semanticEvidence,
    semanticEnrichmentMeta: {
      provider: 'frozen-contract',
      model: 'semantic-contract-v2',
      requestedAt: 'frozen',
      acceptedAnnotations: semanticEvidence.length,
      rejectedAnnotations: 0,
      schemaVersion: 'SERA_SEMANTIC_AI_V2',
      humanEscapeDisposition,
    },
    options: { allowLlm: true, requireHumanReview: true, includeDebugTrace: true },
  })
}

// Feedback of the actor's own completed action is not a procedural omission merely because
// the verification itself is required by a procedure. The canonical A tree must reach A-C.
const feedbackNarrative = 'O piloto executou o comando correto e prosseguiu sem verificar se o resultado de sua própria ação havia ocorrido.'
const feedbackEvidence: SeraSemanticEvidenceAnnotation[] = [{
  id: 'FB-1',
  sourceQuote: 'prosseguiu sem verificar se o resultado de sua própria ação havia ocorrido',
  sourceSentenceIndex: 0,
  roles: ['FIRST_DEPARTURE', 'DIRECT_ACTOR', 'ACTION_MECHANISM'],
  concepts: ['feedbackImplementationFailure'],
  actor: 'piloto',
  temporalRelation: 'AT_ESCAPE',
  assertionStatus: 'AFFIRMED',
  occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null,
  preconditionCausalStatus: null,
  actionFailureMechanism: 'FEEDBACK_FAILURE',
  actionMechanismEvidenceQuote: 'prosseguiu sem verificar se o resultado de sua própria ação havia ocorrido',
  displayInterpretation: null,
  confidence: 'HIGH',
  rationale: 'A ação própria foi executada; a falha foi não verificar seu resultado.',
}]
const feedback = run('GEN-FEEDBACK-OWN-ACTION', feedbackNarrative, feedbackEvidence, 'HUMAN_DEPARTURE')
assert.equal(feedback.directActor.actor, 'piloto')
assert.equal(feedback.axes.action.proposedCode, 'A-C', 'own-action feedback failure must reach A-C, not A-B')
assert.notEqual(feedback.axes.action.proposedCode, 'A-B')

// A physical/material departure cannot become a human FIRST_DEPARTURE even if an upstream
// semantic pass over-labelled it. The independent human gate is authoritative.
const technicalNarrative = 'Durante o voo, um componente hidráulico apresentou ruptura interna súbita. A tripulação reconheceu o alerta, executou o procedimento previsto e manteve o controle da aeronave.'
const technicalEvidence: SeraSemanticEvidenceAnnotation[] = [{
  id: 'TECH-1',
  sourceQuote: 'um componente hidráulico apresentou ruptura interna súbita',
  sourceSentenceIndex: 0,
  roles: ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT'],
  concepts: [],
  actor: 'tripulação de voo (coletivo)',
  temporalRelation: 'AT_ESCAPE',
  assertionStatus: 'AFFIRMED',
  occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: 'EQUIPMENT',
  preconditionCausalStatus: 'PRESENT_CONTEXT',
  actionFailureMechanism: 'NONE_OR_UNKNOWN',
  actionMechanismEvidenceQuote: null,
  displayInterpretation: null,
  confidence: 'HIGH',
  rationale: 'Deliberately over-labelled upstream evidence.',
}]
const technical = run('GEN-TECHNICAL-NO-HUMAN', technicalNarrative, technicalEvidence, 'NO_HUMAN_DEPARTURE')
assert.equal(technical.escapePoint.status, 'NO_HUMAN_ESCAPE_POINT')
assert.equal(technical.escapePoint.firstDepartureCandidate, null)
assert.equal(technical.escapePoint.statement, null)
assert.equal(technical.directActor.status, 'NOT_APPLICABLE')
assert.equal(technical.directActor.actor, null)
assert.equal(technical.canonicalTraversal.status, 'NOT_APPLICABLE')
assert.equal(technical.canonicalTraversal.paths.length, 0)
assert.equal(technical.axes.perception.status, 'NOT_APPLICABLE')
assert.equal(technical.axes.objective.status, 'NOT_APPLICABLE')
assert.equal(technical.axes.action.status, 'NOT_APPLICABLE')
assert.equal(technical.preconditions.length, 0, 'technical cause must not be converted into a SERA human precondition when no human escape point exists')
const technicalSummary = buildExecutiveSummary({ title: 'generic technical event', output: technical, pt: true })
assert.match(technicalSummary, /não há ponto de fuga humano nem ator P\/O\/A aplicável/i)
const technicalReviewer = buildReviewerOutput(technical)
assert.equal(technicalReviewer.humanDecisionGuide.recommendedNextStep, 'REJECT_WORKING_HYPOTHESIS')
assert.match(technicalReviewer.axisReviews.perception.candidateStatus, /Não aplicável/i)

// When the source only reports an operational state/result and the human mechanism is unknown
// or conflicting, fail closed as insufficient evidence instead of inventing a crew actor.
const unresolvedNarrative = 'Durante a aproximação, a trajetória começou a se desviar. Os registros disponíveis não permitem determinar qual ação ou percepção humana precedeu o desvio.'
const unresolvedEvidence: SeraSemanticEvidenceAnnotation[] = [{
  id: 'STATE-1',
  sourceQuote: 'a trajetória começou a se desviar',
  sourceSentenceIndex: 0,
  roles: ['FIRST_DEPARTURE'],
  concepts: [],
  actor: null,
  temporalRelation: 'AT_ESCAPE',
  assertionStatus: 'AFFIRMED',
  occurrenceScope: 'CURRENT_EVENT',
  preconditionCategory: null,
  preconditionCausalStatus: null,
  actionFailureMechanism: 'NONE_OR_UNKNOWN',
  actionMechanismEvidenceQuote: null,
  displayInterpretation: null,
  confidence: 'HIGH',
  rationale: 'Deliberately over-labelled operational state.',
}]
const unresolved = run('GEN-STATE-UNKNOWN-HUMAN', unresolvedNarrative, unresolvedEvidence, 'UNRESOLVED')
assert.equal(unresolved.escapePoint.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(unresolved.escapePoint.firstDepartureCandidate, null)
assert.equal(unresolved.escapePoint.statement, null)
assert.equal(unresolved.directActor.status, 'AMBIGUOUS')
assert.equal(unresolved.directActor.actor, null)
assert.equal(unresolved.canonicalTraversal.paths.length, 0)

const unknownDiagnostic = buildBlockingDiagnostic({ narrative: unresolvedNarrative, output: unresolved, pt: true })
assert.equal(unknownDiagnostic?.kind, 'UNKNOWN_MECHANISM')
assert.match(unknownDiagnostic?.impact ?? '', /Resultado observado não substitui mecanismo causal/i)

const conflictDiagnostic = buildBlockingDiagnostic({
  narrative: 'O FDR registra que a aproximação começou a desviar antes da correção. O CVR registra que o desvio começou somente depois da correção. Os dois registros apresentam versões diferentes e não permitem determinar qual versão descreve a primeira saída.',
  output: unresolved,
  pt: true,
})
assert.equal(conflictDiagnostic?.kind, 'CONFLICTING_SOURCES')
assert.match(conflictDiagnostic?.reviewerQuestion ?? '', /qual deve prevalecer/i)

const incompleteDiagnostic = buildBlockingDiagnostic({
  narrative: 'O registro está incompleto e não há registro contemporâneo do que ocorreu imediatamente antes da arremetida.',
  output: unresolved,
  pt: true,
})
assert.equal(incompleteDiagnostic?.kind, 'INCOMPLETE_RECORD')
assert.match(incompleteDiagnostic?.impact ?? '', /inferido/i)

console.log('PASS semantic human-factor gate + own-action feedback boundary')
