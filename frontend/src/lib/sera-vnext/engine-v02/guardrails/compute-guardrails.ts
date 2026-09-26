import { collectConceptMatches, hasConcept, hasConceptWithoutNegation } from '../language/concepts'
import type { SeraVNextEngineOutput } from '../../engine-contract'

export type SeraComputedGuardrail = {
  violated: boolean
  evidence: string[]
}

export type SeraComputedGuardrails = Record<
  | 'consequenceUsedAsCause'
  | 'postEscapeHuntingDetected'
  | 'postEscapeEvidenceUsed'
  | 'oeUsed'
  | 'inventedQuestionDetected'
  | 'actorMigrationDetected'
  | 'preconditionUsedAsEscapePoint'
  | 'codeFirstPathDetected'
  | 'awarenessMissingForViolation'
  | 'nonCausalEvidenceUsed'
  | 'escapePointReferenceContamination'
  | 'candidateEvidenceMinimumMissing',
  SeraComputedGuardrail
>

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function axisEvidence(output: SeraVNextEngineOutput): string[] {
  return unique([
    ...output.axes.perception.supportingEvidence,
    ...output.axes.objective.supportingEvidence,
    ...output.axes.action.supportingEvidence,
  ])
}

function pathRationales(output: SeraVNextEngineOutput): string[] {
  return output.canonicalTraversal.paths.flatMap((path) =>
    path.answers.flatMap((answer) => [
      answer.rationale ?? '',
      answer.question,
      answer.exactQuestionTextENAnchor ?? '',
    ]),
  )
}

export function computeSeraVNextGuardrails(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  directActor: SeraVNextEngineOutput['directActor']
  axes: SeraVNextEngineOutput['axes']
  preconditions: SeraVNextEngineOutput['preconditions']
  canonicalTraversal: SeraVNextEngineOutput['canonicalTraversal']
}): SeraComputedGuardrails {
  const output = input as SeraVNextEngineOutput
  const facts = input.factualExtraction.facts.map((fact) => fact.statement)
  const usedAxisEvidence = axisEvidence(output)
  const pathTexts = pathRationales(output)
  const postEscapeUsed = input.factualExtraction.evidence
    .filter((item) => item.temporalRelation === 'POST_ESCAPE')
    .map((item) => item.statement)
    .filter((statement) => usedAxisEvidence.includes(statement))
  const outcomeUsed = usedAxisEvidence.filter((statement) => hasConcept([statement], 'postEscapeOutcome'))
  const preconditionEscapeOverlap = input.escapePoint.supportingEvidence
    .filter((statement) => hasConcept([statement], 'preconditionAsEscape'))
  const oeEvidence = facts.filter((statement) => hasConcept([statement], 'oeCode'))
  const inventedQuestionEvidence = collectConceptMatches(pathTexts, ['inventedQuestion']).map((item) => item.statement)
  const codeFirstEvidence = pathTexts.filter((statement) => /\b(code-first|selectedCode|releasedCode|expected output|allowedCodes)\b/i.test(statement))
  const actorMigrationEvidence = input.directActor.actorMigrationWarnings
  const violationCode = input.axes.objective.proposedCode === 'O-B' || input.axes.objective.proposedCode === 'O-C'
  const objectiveEvidence = input.axes.objective.supportingEvidence
  const awarenessMissingForViolation =
    violationCode &&
    !(
      hasConceptWithoutNegation(objectiveEvidence, 'knownRule') &&
      hasConceptWithoutNegation(objectiveEvidence, 'explicitAwareness') &&
      hasConceptWithoutNegation(objectiveEvidence, 'consciousDeviation')
    )
  const forbiddenTypes = new Set(['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'])
  const nonCausalUsed = input.factualExtraction.evidence
    .filter((item) => forbiddenTypes.has(item.evidenceType) && usedAxisEvidence.includes(item.statement))
    .map((item) => item.statement)
  const escapeReferenceContamination = input.factualExtraction.evidence
    .filter((item) => forbiddenTypes.has(item.evidenceType) && input.escapePoint.supportingEvidence.includes(item.statement))
    .map((item) => item.statement)
  const candidateMinimumEvidence: string[] = []
  if (input.axes.perception.proposedCode === 'P-E' && !hasConcept(input.axes.perception.supportingEvidence, 'timeManagementPressure')) candidateMinimumEvidence.push('P-E lacks explicit temporal-perception evidence.')
  if (input.axes.objective.proposedCode === 'O-D' && !hasConcept(input.axes.objective.supportingEvidence, 'efficiencyObjective')) candidateMinimumEvidence.push('O-D lacks an explicit efficiency/economy/time/productivity objective.')
  if (input.axes.action.proposedCode === 'A-H' && !hasConcept(input.axes.action.supportingEvidence, 'timeManagementAction')) candidateMinimumEvidence.push('A-H lacks explicit action-timing evidence.')

  return {
    consequenceUsedAsCause: {
      violated: outcomeUsed.length > 0,
      evidence: outcomeUsed,
    },
    postEscapeHuntingDetected: {
      violated: input.escapePoint.excludedPostEscapeEvidence.length > 0 && postEscapeUsed.length > 0,
      evidence: postEscapeUsed,
    },
    postEscapeEvidenceUsed: {
      violated: postEscapeUsed.length > 0,
      evidence: postEscapeUsed,
    },
    oeUsed: {
      violated: oeEvidence.some((statement) => usedAxisEvidence.includes(statement) || pathTexts.includes(statement)),
      evidence: oeEvidence,
    },
    inventedQuestionDetected: {
      violated: inventedQuestionEvidence.length > 0,
      evidence: inventedQuestionEvidence,
    },
    actorMigrationDetected: {
      violated: input.directActor.status !== 'IDENTIFIED' && [
        input.axes.perception.proposedCode,
        input.axes.objective.proposedCode,
        input.axes.action.proposedCode,
      ].some(Boolean),
      evidence: actorMigrationEvidence,
    },
    preconditionUsedAsEscapePoint: {
      violated: preconditionEscapeOverlap.length > 0,
      evidence: preconditionEscapeOverlap,
    },
    codeFirstPathDetected: {
      violated: codeFirstEvidence.length > 0,
      evidence: codeFirstEvidence,
    },
    awarenessMissingForViolation: {
      violated: awarenessMissingForViolation,
      evidence: awarenessMissingForViolation ? objectiveEvidence : [],
    },
    nonCausalEvidenceUsed: {
      violated: nonCausalUsed.length > 0,
      evidence: nonCausalUsed,
    },
    escapePointReferenceContamination: {
      violated: escapeReferenceContamination.length > 0,
      evidence: escapeReferenceContamination,
    },
    candidateEvidenceMinimumMissing: {
      violated: candidateMinimumEvidence.length > 0,
      evidence: candidateMinimumEvidence,
    },
  }
}
