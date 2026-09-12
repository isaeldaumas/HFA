import type { SeraConfidence } from '../engine-contract'
import { hasConcept, matchingConceptStatements, matchingConceptStatementsWithoutNegation, conceptsWithinWindow, type SeraEvidenceConcept } from '../engine-v02/language/concepts'
import type { SeraEvidenceItem } from '../evidence'
import { axisToEvidenceUse, isEvidenceUsableFor } from '../evidence'
import type { CanonicalSeraAxis } from '../types'
import type { SeraCanonicalNode } from './types'

export type SeraNodeEvidenceContext = {
  axis: CanonicalSeraAxis
  node: SeraCanonicalNode
  evidence: SeraEvidenceItem[]
  statementAtEscapePoint: string | null
}

export type SeraNodeAnswer = {
  nodeId: string
  question: string
  exactQuestionTextENAnchor: string
  answer: 'START' | 'SIM' | 'NÃO' | 'NÃO_SENSORIAL' | 'NÃO_CONHECIMENTO' | 'SIM_ATENCAO' | 'SIM_GERENCIAMENTO' | 'NÃO_DESLIZE_LAPSO_ERRO' | 'NÃO_FEEDBACK' | 'NÃO_INABILIDADE' | 'NÃO_SELECAO' | 'SIM_SELECAO' | 'SIM_FEEDBACK' | 'INSUFFICIENT_EVIDENCE'
  nextNodeId: string | null
  terminalCode: string | null
  supportingEvidence: string[]
  counterEvidence: string[]
  prohibitedInferenceChecks: string[]
  confidence: SeraConfidence
  rationale: string
}

type BranchAnswer = SeraNodeAnswer['answer']

type Decision = {
  answer: BranchAnswer
  supportingEvidence: string[]
  rationale: string
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function confidenceFromEvidence(count: number): SeraConfidence {
  if (count >= 3) return 'HIGH'
  if (count === 2) return 'MEDIUM'
  return 'LOW'
}

function usableStatements(ctx: SeraNodeEvidenceContext): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique([
    ...ctx.evidence.filter((item) => isEvidenceUsableFor(item, use)).map((item) => item.statement),
    ctx.statementAtEscapePoint ?? '',
  ])
}

function matching(statements: string[], patterns: RegExp[]): string[] {
  return statements.filter((statement) => patterns.some((pattern) => pattern.test(statement)))
}

function hasText(statements: string[], patterns: RegExp[]): boolean {
  return matching(statements, patterns).length > 0
}

function concept(statements: string[], evidenceConcept: SeraEvidenceConcept): string[] {
  return matchingConceptStatements(statements, evidenceConcept)
}

function anyConcept(statements: string[], concepts: SeraEvidenceConcept[]): boolean {
  return concepts.some((item) => hasConcept(statements, item))
}

