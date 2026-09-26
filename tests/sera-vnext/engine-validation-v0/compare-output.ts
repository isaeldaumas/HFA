import type { SeraVNextEngineOutput } from '../../../frontend/src/lib/sera-vnext/engine-contract'
import { semanticNormalize } from './semantic-normalization'
import type { EngineValidationExpectedCase, EngineValidationFinding } from './types'

function includesNormalized(haystack: string | null, needle: string): boolean {
  return (haystack ?? '').toLowerCase().includes(needle.toLowerCase())
}

function asComparableArray(value: Array<string | null> | 'UNRESOLVED_BY_AUTHOR'): Array<string | null> | null {
  return value === 'UNRESOLVED_BY_AUTHOR' ? null : value
}

export function compareOutput(expected: EngineValidationExpectedCase, output: SeraVNextEngineOutput): EngineValidationFinding[] {
  const findings: EngineValidationFinding[] = []
  const normalized = semanticNormalize(output)

  if (!expected.expectedEscapePointStatus.includes(output.escapePoint.status)) {
    findings.push({ severity: 'fail', detail: `unexpected escapePoint.status=${output.escapePoint.status}` })
  }

  if (expected.expectedEscapePointBoundary && expected.expectedEscapePointBoundary !== 'UNRESOLVED_BY_AUTHOR') {
    const boundaryMatched =
      includesNormalized(output.escapePoint.statement, expected.expectedEscapePointBoundary) ||
      includesNormalized(output.escapePoint.earliestCandidate, expected.expectedEscapePointBoundary) ||
      includesNormalized(output.escapePoint.latestCandidate, expected.expectedEscapePointBoundary)
    if (!boundaryMatched) {
      findings.push({ severity: 'partial', detail: `escape point boundary not matched: ${expected.expectedEscapePointBoundary}` })
    }
  }

  const allowedActors = asComparableArray(expected.expectedDirectActor)
  if (allowedActors && !allowedActors.includes(output.directActor.actor ?? null)) {
    findings.push({ severity: 'partial', detail: `unexpected direct actor=${output.directActor.actor}` })
  }

  for (const [label, actual, allowed, forbidden] of [
    ['P', output.axes.perception.proposedCode, expected.allowedPCodes, expected.forbiddenPCodes],
    ['O', output.axes.objective.proposedCode, expected.allowedOCodes, expected.forbiddenOCodes],
    ['A', output.axes.action.proposedCode, expected.allowedACodes, expected.forbiddenACodes],
  ] as const) {
    const allowedValues = allowed === 'UNRESOLVED_BY_AUTHOR' ? null : allowed
    if (allowedValues && !allowedValues.includes(actual as never)) {
      findings.push({ severity: 'partial', detail: `${label} code outside authored allowed set: ${actual}` })
    }
    if (actual && forbidden.includes(actual)) {
      findings.push({ severity: 'fail', detail: `${label} code is forbidden: ${actual}` })
    }
  }

  for (const category of expected.expectedPreconditionCategories) {
    if (!normalized.preconditionCategories.includes(category as (typeof normalized.preconditionCategories)[number])) {
      findings.push({ severity: 'partial', detail: `missing authored precondition category=${category}` })
    }
  }

  for (const fragment of expected.postEscapeEvidenceToExclude) {
    const matched = output.escapePoint.excludedPostEscapeEvidence.some((item) => item.toLowerCase().includes(fragment.toLowerCase()))
    if (!matched) {
      findings.push({ severity: 'partial', detail: `post-escape evidence not excluded: ${fragment}` })
    }
  }

  for (const guardrail of expected.requiredGuardrails) {
    if (output.guardrails[guardrail] !== false) {
      findings.push({ severity: 'partial', detail: `v02 computed guardrail detected: ${guardrail}` })
    }
  }

  if (output.uncertainties.length < expected.minimumUncertainties) {
    findings.push({ severity: 'partial', detail: `uncertainties below floor: ${output.uncertainties.length} < ${expected.minimumUncertainties}` })
  }

  if (!findings.length) {
    findings.push({ severity: 'pass', detail: 'output matches authored boundary checks' })
  }

  return findings
}
