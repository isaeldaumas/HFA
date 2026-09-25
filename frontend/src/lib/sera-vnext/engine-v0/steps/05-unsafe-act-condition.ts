import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { runStep03UnsafeActCondition as runLegacyUnsafeActCondition } from '../../steps/03-unsafe-act-condition'

export function runStep05UnsafeActCondition(input: {
  engineInput: SeraVNextEngineInput
  unsafeState: SeraVNextEngineOutput['unsafeState']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraVNextEngineOutput['unsafeActOrCondition'] {
  const escapeSource = input.escapePoint.earliestCandidate ?? ''
  const humanEscape = /\b(crew|pilot|captain|first officer|copilot|tripula[cç][aã]o|piloto|comandante|copiloto|maintenance|mechanic|inspector|manuten[cç][aã]o|mec[aâ]nic[oa]s?|inspetor(?:es)?)\b/i.test(escapeSource)
    || /\b(inspe[cç][aã]o (?:de )?pr[eé][ -]?voo|pr[eé][ -]?voo|preflight inspection)\b/i.test(escapeSource)
  if (humanEscape && input.escapePoint.statement) {
    return {
      type: 'UNSAFE_ACT',
      statement: input.escapePoint.statement.replace(/^Quando\s+/i, ''),
      evidence: input.escapePoint.supportingEvidence,
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