function decideP(nodeId: string, statements: string[]): Decision {
  switch (nodeId) {
    case 'P_ROOT':
      return { answer: 'START', supportingEvidence: statements.slice(0, 2), rationale: 'Root node starts canonical perception traversal.' }
    case 'P_ASSESSMENT': {
      const positive = concept(statements, 'adequateAssessment')
      const negative = concept(statements, 'inadequateAssessment')
      if (negative.length > 0) return { answer: 'NÃO', supportingEvidence: negative, rationale: 'Pre-escape evidence supports inaccurate or inadequate situation assessment.' }
      if (positive.length > 0) return { answer: 'SIM', supportingEvidence: positive, rationale: 'Pre-escape evidence supports adequate perception or timely recognition.' }
      // Implicit inadequate-assessment inference: when causal capability limitation
      // (sensory barrier or knowledge gap) is present in the pre-escape evidence and
      // no perception-capability counter-evidence exists, the assessment was necessarily
      // inadequate.  This preserves the canonical P-branch semantics without altering
      // taxonomy or tree structure.
      // Precision guard: perceptionCapabilityPresent (e.g. "clear visual references",
      // "had received training for this system") suppresses the inference.
      const sensory = concept(statements, 'sensoryLimitation')
      const knowledge = concept(statements, 'knowledgeLimitation')
      const capabilityPresent = concept(statements, 'perceptionCapabilityPresent')
      if ((sensory.length > 0 || knowledge.length > 0) && capabilityPresent.length === 0) {
        const implicitEvidence = unique([...sensory, ...knowledge]).slice(0, 3)
        return {
          answer: 'NÃO',
          supportingEvidence: implicitEvidence,
          rationale: 'Causal capability limitation (sensory or knowledge) without perception counter-evidence implies assessment was not adequate.',
        }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape evidence answers whether assessment was adequate.' }
    }
    case 'P_CAPABILITY': {
      const sensory = concept(statements, 'sensoryLimitation')
      const knowledge = concept(statements, 'knowledgeLimitation')
      const capabilityPresent = concept(statements, 'perceptionCapabilityPresent')
      if (sensory.length > 0) return { answer: 'NÃO_SENSORIAL', supportingEvidence: sensory, rationale: 'Evidence localizes the perception issue to sensory/perceptual capability.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence localizes the perception issue to knowledge/training capability.' }
      if (capabilityPresent.length > 0) return { answer: 'SIM', supportingEvidence: capabilityPresent, rationale: 'Evidence supports prerequisite perception capability, so traversal tests time and information branches.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The text does not identify a canonical capability subtype.' }
    }
    case 'P_TIME_PRESSURE': {
      const attention = concept(statements, 'attentionPressure')
      const management = concept(statements, 'timeManagementPressure')
      if (attention.length > 0) return { answer: 'SIM_ATENCAO', supportingEvidence: attention, rationale: 'Evidence supports attention impact under perceived time pressure.' }
      if (management.length > 0) return { answer: 'SIM_GERENCIAMENTO', supportingEvidence: management, rationale: 'Evidence supports time-management pressure.' }
      if (anyConcept(statements, ['informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'])) {
        return { answer: 'NÃO', supportingEvidence: statements.slice(0, 2), rationale: 'No time-pressure evidence is present; information-quality branches can be tested.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No evidence supports a time-pressure perception subtype.' }
    }
    case 'P_INFORMATION_AMBIGUOUS': {
      const ambiguous = concept(statements, 'informationAmbiguous')
      if (ambiguous.length > 0) return { answer: 'SIM', supportingEvidence: ambiguous, rationale: 'Information ambiguity is explicit.' }
      if (anyConcept(statements, ['informationAvailableCorrect', 'informationUnavailable'])) {
        return { answer: 'NÃO', supportingEvidence: statements.slice(0, 2), rationale: 'Information evidence is present but ambiguity is not supported.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No explicit information-quality evidence is available.' }
    }
    case 'P_INFORMATION_AVAILABLE': {
      const available = concept(statements, 'informationAvailableCorrect')
      const unavailable = concept(statements, 'informationUnavailable')
      if (available.length > 0) return { answer: 'SIM', supportingEvidence: available, rationale: 'Evidence supports information being available and correct.' }
      if (unavailable.length > 0) return { answer: 'NÃO', supportingEvidence: unavailable, rationale: 'Evidence supports missing or unavailable information.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Available/correct information is not established strongly enough for a P-G/P-H leaf.' }
    }
    default:
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: `Unsupported perception node ${nodeId}.` }
  }
}

function decideO(nodeId: string, statements: string[]): Decision {
  switch (nodeId) {
    case 'O_ROOT':
      return { answer: 'START', supportingEvidence: statements.slice(0, 2), rationale: 'Root node starts canonical objective traversal.' }
    case 'O_RULES': {
      const safeGoal = concept(statements, 'safeGoal')
      const violationPrerequisites = unique([
        ...matchingConceptStatementsWithoutNegation(statements, 'knownRule'),
        ...matchingConceptStatementsWithoutNegation(statements, 'explicitAwareness'),
        ...matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation'),
      ])
      const unmanagedRisk = concept(statements, 'unmanagedRisk')

      if (safeGoal.length > 0) return { answer: 'SIM', supportingEvidence: safeGoal, rationale: 'Objective evidence supports a safe or rule-consistent goal.' }

      // Conservative known-rule anchor retained: a rule mention alone never
      // opens O-C or converts a documented violation into O-D.
      // Three-tier violation detection (all negation-aware):
      // Tier 1 — Strict triad with contextual window (≤ 3 sentences apart)
      const knownRuleWindow = matchingConceptStatementsWithoutNegation(statements, 'knownRule')
      const explicitAwarenessWindow = matchingConceptStatementsWithoutNegation(statements, 'explicitAwareness')
      const consciousDeviationWindow = matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation')

      const hasKnownRule = knownRuleWindow.length > 0
      const hasAwareness = explicitAwarenessWindow.length > 0
      const hasConscious = consciousDeviationWindow.length > 0

      // Tier 1: All three present within contextual window
      const windowPair1 = conceptsWithinWindow(statements, 'knownRule', 'explicitAwareness', 3)
      const windowPair2 = conceptsWithinWindow(statements, 'explicitAwareness', 'consciousDeviation', 3)

      if (hasKnownRule && hasAwareness && hasConscious && (windowPair1 || windowPair2)) {
        return { answer: 'NÃO', supportingEvidence: violationPrerequisites, rationale: 'Violation path opened by known-rule, awareness, and conscious-deviation evidence within contextual proximity.' }
      }

      // Tier 2: All three present (negation-aware) without window constraint
      if (hasKnownRule && hasAwareness && hasConscious) {
        return { answer: 'NÃO', supportingEvidence: violationPrerequisites, rationale: 'Violation path opened by known-rule, awareness, and conscious-deviation evidence (all three present without negation).' }
      }

      // A documented formal violation cannot be reinterpreted as the O-D
      // non-violation branch merely because the complete O-C triad is absent.
      // It remains unresolved until the missing awareness evidence is supplied.
      if (hasKnownRule && hasConscious) {
        return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: violationPrerequisites, rationale: 'Known-rule plus conscious-deviation evidence blocks the non-violation risk-management branch until explicit awareness completes the O-C evidence.' }
      }

      if (unmanagedRisk.length > 0) return { answer: 'SIM', supportingEvidence: unmanagedRisk, rationale: 'Goal evidence is rule-compatible enough to test risk-management adequacy without inferring violation.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape goal evidence answers rule/risk consistency.' }
    }
    case 'O_ROUTINE': {
      const routine = matchingConceptStatementsWithoutNegation(statements, 'routineDeviation')
      const exceptional = matchingConceptStatementsWithoutNegation(statements, 'exceptionalDeviation')
      const awareness = unique([
        ...matchingConceptStatementsWithoutNegation(statements, 'knownRule'),
        ...matchingConceptStatementsWithoutNegation(statements, 'explicitAwareness'),
        ...matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation'),
      ])
      if (routine.length > 0 && awareness.length > 0) return { answer: 'SIM', supportingEvidence: unique([...routine, ...awareness]), rationale: 'Routine violation requires positive awareness and known-rule evidence.' }
      if (exceptional.length > 0 && awareness.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...exceptional, ...awareness]), rationale: 'Exceptional violation requires positive awareness and known-rule evidence.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Violation subtype is not established.' }
    }
    case 'O_MANAGED_RISK': {
      const managed = concept(statements, 'managedRisk')
      const unmanaged = concept(statements, 'unmanagedRisk')
      // The exact PT question is negative: it asks whether the goal did not
      // manage or limit risk. Keep its answer polarity identical in EN, the
      // evaluator, and the canonical branch map.
      if (unmanaged.length > 0) return { answer: 'SIM', supportingEvidence: unmanaged, rationale: 'Evidence supports a rule-compatible but non-conservative or unmanaged-risk objective.' }
      if (managed.length > 0) return { answer: 'NÃO', supportingEvidence: managed, rationale: 'Risk was actively managed; the negative O_MANAGED_RISK proposition is not supported.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Managed-risk status is not established.' }
    }
    default:
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: `Unsupported objective node ${nodeId}.` }
  }
}

