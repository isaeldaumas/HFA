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
  /** Substantive answer produced at the descriptive root and carried to later nodes. */
  rootResponseText?: string | null
}

export type SeraNodeAnswer = {
  nodeId: string
  question: string
  exactQuestionTextENAnchor: string
  answer: 'START' | 'SIM' | 'NÃO' | 'NÃO_SENSORIAL' | 'NÃO_CONHECIMENTO' | 'SIM_ATENCAO' | 'SIM_GERENCIAMENTO' | 'NÃO_DESLIZE_LAPSO_ERRO' | 'NÃO_FEEDBACK' | 'NÃO_INABILIDADE' | 'NÃO_SELECAO' | 'SIM_SELECAO' | 'SIM_FEEDBACK' | 'INSUFFICIENT_EVIDENCE'
  /** Human-readable answer to descriptive/root questions; never the internal START token. */
  responseText: string | null
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
    ctx.rootResponseText ?? '',
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

function stripAxisStatementPrefix(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const colon = trimmed.indexOf(':')
  if (colon > 0 && /ponto de fuga|escape point/i.test(trimmed.slice(0, colon))) {
    return trimmed.slice(colon + 1).trim() || null
  }
  return trimmed || null
}

function conciseRootResponse(axis: CanonicalSeraAxis, raw: string): string {
  const text = raw.trim().replace(/^por[eé]m,?\s*/i, '').replace(/^however,?\s*/i, '')

  if (axis === 'P') {
    const firstLanding = text.match(/identificou\s+(a|o)?\s*([A-Z0-9-]+)\s+como\s+(?:o\s+)?primeiro\s+pouso/i)
    if (firstLanding) {
      const article = (firstLanding[1] ?? '').toLowerCase() === 'o' ? 'o' : 'a'
      return `O operador acreditava que ${article} ${firstLanding[2]} era a unidade prevista para o primeiro pouso.`
    }
    const identifiedAs = text.match(/(?:identificou|tratou|interpretou)\s+(.{1,70}?)\s+como\s+(.{1,100}?)(?:[.;,]|\s+devido\b|\s+porque\b|$)/i)
    if (identifiedAs) return `O operador acreditava que ${identifiedAs[1].trim()} correspondia a ${identifiedAs[2].trim()}.`
    const believed = text.match(/(?:acreditava|entendeu|entendia|percebia)\s+que\s+(.{1,180}?)(?:[.;]|$)/i)
    if (believed) return `O operador acreditava que ${believed[1].trim()}.`
    const enIdentified = text.match(/identified\s+(.{1,70}?)\s+as\s+(?:the\s+)?(.{1,100}?)(?:[.;,]|\s+because\b|$)/i)
    if (enIdentified) return `The operator believed ${enIdentified[1].trim()} was the ${enIdentified[2].trim()}.`
  }

  if (axis === 'O') {
    if (/pouso\s+seria\s+nessa?\s+primeira\s+unidade/i.test(text)) {
      return 'O operador pretendia realizar o primeiro pouso na unidade que acreditava ser o destino previsto.'
    }
    const goal = text.match(/(?:objetivo|inten[cç][aã]o|meta)\s+(?:era|foi|consistia em)?\s*:?[\s]*(.{1,180}?)(?:[.;]|$)/i)
    if (goal) return `O objetivo do operador era ${goal[1].trim()}.`
    if (/planned\s+(?:route|destination)|intended\s+(?:route|destination)/i.test(text)) {
      return 'The operator intended to complete the route or destination believed to be planned.'
    }
  }

  if (axis === 'A') {
    const pcp = text.match(/passou a tratar\s+([A-Z0-9-]+)\s+como\s+o destino previsto para o primeiro pouso/i)
    if (pcp) return `O operador passou a planejar e conduzir a aproximação para ${pcp[1]}, que tratava como o destino previsto para o primeiro pouso.`
    const approach = text.match(/(?:planej|conduz|inici|prosseg|continu)\w*\s+(.{1,180}?)(?:[.;]|$)/i)
    if (approach) return `O operador tentou alcançar o objetivo por meio de ${approach[1].trim()}.`
  }

  return text
}

function rootResponseText(ctx: SeraNodeEvidenceContext, supportingEvidence: string[]): string | null {
  // The root asks a descriptive question. START is only the internal branch token;
  // the user-facing answer must state what was perceived/intended/done.
  const fromStatement = stripAxisStatementPrefix(ctx.statementAtEscapePoint)
  if (fromStatement) return conciseRootResponse(ctx.axis, fromStatement)
  const fallback = supportingEvidence[0]?.trim()
  return fallback ? conciseRootResponse(ctx.axis, fallback) : null
}

function decideP(nodeId: string, statements: string[]): Decision {
  switch (nodeId) {
    case 'P_ROOT': {
      const perceivedState = unique([
        ...concept(statements, 'inadequateAssessment'),
        ...concept(statements, 'adequateAssessment'),
        ...concept(statements, 'informationAvailableCorrect'),
      ])
      return { answer: 'START', supportingEvidence: (perceivedState.length ? perceivedState : statements).slice(0, 2), rationale: 'Root node establishes the operator perceived state before that assessment is tested.' }
    }
    case 'P_ASSESSMENT': {
      const positive = concept(statements, 'adequateAssessment')
      const negative = concept(statements, 'inadequateAssessment')
      if (negative.length > 0) return { answer: 'NÃO', supportingEvidence: negative, rationale: 'Pre-escape evidence supports inaccurate or inadequate situation assessment.' }
      if (positive.length > 0) return { answer: 'SIM', supportingEvidence: positive, rationale: 'Pre-escape evidence supports adequate perception or timely recognition.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape evidence answers whether assessment was adequate.' }
    }
    case 'P_CAPABILITY': {
      const sensory = concept(statements, 'sensoryLimitation')
      const knowledge = concept(statements, 'knowledgeLimitation')
      const capabilityPresent = concept(statements, 'perceptionCapabilityPresent')
      if (sensory.length > 0) return { answer: 'NÃO_SENSORIAL', supportingEvidence: sensory, rationale: 'Evidence localizes the perception issue to sensory/perceptual capability.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence localizes the perception issue to knowledge/training capability.' }
      const informationQuality = unique([
        ...concept(statements, 'informationAvailableCorrect'),
        ...concept(statements, 'informationAmbiguous'),
        ...concept(statements, 'informationUnavailable'),
      ])
      if (capabilityPresent.length > 0 || informationQuality.length > 0) return {
        answer: 'SIM',
        supportingEvidence: unique([...capabilityPresent, ...informationQuality]),
        rationale: 'Positive evidence shows that the issue can be evaluated in the information/attention branches rather than being assumed to be sensory or knowledge incapacity.',
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The text does not identify a canonical capability subtype.' }
    }
    case 'P_TIME_PRESSURE': {
      const attention = concept(statements, 'attentionPressure')
      const management = concept(statements, 'timeManagementPressure')
      if (management.length > 0 && attention.length > 0) return { answer: 'SIM_ATENCAO', supportingEvidence: unique([...attention, ...management]), rationale: 'Attention impairment is supported together with explicit excessive time/urgency pressure.' }
      if (management.length > 0) return { answer: 'SIM_GERENCIAMENTO', supportingEvidence: management, rationale: 'Explicit excessive time-management pressure is supported.' }
      if (attention.length > 0 || anyConcept(statements, ['informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'])) {
        return { answer: 'NÃO', supportingEvidence: attention.length > 0 ? attention : statements.slice(0, 2), rationale: 'Attention-demand evidence exists without explicit excessive time pressure; continue to information-quality branches and retain attention as contextual evidence only.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No evidence answers whether perceived time pressure was excessive.' }
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
    case 'O_ROOT': {
      const intendedGoal = unique([
        ...concept(statements, 'safeGoal'),
        ...concept(statements, 'efficiencyObjective'),
        ...matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation'),
        ...concept(statements, 'unmanagedRisk'),
      ])
      return { answer: 'START', supportingEvidence: (intendedGoal.length ? intendedGoal : statements).slice(0, 2), rationale: 'Root node establishes the operator intended goal before rule/risk consistency is tested.' }
    }
    case 'O_RULES': {
      const safeGoal = concept(statements, 'safeGoal')
      const violationPrerequisites = unique([
        ...matchingConceptStatementsWithoutNegation(statements, 'knownRule'),
        ...matchingConceptStatementsWithoutNegation(statements, 'explicitAwareness'),
        ...matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation'),
      ])
      const unmanagedRisk = concept(statements, 'unmanagedRisk')
      const mistakenTarget = concept(statements, 'inadequateAssessment').filter((statement) =>
        /\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|destino|helideck|runway|surface|destination|deck)\b/i.test(statement),
      )
      const plannedTargetEvidence = concept(statements, 'informationAvailableCorrect')

      if (safeGoal.length > 0) return { answer: 'SIM', supportingEvidence: safeGoal, rationale: 'Objective evidence supports a safe or rule-consistent goal.' }
      if (mistakenTarget.length > 0 && plannedTargetEvidence.length > 0 && violationPrerequisites.length === 0 && unmanagedRisk.length === 0) {
        return {
          answer: 'SIM',
          supportingEvidence: unique([...mistakenTarget, ...plannedTargetEvidence]),
          rationale: 'Evidence supports a planned/authorized target together with mistaken target identification; this supports a rule-consistent objective without treating the perception error as a conscious objective deviation.',
        }
      }

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
      if (routine.length > 0 && awareness.length > 0) return { answer: 'SIM', supportingEvidence: unique([...routine, ...awareness]), rationale: 'Routine violation requires positive normalization/habit evidence together with rule awareness.' }
      if (exceptional.length > 0 && awareness.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...exceptional, ...awareness]), rationale: 'Exceptional violation is explicitly supported together with rule awareness.' }
      const known = matchingConceptStatementsWithoutNegation(statements, 'knownRule')
      const explicit = matchingConceptStatementsWithoutNegation(statements, 'explicitAwareness')
      const conscious = matchingConceptStatementsWithoutNegation(statements, 'consciousDeviation')
      if (known.length > 0 && explicit.length > 0 && conscious.length > 0 && routine.length === 0) {
        return { answer: 'NÃO', supportingEvidence: unique([...known, ...explicit, ...conscious]), rationale: 'A conscious rule deviation is established and no positive evidence of normalization/habit exists; the canonical non-routine branch is O-C.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Violation subtype is not established.' }
    }
    case 'O_MANAGED_RISK': {
      const managed = concept(statements, 'managedRisk')
      const safeGoal = concept(statements, 'safeGoal')
      const unmanaged = concept(statements, 'unmanagedRisk')
      const efficiencyObjective = concept(statements, 'efficiencyObjective')
      const mistakenTarget = concept(statements, 'inadequateAssessment').filter((statement) =>
        /\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|destino|helideck|runway|surface|destination|deck)\b/i.test(statement),
      )
      const plannedTargetEvidence = concept(statements, 'informationAvailableCorrect')
      // The exact PT question is negative: it asks whether the goal did not
      // manage or limit risk. Keep its answer polarity identical in EN, the
      // evaluator, and the canonical branch map.
      if (efficiencyObjective.length > 0) return {
        answer: 'SIM',
        supportingEvidence: unique([...efficiencyObjective, ...unmanaged]),
        rationale: 'O-D requires positive evidence of an efficiency, economy, time, schedule, cost, or productivity objective; that goal evidence is present.',
      }
      if (unmanaged.length > 0) return {
        answer: 'INSUFFICIENT_EVIDENCE',
        supportingEvidence: unmanaged,
        rationale: 'Risk-management concern alone does not establish O-D without a positive efficiency/economy/time/productivity objective.',
      }
      if (managed.length > 0 || safeGoal.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...managed, ...safeGoal]), rationale: 'Positive evidence supports a nominal rule-consistent operational goal; no independent unsafe objective is established.' }
      if (mistakenTarget.length > 0 && plannedTargetEvidence.length > 0) return {
        answer: 'NÃO',
        supportingEvidence: unique([...mistakenTarget, ...plannedTargetEvidence]),
        rationale: 'Planned or authorized target evidence plus mistaken target identification supports no independent unsafe objective or unmanaged-risk goal at the escape point.',
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Managed-risk status is not established.' }
    }
    default:
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: `Unsupported objective node ${nodeId}.` }
  }
}

