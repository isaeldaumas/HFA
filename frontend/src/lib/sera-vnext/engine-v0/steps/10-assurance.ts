import type { SeraVNextEngineOutput } from '../../engine-contract'
import { computeSeraVNextGuardrails } from '../../engine-v02/guardrails/compute-guardrails'
import { buildEvidenceTrace, pushUnique } from '../utils'
import { localizeAssuranceText } from '../localization'

export function runStep10Assurance(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  axes: SeraVNextEngineOutput['axes']
  preconditions: SeraVNextEngineOutput['preconditions']
  canonicalTraversal: SeraVNextEngineOutput['canonicalTraversal']
  locale: 'pt-BR' | 'en'
}): Pick<
  SeraVNextEngineOutput,
  'guardrails' | 'guardrailEvidence' | 'uncertainties' | 'limitations' | 'decisionTrace' | 'evidenceTrace' | 'humanReviewPackage'
> {
  const uncertainties: string[] = []
  const limitations: string[] = []
  const decisionTrace: SeraVNextEngineOutput['decisionTrace'] = []

  if (input.directActor.status !== 'IDENTIFIED') {
    pushUnique(uncertainties, localizeAssuranceText('Direct actor remains ambiguous or not applicable.', input.locale))
  }
  if (input.canonicalTraversal.unansweredQuestions.length > 0) {
    pushUnique(uncertainties, localizeAssuranceText('Canonical traversal remains partial for at least one axis.', input.locale))
  }
  if (input.escapePoint.status === 'PROGRESSIVE_ZONE') {
    pushUnique(uncertainties, localizeAssuranceText('Escape point is a progressive zone and its exact boundary remains non-final.', input.locale))
  }
  if (input.escapePoint.excludedPostEscapeEvidence.length > 0) {
    pushUnique(uncertainties, localizeAssuranceText('Post-escape evidence was quarantined from causal traversal.', input.locale))
  }
  const causallySupportedPreconditions = input.preconditions.filter((item) => item.relationship !== 'UNRELATED_OR_UNSUPPORTED')
  if (causallySupportedPreconditions.length === 0) {
    pushUnique(limitations, localizeAssuranceText('No candidate-only precondition could be supported from available evidence.', input.locale))
  }
  if (input.escapePoint.status === 'PROGRESSIVE_ZONE') {
    pushUnique(limitations, localizeAssuranceText('Escape point remains a progressive zone and requires human boundary confirmation.', input.locale))
  }

  for (const [axisName, axis] of Object.entries(input.axes)) {
    decisionTrace.push({
      step: `axis:${axisName}`,
      decision: input.locale === 'pt-BR'
        ? (axis.proposedCode ? `código candidato ${axis.proposedCode}` : 'código candidato não resolvido')
        : (axis.proposedCode ? `candidate code ${axis.proposedCode}` : 'candidate code unresolved'),
      evidence: axis.supportingEvidence.slice(0, 2),
    })
  }

  const usage: Record<string, string[]> = {}
  for (const fact of input.factualExtraction.facts) {
    const uses: string[] = []
    if (input.escapePoint.supportingEvidence.includes(fact.statement)) uses.push('escapePoint')
    if (input.preconditions.some((item) => item.evidence.includes(fact.statement))) uses.push('preconditions')
    if (input.axes.perception.supportingEvidence.includes(fact.statement)) uses.push('axis:perception')
    if (input.axes.objective.supportingEvidence.includes(fact.statement)) uses.push('axis:objective')
    if (input.axes.action.supportingEvidence.includes(fact.statement)) uses.push('axis:action')
    usage[fact.id] = uses
  }

  const actorMigrationDetected =
    input.directActor.status === 'NOT_APPLICABLE' &&
    [input.axes.perception.proposedCode, input.axes.objective.proposedCode, input.axes.action.proposedCode].some(Boolean)
  const computedGuardrails = computeSeraVNextGuardrails(input)
  const guardrailEvidence = Object.fromEntries(
    Object.entries(computedGuardrails).map(([key, value]) => [key, value.evidence]),
  )
  const guardrails = {
    consequenceUsedAsCause: computedGuardrails.consequenceUsedAsCause.violated,
    postEscapeHuntingDetected: computedGuardrails.postEscapeHuntingDetected.violated,
    postEscapeEvidenceUsed: computedGuardrails.postEscapeEvidenceUsed.violated,
    oeUsed: computedGuardrails.oeUsed.violated,
    inventedQuestionDetected: computedGuardrails.inventedQuestionDetected.violated,
    actorMigrationDetected: actorMigrationDetected || computedGuardrails.actorMigrationDetected.violated,
    preconditionUsedAsEscapePoint: computedGuardrails.preconditionUsedAsEscapePoint.violated,
    codeFirstPathDetected: computedGuardrails.codeFirstPathDetected.violated,
    awarenessMissingForViolation: computedGuardrails.awarenessMissingForViolation.violated,
  }
  const guardrailWarnings = Object.entries(guardrails)
    .filter(([, violated]) => violated)
    .map(([name]) => input.locale === 'pt-BR' ? `Violação de salvaguarda detectada: ${name}.` : `Guardrail violation detected: ${name}.`)

  const reviewWarnings = [
    ...input.canonicalTraversal.unansweredQuestions,
    ...input.directActor.actorMigrationWarnings,
    ...uncertainties,
    ...guardrailWarnings,
  ]

  return {
    guardrails,
    guardrailEvidence,
    uncertainties,
    limitations,
    decisionTrace,
    evidenceTrace: buildEvidenceTrace(input.factualExtraction.facts, usage),
    humanReviewPackage: {
      inputSummary: input.factualExtraction.timeline.slice(0, 2).map((item) => item.statement).join(' '),
      escapePointCandidate: input.escapePoint,
      directActor: input.directActor,
      axes: input.axes,
      preconditions: input.preconditions,
      uncertainties,
      unansweredQuestions: input.canonicalTraversal.unansweredQuestions,
      criticalWarnings: reviewWarnings,
      reviewerDecisionsRequired: input.locale === 'pt-BR'
        ? [
            'Confirmar ou rejeitar a fronteira candidata do ponto de fuga.',
            'Confirmar ou rejeitar a atribuição do ator direto.',
            'Revisar os códigos candidatos P/O/A, as alternativas consideradas e as incertezas mantidas.',
            'Confirmar se cada pré-condição é distinta da falha ativa.',
          ]
        : [
            'Confirm or reject the candidate escape point boundary.',
            'Confirm or reject the direct actor attribution.',
            'Review P/O/A candidate code alternatives and retained uncertainties.',
            'Confirm whether each precondition is distinct from the active failure.',
          ],
    },
  }
}