function decideA(nodeId: string, statements: string[]): Decision {
  switch (nodeId) {
    case 'A_ROOT':
      return { answer: 'START', supportingEvidence: statements.slice(0, 2), rationale: 'Root node starts canonical action traversal.' }
    case 'A_IMPLEMENTED': {
      const safeAction = concept(statements, 'safeAction')
      const implemented = concept(statements, 'implementedAction')
      const feedbackFailure = concept(statements, 'feedbackImplementationFailure').filter((statement) =>
        /\b(pr[oó]pria a[cç][aã]o|pr[oó]prio comando|own action|own command|resultado da a[cç][aã]o|resultado do comando|fma|modo ativo|post[- ]?checklist)\b/i.test(statement)
      )
      const slipOrLapse = concept(statements, 'slipLapse')
      const selected = concept(statements, 'selectionSubtype')
      if (feedbackFailure.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: feedbackFailure, rationale: 'Evidence supports failure in feedback/verification during action implementation.' }
      if (slipOrLapse.length > 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: slipOrLapse, rationale: 'Evidence supports a slip/lapse/error in action implementation before the consequence.' }
      if (safeAction.length > 0 || selected.length > 0 || implemented.length > 0) return { answer: 'SIM', supportingEvidence: [...safeAction, ...selected, ...implemented], rationale: 'Evidence supports that an action was implemented and can be tested for adequacy.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape action implementation evidence is sufficient.' }
    }
    case 'A_CORRECT': {
      const correct = concept(statements, 'correctAction')
      const incorrect = concept(statements, 'incorrectAction')
      if (correct.length > 0) return { answer: 'SIM', supportingEvidence: correct, rationale: 'Action evidence supports an adequate response.' }
      if (incorrect.length > 0) return { answer: 'NÃO', supportingEvidence: incorrect, rationale: 'Action evidence supports an implemented but inadequate action.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Correctness of action is not established.' }
    }
    case 'A_CAPABILITY': {
      const physical = concept(statements, 'physicalActionLimitation')
      const knowledge = concept(statements, 'actionKnowledgeLimitation')
      const capabilityPresent = concept(statements, 'actionCapabilityPresent')
      if (physical.length > 0) return { answer: 'NÃO_INABILIDADE', supportingEvidence: physical, rationale: 'Evidence supports physical/capability limitation.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence supports knowledge/skill limitation.' }
      if (capabilityPresent.length > 0) return { answer: 'SIM', supportingEvidence: capabilityPresent, rationale: 'Evidence supports prerequisite action capability, so traversal tests time-pressure action branches.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Action capability cannot be assumed without positive evidence.' }
    }
    case 'A_TIME_PRESSURE': {
      const feedbackFailed = concept(statements, 'feedbackUnderPressureFailed')
      const selectionFailed = concept(statements, 'selectionUnderPressureFailed')
      const feedback = concept(statements, 'feedbackSubtype')
      const rushed = concept(statements, 'timeManagementAction')
      const selection = concept(statements, 'selectionSubtype')
      if (selectionFailed.length > 0) return { answer: 'SIM_SELECAO', supportingEvidence: selectionFailed, rationale: 'Evidence supports selection failure under excessive time pressure.' }
      if (feedbackFailed.length > 0) return { answer: 'SIM_FEEDBACK', supportingEvidence: feedbackFailed, rationale: 'Evidence supports feedback or communication failure under excessive time pressure.' }
      if (feedback.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: feedback, rationale: 'Evidence supports third-party feedback, supervision, or coordination failure without dominant time pressure.' }
      if (selection.length > 0) return { answer: 'NÃO_SELECAO', supportingEvidence: selection, rationale: 'Evidence supports action-selection failure without dominant time pressure.' }
      if (rushed.length > 0) return { answer: 'SIM_GERENCIAMENTO', supportingEvidence: rushed, rationale: 'Evidence supports time-management action subtype.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Action subtype under time pressure is not established.' }
    }
    default:
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: `Unsupported action node ${nodeId}.` }
  }
}

