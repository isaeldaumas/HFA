import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { runStep03UnsafeActCondition as runLegacyUnsafeActCondition } from '../../steps/03-unsafe-act-condition'
import { classifyHumanFactorEscapeStatement } from '../candidate-escape-window'

export function runStep05UnsafeActCondition(input: {
  engineInput: SeraVNextEngineInput
  unsafeState: SeraVNextEngineOutput['unsafeState']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraVNextEngineOutput['unsafeActOrCondition'] {
  const escapeSource = input.escapePoint.firstDepartureCandidate
    ?? input.escapePoint.earliestCandidate
    ?? ''
  const humanAnchor = classifyHumanFactorEscapeStatement(escapeSource)
  if (humanAnchor && escapeSource) {
    return {
      type: humanAnchor === 'UNSAFE_ACT' ? 'UNSAFE_ACT' : 'UNSAFE_CONDITION',
      statement: escapeSource.replace(/^Quando\s+/i, '').replace(/[.\s]+$/g, '').trim(),
      evidence: input.escapePoint.firstDepartureSupportingEvidence?.length
        ? input.escapePoint.firstDepartureSupportingEvidence
        : input.escapePoint.supportingEvidence,
    }
  }

  const legacy = runLegacyUnsafeActCondition(
    {
      inputId: input.engineInput.inputId,
      narrative: input.engineInput.narrative,
      sourceType: 'neutral_trial',
      locale: input.engineInput.locale,
    },
    {
      operationalUnsafeState: input.unsafeState.statement,
      decisionAntecedents: input.unsafeState.evidence,
      finalOutcome: null,
    }
  )

  if (legacy.dominance === 'unsafe_act_dominant') {
    return {
      type: 'UNSAFE_ACT',
      statement: legacy.unsafeAct.statement,
      evidence: legacy.unsafeAct.evidence,
    }
  }

  if (legacy.dominance === 'unsafe_condition_dominant') {
    return {
      type: 'UNSAFE_CONDITION',
      statement: legacy.unsafeCondition.statement,
      evidence: legacy.unsafeCondition.evidence,
    }
  }

  return {
    type: legacy.unsafeAct.statement || legacy.unsafeCondition.statement ? 'UNRESOLVED' : 'UNRESOLVED',
    statement: legacy.unsafeAct.statement || legacy.unsafeCondition.statement,
    evidence: [...legacy.unsafeAct.evidence, ...legacy.unsafeCondition.evidence],
  }
}