function decideA(nodeId: string, statements: string[]): Decision {
  switch (nodeId) {
    case 'A_ROOT': {
      const actionStrategy = unique([
        ...concept(statements, 'implementedAction'),
        ...concept(statements, 'safeAction'),
        ...concept(statements, 'incorrectAction'),
        ...concept(statements, 'selectionSubtype'),
        ...concept(statements, 'timeManagementAction'),
      ])
      return { answer: 'START', supportingEvidence: (actionStrategy.length ? actionStrategy : statements).slice(0, 2), rationale: 'Root node establishes how the operator was trying to achieve the goal before implementation/adequacy is tested.' }
    }
    case 'A_IMPLEMENTED': {
      const safeAction = concept(statements, 'safeAction')
      const implemented = concept(statements, 'implementedAction')
      const perceptionDriven = concept(statements, 'inadequateAssessment')
      const feedbackFailure = concept(statements, 'feedbackImplementationFailure').filter((statement) =>
        /\b(pr[oó]pria a[cç][aã]o|pr[oó]prio comando|own action|own command|resultado da a[cç][aã]o|resultado do comando|fma|modo ativo|post[- ]?checklist)\b/i.test(statement)
      )
      const slipOrLapse = concept(statements, 'slipLapse')
      const selected = concept(statements, 'selectionSubtype')
      const timed = concept(statements, 'timeManagementAction')
      if (feedbackFailure.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: feedbackFailure, rationale: 'Evidence supports an independent failure in feedback/verification of the actor own action.' }
      if (slipOrLapse.length > 0 && perceptionDriven.length === 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: slipOrLapse, rationale: 'Evidence supports an independent slip/lapse/error in action implementation before the consequence.' }
      if (safeAction.length > 0 || selected.length > 0 || timed.length > 0 || implemented.length > 0 || perceptionDriven.length > 0) return { answer: 'SIM', supportingEvidence: unique([...safeAction, ...selected, ...timed, ...implemented, ...perceptionDriven]), rationale: perceptionDriven.length > 0 ? 'An action was implemented consistently with the actor perceived state; perception-linked wording is not double-counted as an independent implementation failure.' : 'Evidence supports that an action was implemented and can be tested for adequacy.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape action implementation evidence is sufficient.' }
    }
    case 'A_CORRECT': {
      const correct = concept(statements, 'correctAction')
      const incorrect = concept(statements, 'incorrectAction')
      const perceptionDriven = concept(statements, 'inadequateAssessment')
      const independentSelectionError = matching(statements, [
        /\b(selected|selecionou|escolheu|acionou|apertou|programou|inseriu)\b.*\b(wrong|errad[oa]|incorret[oa]|modo|mode|valor|value|comando|control)\b/i,
        /\bwrong checklist|checklist errado|wrong switch|interruptor errado|wrong control|comando errado\b/i,
      ])
      const selectionSubtype = concept(statements, 'selectionSubtype')
      const timingSubtype = concept(statements, 'timeManagementAction')
      if (timingSubtype.length > 0) return { answer: 'NÃO', supportingEvidence: timingSubtype, rationale: 'The response was eventually executed, but explicit delay/hesitation makes execution timing independently inadequate.' }
      if (correct.length > 0) return { answer: 'SIM', supportingEvidence: correct, rationale: 'Action evidence supports an adequate response.' }
      if (perceptionDriven.length > 0 && independentSelectionError.length === 0 && selectionSubtype.length === 0) return { answer: 'SIM', supportingEvidence: perceptionDriven, rationale: 'The action was coherent with the actor incorrect perceived state and no independent action-selection/implementation mechanism is established; A-axis double counting is avoided.' }
      if (incorrect.length > 0 || independentSelectionError.length > 0 || selectionSubtype.length > 0 || timingSubtype.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...incorrect, ...independentSelectionError, ...selectionSubtype, ...timingSubtype]), rationale: 'Evidence supports an independent implemented but inadequate action, selection, or execution timing.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Correctness of action is not established.' }
    }
    case 'A_CAPABILITY': {
      const physical = concept(statements, 'physicalActionLimitation')
      const knowledge = concept(statements, 'actionKnowledgeLimitation')
      const capabilityPresent = concept(statements, 'actionCapabilityPresent')
      if (physical.length > 0) return { answer: 'NÃO_INABILIDADE', supportingEvidence: physical, rationale: 'Evidence supports physical/capability limitation.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence supports knowledge/skill limitation.' }
      const specificActionMechanism = unique([
        ...concept(statements, 'selectionSubtype'),
        ...concept(statements, 'feedbackSubtype'),
        ...concept(statements, 'timeManagementAction'),
      ])
      if (capabilityPresent.length > 0 || specificActionMechanism.length > 0) return {
        answer: 'SIM',
        supportingEvidence: unique([...capabilityPresent, ...specificActionMechanism]),
        rationale: 'A specific executed/omitted action mechanism provides positive evidence to continue subtype discrimination; capability is not inferred merely from absence of limitation.',
      }
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
    responseText: ctx.node.nodeId.endsWith('_ROOT') && branchTarget
      ? rootResponseText(ctx, supportingEvidence)
      : null,
    nextNodeId,
    terminalCode,
    supportingEvidence,
    counterEvidence,
    prohibitedInferenceChecks: ctx.node.prohibitedInferences,
    confidence: confidenceFromEvidence(supportingEvidence.length),
    rationale: branchTarget ? decision.rationale : `${decision.rationale} Traversal stops without a reconstructed leaf.`,
  }
}