export function evaluateCanonicalNode(ctx: SeraNodeEvidenceContext): SeraNodeAnswer {
  const statements = usableStatements(ctx)
  const decision = ctx.axis === 'P'
    ? decideP(ctx.node.nodeId, statements)
    : ctx.axis === 'O'
      ? decideO(ctx.node.nodeId, statements)
      : decideA(ctx.node.nodeId, statements)

  const branchTarget = decision.answer === 'INSUFFICIENT_EVIDENCE'
    ? null
    : ctx.node.branchMap[decision.answer]

  const terminalCode = branchTarget?.includes('-') ? branchTarget : null
  const nextNodeId = branchTarget && !terminalCode ? branchTarget : null
  const supportingEvidence = unique(decision.supportingEvidence).slice(0, 4)
  const counterEvidence = hasText(statements, [/\b(does not establish|not established|not clearly established|unclear whether)\b/i])
    ? matching(statements, [/\b(does not establish|not established|not clearly established|unclear whether)\b/i]).slice(0, 3)
    : []

  return {
    nodeId: ctx.node.nodeId,
    question: ctx.node.question,
    exactQuestionTextENAnchor: ctx.node.exactQuestionTextENAnchor,
    answer: branchTarget ? decision.answer : 'INSUFFICIENT_EVIDENCE',
    nextNodeId,
    terminalCode,
    supportingEvidence,
    counterEvidence,
    prohibitedInferenceChecks: ctx.node.prohibitedInferences,
    confidence: confidenceFromEvidence(supportingEvidence.length),
    rationale: branchTarget ? decision.rationale : `${decision.rationale} Traversal stops without a reconstructed leaf.`,
  }
}
