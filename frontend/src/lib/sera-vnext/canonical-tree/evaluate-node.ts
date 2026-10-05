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
  locale?: 'pt-BR' | 'en'
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

function substantiveClarification(statement: string): boolean {
  const compact = statement.trim().replace(/\s+/g, ' ')
  if (compact.length < 4) return false
  const normalized = compact
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.!?;,]+$/g, '')
    .trim()
  if (/^(sim|nao|yes|no)$/.test(normalized)) return false
  if (/^(nao sei|desconhecido|desconhecida|sem informacao|nao informado|nao informada|n\/?a|unknown|i do not know|no information|not informed)$/.test(normalized)) return false
  return normalized.split(/\s+/).filter(Boolean).length >= 2
}

function directNodeClarificationStatements(ctx: SeraNodeEvidenceContext): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  const expectedQuestionId = `CLARIFY-${ctx.axis}-${ctx.node.nodeId}`
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'CLARIFICATION_RESPONSE'
      && item.linkedQuestionId === expectedQuestionId
      && item.clarificationStage === use
      && item.temporalRelation !== 'POST_ESCAPE'
      && item.assertionStatus === 'AFFIRMED'
      && !item.prohibitedFor.includes(use)
      && substantiveClarification(item.statement))
    .map((item) => item.statement))
}

function matching(statements: string[], patterns: RegExp[]): string[] {
  return statements.filter((statement) => patterns.some((pattern) => pattern.test(statement)))
}


function concept(statements: string[], evidenceConcept: SeraEvidenceConcept): string[] {
  return matchingConceptStatements(statements, evidenceConcept)
}

function anyConcept(statements: string[], concepts: SeraEvidenceConcept[]): boolean {
  return concepts.some((item) => hasConcept(statements, item))
}

function semanticRoleStatements(ctx: SeraNodeEvidenceContext, role: import('../engine-contract').SeraSemanticEvidenceRole): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && item.assertionStatus === 'AFFIRMED'
      && item.semanticConfidence !== 'LOW'
      && !item.prohibitedFor.includes(use)
      && isEvidenceUsableFor(item, use)
      && item.semanticRoles?.includes(role))
    .map((item) => item.statement))
}

function normalizedSemanticStatement(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!?;,]+$/g, '').trim()
}

function semanticActionStrategyStatements(ctx: SeraNodeEvidenceContext): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  const eligible = ctx.evidence.filter((item) =>
    item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
    && item.assertionStatus === 'AFFIRMED'
    && item.semanticConfidence !== 'LOW'
    && !item.prohibitedFor.includes(use)
    && isEvidenceUsableFor(item, use))
  return unique(eligible
    .filter((item) => item.semanticRoles?.includes('ACTION_STRATEGY'))
    .filter((item) => item.semanticActionFailureMechanism !== 'MONITORING_ATTENTION_LAPSE')
    // In V2 the semantic role assignment is authoritative for meaning. A valid strategy may
    // be expressed by the same literal span as FIRST_DEPARTURE (for example, a deliberately
    // selected response). Textual overlap with the landmark is therefore not grounds to erase
    // ACTION_STRATEGY; implementation/mechanism is adjudicated separately.
    .map((item) => item.statement))
}

function semanticActionMechanismStatements(
  ctx: SeraNodeEvidenceContext,
  mechanism: NonNullable<import('../engine-contract').SeraSemanticActionFailureMechanism>,
): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && item.assertionStatus === 'AFFIRMED'
      && item.semanticConfidence !== 'LOW'
      && !item.prohibitedFor.includes(use)
      && isEvidenceUsableFor(item, use)
      && item.semanticActionFailureMechanism === mechanism
      && (mechanism === 'NONE_OR_UNKNOWN' || Boolean(item.semanticActionMechanismEvidenceQuote)))
    .map((item) => item.statement))
}

function semanticAuditedActionMechanismStatements(
  ctx: SeraNodeEvidenceContext,
  mechanism: NonNullable<import('../engine-contract').SeraSemanticActionFailureMechanism>,
): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && item.assertionStatus === 'AFFIRMED'
      && item.semanticConfidence !== 'LOW'
      && item.semanticRoles?.includes('ACTION_MECHANISM')
      && !item.prohibitedFor.includes(use)
      && isEvidenceUsableFor(item, use)
      && item.semanticActionFailureMechanism === mechanism
      && (mechanism === 'NONE_OR_UNKNOWN' || Boolean(item.semanticActionMechanismEvidenceQuote)))
    .map((item) => item.statement))
}

function semanticConceptStatements(ctx: SeraNodeEvidenceContext, conceptName: SeraEvidenceConcept): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && item.assertionStatus === 'AFFIRMED'
      && item.semanticConfidence !== 'LOW'
      && !item.prohibitedFor.includes(use)
      && isEvidenceUsableFor(item, use)
      && item.semanticConcepts?.includes(conceptName as never))
    .map((item) => item.statement))
}

function semanticConceptsWithinWindow(
  ctx: SeraNodeEvidenceContext,
  left: SeraEvidenceConcept,
  right: SeraEvidenceConcept,
  maxDistance: number,
): boolean {
  const use = axisToEvidenceUse(ctx.axis)
  const eligible = ctx.evidence.filter((item) =>
    item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
    && item.assertionStatus === 'AFFIRMED'
    && item.semanticConfidence !== 'LOW'
    && !item.prohibitedFor.includes(use)
    && isEvidenceUsableFor(item, use))
  const leftItems = eligible.filter((item) => item.semanticConcepts?.includes(left as never))
  const rightItems = eligible.filter((item) => item.semanticConcepts?.includes(right as never))
  return leftItems.some((a) => rightItems.some((b) => Math.abs(a.sourceSentenceIndex - b.sourceSentenceIndex) <= maxDistance))
}

function semanticInterpretationPresent(ctx: SeraNodeEvidenceContext): boolean {
  return ctx.evidence.some((item) =>
    item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
    && item.semanticSchemaVersion === 'SERA_SEMANTIC_AI_V2',
  )
}

function clarificationStatementsForAxis(ctx: SeraNodeEvidenceContext): string[] {
  const use = axisToEvidenceUse(ctx.axis)
  return unique(ctx.evidence
    .filter((item) =>
      item.collectionSource === 'CLARIFICATION_RESPONSE'
      && item.clarificationStage === use
      && item.temporalRelation !== 'POST_ESCAPE'
      && item.assertionStatus === 'AFFIRMED'
      && !item.prohibitedFor.includes(use))
    .map((item) => item.statement))
}

function decisionConceptStatements(
  ctx: SeraNodeEvidenceContext,
  statements: string[],
  conceptName: SeraEvidenceConcept,
  negationAware = false,
): string[] {
  const semantic = semanticConceptStatements(ctx, conceptName)
  if (!semanticInterpretationPresent(ctx)) {
    const lexical = negationAware
      ? matchingConceptStatementsWithoutNegation(statements, conceptName)
      : concept(statements, conceptName)
    return unique([...lexical, ...semantic])
  }
  // Canonical AI path: the model owns language interpretation. Only explicit human
  // clarification responses are still parsed lexically because they are not currently
  // passed through semantic enrichment.
  const clarifications = clarificationStatementsForAxis(ctx)
  const clarificationMatches = negationAware
    ? matchingConceptStatementsWithoutNegation(clarifications, conceptName)
    : concept(clarifications, conceptName)
  return unique([...semantic, ...clarificationMatches])
}

function decisionMatching(ctx: SeraNodeEvidenceContext, statements: string[], patterns: RegExp[]): string[] {
  return matching(semanticInterpretationPresent(ctx) ? clarificationStatementsForAxis(ctx) : statements, patterns)
}

function decisionConceptWindow(
  ctx: SeraNodeEvidenceContext,
  statements: string[],
  left: SeraEvidenceConcept,
  right: SeraEvidenceConcept,
  maxDistance: number,
): boolean {
  if (!semanticInterpretationPresent(ctx)) {
    return Boolean(conceptsWithinWindow(statements, left, right, maxDistance)) || semanticConceptsWithinWindow(ctx, left, right, maxDistance)
  }
  return semanticConceptsWithinWindow(ctx, left, right, maxDistance)
    || Boolean(conceptsWithinWindow(clarificationStatementsForAxis(ctx), left, right, maxDistance))
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
    const identifiedAsIf = text.match(/(?:identificou|tratou|interpretou)\s+(.{1,70}?)\s+como se fosse\s+(.{1,100}?)(?:[.;,]|\s+e\s+passou|\s+devido\b|\s+porque\b|$)/i)
    if (identifiedAsIf) return `O operador acreditava que ${identifiedAsIf[1].trim()} era ${identifiedAsIf[2].trim()}.`
    const identifiedAs = text.match(/(?:identificou|tratou|interpretou)\s+(.{1,70}?)\s+como\s+(.{1,100}?)(?:[.;,]|\s+devido\b|\s+porque\b|$)/i)
    if (identifiedAs) return `O operador acreditava que ${identifiedAs[1].trim()} correspondia a ${identifiedAs[2].trim()}.`
    const imcAwareness = text.match(/(?:viu|vimos|viram|sabia|sabiam|estava ciente|estavam cientes).{0,120}?\bIMC\b/i)
    if (imcAwareness) {
      const altitude = text.match(/\b(\d{2,4})\s*(?:p[eé]s|ft|feet)\b/i)?.[1]
      return altitude
        ? `O operador percebia que a operação estava em IMC a ${altitude} pés.`
        : 'O operador percebia que a operação estava em IMC.'
    }
    const judged = text.match(/(?:eu\s+)?julg(?:uei|ava)\s+que\s+(.{1,180}?)(?:[.;]|$)/i)
    if (judged) {
      const belief = judged[1].trim().replace(/\bmeu lado\b/gi, 'seu lado').replace(/\bminha rota\b/gi, 'sua rota')
      return `O operador acreditava que ${belief}.`
    }
    const resumedChecklist = text.match(/retomou\s+(?:a\s+)?checklist\s+a partir do ponto em que acreditava ter parado/i)
    if (resumedChecklist) return 'O operador acreditava ter retomado a checklist a partir do ponto em que havia parado.'
    const believed = text.match(/(?:acreditava|achava|entendeu|entendia|percebia)\s+que\s+(.{1,180}?)(?:[.;]|$)/i)
    if (believed) return `O operador acreditava que ${believed[1].trim()}.`
    const enIdentified = text.match(/identified\s+(.{1,70}?)\s+as\s+(?:the\s+)?(.{1,100}?)(?:[.;,]|\s+because\b|$)/i)
    if (enIdentified) return `The operator believed ${enIdentified[1].trim()} was the ${enIdentified[2].trim()}.`
  }

  if (axis === 'O') {
    if (/pouso\s+seria\s+nessa?\s+primeira\s+unidade/i.test(text)) {
      return 'O operador pretendia realizar o primeiro pouso na unidade que acreditava ser o destino previsto.'
    }
    const preparedApproach = text.match(/passou a (?:preparar|conduzir|planejar)\s+(?:a\s+)?aproxima[cç][aã]o\s+para\s+(.{1,90}?)(?:[.;]|$)/i)
    if (preparedApproach) return `O operador pretendia realizar a aproximação para ${preparedApproach[1].trim()}.`
    if (/called for (?:the )?go-around|chamou (?:pela |a )?arremetida|solicitou (?:a )?arremetida/i.test(text)) {
      return /called for/i.test(text) ? 'The operator intended to execute a go-around.' : 'O operador pretendia executar uma arremetida.'
    }
    if (/\b(?:resolveu|resolveram|resolvemos|decidiu|decidiram|decidimos|optou|optaram)\b.*\bcontinuar\b.*\b(?:tentar|pouso|pousar)\b/i.test(text)) {
      return 'O operador pretendia continuar o voo e tentar o pouso.'
    }
    const goal = text.match(/(?:objetivo|inten[cç][aã]o|meta)\s+(?:era|foi|consistia em)?\s*:?[\s]*(.{1,180}?)(?:[.;]|$)/i)
    if (goal) return `O objetivo do operador era ${goal[1].trim()}.`
    if (/\b(?:pra|para) ajudar\b.*\b(?:proativo|proativa)\b/i.test(text)) {
      return 'O operador pretendia ajudar o colega, agindo de forma proativa.'
    }
    const preferredLanding = text.match(/(?:preferi|preferiu|tenha preferido)\s+(?:fazer|realizar)\s+o pouso(?:\s+mesmo[^.;]{0,120})?\s+(?:pelo|por)\s+(meu|seu)\s+lado/i)
    if (preferredLanding) return `O operador pretendia realizar o pouso pelo ${preferredLanding[1] === 'meu' ? 'seu' : preferredLanding[1]} lado.`
    const desired = text.match(/(?:desejava|queria|pretendia|buscava|visava)\s+(.{1,180}?)(?:[.;]|$)/i)
    if (desired) return `O operador pretendia ${desired[1].trim()}.`
    if (/planned\s+(?:route|destination)|intended\s+(?:route|destination)/i.test(text)) {
      return 'The operator intended to complete the route or destination believed to be planned.'
    }
  }

  if (axis === 'A') {
    if (/\b(?:pra|para) ajudar\b.*\b(?:proativo|proativa)\b/i.test(text)) {
      return 'O operador tentava atingir o objetivo ajudando o colega de forma proativa.'
    }
    const preferredLanding = text.match(/(?:preferi|preferiu|tenha preferido)\s+(?:fazer|realizar)\s+o pouso(?:\s+mesmo[^.;]{0,120})?\s+(?:pelo|por)\s+(meu|seu)\s+lado/i)
    if (preferredLanding) return `O operador tentava atingir o objetivo realizando o pouso pelo ${preferredLanding[1] === 'meu' ? 'seu' : preferredLanding[1]} lado.`
    if (/\b(?:tirei|tirou|retirei|retirou|desguarneci)\b.{0,120}\bcoletivo\b.{0,160}\b(?:peguei|pegou)\b.{0,80}\b(?:papel|papelada|documenta[cç][aã]o)\b/i.test(text)) {
      return 'O operador tentava atingir o objetivo retirando a mão do coletivo para pegar a documentação.'
    }
    const pcp = text.match(/passou a tratar\s+([A-Z0-9-]+)\s+como\s+o destino previsto para o primeiro pouso/i)
    if (pcp) return `O operador passou a planejar e conduzir a aproximação para ${pcp[1]}, que tratava como o destino previsto para o primeiro pouso.`
    const wrongAlternativeEn = text.match(/(?:pulled|pushed)\s+(.{1,100}?)\s+instead of\s+(.{1,100}?)(?:[.;]|$)/i)
    if (wrongAlternativeEn) return `The operator was trying to respond by ${text.match(/(pulled|pushed)/i)?.[1]?.toLowerCase()}ing ${wrongAlternativeEn[1].trim()} instead of ${wrongAlternativeEn[2].trim()}.`
    const wrongAlternativePt = text.match(/(?:puxou|empurrou)\s+(.{1,100}?)\s+(?:em vez de|ao inv[eé]s de)\s+(.{1,100}?)(?:[.;]|$)/i)
    if (wrongAlternativePt) return `O operador tentava responder por meio do comando ${wrongAlternativePt[1].trim()}, em vez de ${wrongAlternativePt[2].trim()}.`
    const proceduralOmission = text.match(/(?:omitiu|n[aã]o executou|n[aã]o realizou|deixou de executar|deixou de realizar|foi omitid[oa])\s+(.{0,160}?\b(?:checklist|item|etapa|passo|procedimento)\b.{0,120}?)(?:[.;]|$)/i)
      ?? text.match(/(.{0,120}?\b(?:checklist|item|etapa|passo|procedimento)\b.{0,120}?)\s+(?:n[aã]o foi executad[oa]|foi omitid[oa])(?:[.;]|$)/i)
    if (proceduralOmission) {
      const omissionText = proceduralOmission[0].trim().replace(/[.]$/, '').replace(/^[A-ZÁÉÍÓÚÃÕÇ]/, (value) => value.toLowerCase())
      return `O operador tentava executar o fluxo procedural descrito, mas ${omissionText}.`
    }
    const selectionMismatch = text.match(/(?:selecionou|configurou|programou|ajustou)\s+(?:um |uma )?(?:modo|configura[cç][aã]o|valor|setting)[^.;]{0,160}?(?:diferente d(?:aquele|aquela|o|a) que pretendia|different from (?:what|the one) (?:he|she|the operator) intended)/i)
    if (selectionMismatch) return 'O operador tentava configurar o sistema por meio da seleção de uma alternativa disponível.'
    const insertedSelection = text.match(/(?:inseriu|programou|selecionou|ajustou)\s+(.{1,180}?)(?:[.;]|$)/i)
    if (insertedSelection) return `O operador tentava atingir o objetivo por meio da seleção/configuração de ${insertedSelection[1].trim()}.`
    if (/\b(?:colocou|aplicou|usou|utilizou|put|applied|used)\b.{0,100}\b(?:barra na barra|pitch down|c[ií]clico|cyclic|comando|control)\b/i.test(text)) {
      return /barra na barra/i.test(text)
        ? 'O operador tentava atingir o objetivo aplicando a técnica de barra na barra.'
        : 'O operador tentava atingir o objetivo por meio do comando/técnica descrito no relato.'
    }
    if (/did not initiate a go-around/i.test(text)) return 'The operator was trying to continue the approach without initiating a go-around.'
    if (/n[aã]o (?:iniciou|executou|realizou) (?:uma |a )?arremetida/i.test(text)) return 'O operador tentava prosseguir a aproximação sem iniciar a arremetida.'
    const hesitation = text.match(/(?:hesitou|demorou|esperou).{0,80}?antes de (executar|iniciar|realizar)\s+(.{1,100}?)(?:[.;]|$)/i)
    if (hesitation) return `O operador pretendia atingir o objetivo por meio da execução de ${hesitation[2].trim()}, mas hesitou antes de executá-la.`
    const prepared = text.match(/passou a (?:preparar|conduzir|planejar)\s+(?:a\s+)?aproxima[cç][aã]o\s+para\s+(.{1,90}?)(?:[.;]|$)/i)
    if (prepared) return `O operador tentava atingir o objetivo preparando e conduzindo a aproximação para ${prepared[1].trim()}.`
    if (/\b(?:resolveu|resolveram|resolvemos|decidiu|decidiram|decidimos|optou|optaram)\b.*\bcontinuar\b.*\b(?:tentar|pouso|pousar)\b/i.test(text)) {
      return 'O operador tentava atingir o objetivo continuando o voo e tentando o pouso.'
    }
    const plannedMeans = text.match(/(?:decidiu|optou|planejava|pretendia|tentava)\s+(?:por\s+)?(?:usar|utilizar|empregar|executar|realizar|conduzir)\s+(.{1,180}?)(?:[.;]|$)/i)
    if (plannedMeans) return `O operador tentava atingir o objetivo usando ${plannedMeans[1].trim()}.`
    const approach = text.match(/(?:planej|conduz|inici|prosseg|continu)\w*\s+(.{1,180}?)(?:[.;]|$)/i)
    if (approach) return `O operador tentou alcançar o objetivo por meio de ${approach[1].trim()}.`
  }

  const isEnglish = /\b(the|operator|crew|pilot|planned|intended|believed|identified|used|selected|approach)\b/i.test(text)
  if (axis === 'P') return isEnglish ? `The operator believed that ${text.replace(/[.]$/, '')}.` : `O operador acreditava que ${text.replace(/[.]$/, '')}.`
  if (axis === 'O') return isEnglish ? `The operator intended to ${text.replace(/[.]$/, '')}.` : `O operador pretendia ${text.replace(/[.]$/, '')}.`
  return isEnglish ? `The operator was trying to achieve the goal by ${text.replace(/[.]$/, '')}.` : `O operador tentava atingir o objetivo por meio de ${text.replace(/[.]$/, '')}.`
}

function insufficientRootResponse(axis: CanonicalSeraAxis, locale: 'pt-BR' | 'en' = 'pt-BR'): string {
  if (locale === 'en') {
    if (axis === 'P') return 'The available evidence does not establish what the operator believed was happening in relation to the goal.'
    if (axis === 'O') return 'The available evidence does not establish the intent or goal the operator was trying to achieve.'
    return 'The available evidence does not establish the plan or strategy by which the operator was trying to achieve the goal.'
  }
  if (axis === 'P') return 'Não é possível determinar, com a evidência disponível, o que o operador acreditava estar acontecendo em relação ao objetivo.'
  if (axis === 'O') return 'Não é possível determinar, com a evidência disponível, qual era a intenção ou o objetivo que o operador pretendia alcançar.'
  return 'Não é possível determinar, com a evidência disponível, qual era o plano ou a estratégia pela qual o operador tentava atingir o objetivo.'
}

function expandSupportingEvidenceToSourceSentence(ctx: SeraNodeEvidenceContext, support: string): string {
  const target = normalizedSemanticStatement(support)
  if (!target) return support
  const semanticItem = ctx.evidence.find((item) =>
    item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
    && normalizedSemanticStatement(item.statement) === target)
  if (!semanticItem) return support
  const containing = ctx.evidence
    .filter((item) => item.sourceSentenceIndex === semanticItem.sourceSentenceIndex)
    .map((item) => item.statement.trim())
    .filter(Boolean)
    .filter((statement) => normalizedSemanticStatement(statement).includes(target))
    .sort((a, b) => b.length - a.length)
  return containing[0] ?? support
}

function isDisplayInterpretationWellFormed(axis: CanonicalSeraAxis, text: string): boolean {
  const value = text.trim()
  if (!value || value.length < 12) return false
  // Presentation-only guard. It never interprets source evidence or selects a SERA branch.
  if (/\b(?:por meio de|atrav[eé]s de|by means of)\s+(?:retomou|selecionou|omitiu|deixou|executou|configurou|programou|resumed|selected|omitted|stopped|executed|configured)\b/i.test(value)) return false
  if (axis === 'P' && /\b(?:acreditava|percebia|believed|perceived)\s+que\s+(?:a partir d(?:e|o|a)|porque|quando|ap[oó]s|depois d(?:e|o|a)|from|because|when|after)\b/i.test(value)) return false
  return true
}

function rootResponseText(ctx: SeraNodeEvidenceContext, supportingEvidence: string[]): string | null {
  // Hendy Step 2 asks for substantive P/O/A statements before the ladders. START is only
  // an internal branch token; the user-facing answer must directly answer the root question.
  // When the investigator answered this exact root question, preserve the factual response
  // verbatim instead of trying to reconstruct it from lexical patterns.
  const directClarification = directNodeClarificationStatements(ctx)
    .find((statement) => supportingEvidence.includes(statement))
  if (directClarification) return directClarification

  // AI may provide a grammar-normalized display sentence for the descriptive root. It is
  // deliberately presentation-only: branch decisions above consume sourceQuote/roles/concepts,
  // never this paraphrase. We only accept it when tied to the exact source evidence selected
  // by the traversal for this axis.
  const expectedRole = ctx.axis === 'P' ? 'PERCEPTION_STATE' : ctx.axis === 'O' ? 'OBJECTIVE_INTENT' : 'ACTION_STRATEGY'
  const displayCandidates = ctx.evidence
    .filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && item.semanticRoles?.includes(expectedRole)
      && Boolean(item.semanticDisplayInterpretation)
      && supportingEvidence.includes(item.statement))
    .sort((a, b) => {
      if (ctx.axis !== 'A') return 0
      const aFailure = a.semanticActionFailureMechanism && a.semanticActionFailureMechanism !== 'NONE_OR_UNKNOWN' ? 1 : 0
      const bFailure = b.semanticActionFailureMechanism && b.semanticActionFailureMechanism !== 'NONE_OR_UNKNOWN' ? 1 : 0
      return aFailure - bFailure
    })
  const displayInterpretation = displayCandidates
    .map((item) => item.semanticDisplayInterpretation?.trim() ?? '')
    .find((value) => isDisplayInterpretationWellFormed(ctx.axis, value))
  if (displayInterpretation) return displayInterpretation

  if (ctx.axis === 'A' && semanticInterpretationPresent(ctx)) {
    const mechanismItems = ctx.evidence.filter((item) =>
      item.collectionSource === 'AI_SEMANTIC_EXTRACTION'
      && supportingEvidence.includes(item.statement)
      && item.semanticConfidence !== 'LOW')
    if (mechanismItems.some((item) => item.semanticActionFailureMechanism === 'IMPLEMENTATION_MISMATCH')) {
      return ctx.locale === 'pt-BR'
        ? 'A estratégia não está descrita de forma independente; o relato estabelece apenas que a ação implementada diferiu da ação pretendida.'
        : 'The strategy is not independently described; the source only establishes that the implemented action differed from the intended action.'
    }
    if (mechanismItems.some((item) => item.semanticActionFailureMechanism === 'PROCEDURAL_OMISSION')) {
      return ctx.locale === 'pt-BR'
        ? 'A estratégia não está descrita de forma independente; o relato estabelece apenas a omissão de uma etapa procedural esperada.'
        : 'The strategy is not independently described; the source only establishes omission of an expected procedural step.'
    }
  }

  const fromStatement = stripAxisStatementPrefix(ctx.statementAtEscapePoint)
  // On the canonical semantic path, natural-language interpretation belongs to the AI.
  // If its display paraphrase fails presentation validation, fail softly to the verbatim
  // source evidence instead of reconstructing meaning with handwritten language patterns.
  if (semanticInterpretationPresent(ctx)) {
    return supportingEvidence[0]?.trim() || fromStatement || null
  }
  if (ctx.axis === 'A') {
    const candidates = [...(fromStatement ? [fromStatement] : []), ...supportingEvidence]
    const concrete = candidates.find((text) => /\b(tirei|tirou|retirei|retirou|desguarneci|peguei|pegou|puxei|puxou|empurrei|empurrou|coloquei|colocou|apliquei|aplicou|preferi|preferiu|tenha preferido|assumir|assumiu|barra na barra|pitch down|removed|pulled|pushed|applied|preferred|took over)\b/i.test(text))
    if (concrete) return conciseRootResponse(ctx.axis, concrete)
  }
  const support = supportingEvidence[0]?.trim()
  if (support) return conciseRootResponse(ctx.axis, expandSupportingEvidenceToSourceSentence(ctx, support))
  return fromStatement ? conciseRootResponse(ctx.axis, fromStatement) : null
}

function decideP(nodeId: string, statements: string[], ctx: SeraNodeEvidenceContext): Decision {
  const c = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName)
  const cn = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName, true)
  const any = (conceptNames: SeraEvidenceConcept[]) => conceptNames.some((conceptName) => c(conceptName).length > 0)
  const conceptWindow = (left: SeraEvidenceConcept, right: SeraEvidenceConcept, maxDistance: number) => decisionConceptWindow(ctx, statements, left, right, maxDistance)
  switch (nodeId) {
    case 'P_ROOT': {
      const perceivedState = unique([
        ...c('inadequateAssessment'),
        ...c('adequateAssessment'),
        ...semanticRoleStatements(ctx, 'PERCEPTION_STATE'),
        ...decisionMatching(ctx, statements, [/\b(acreditava|achava|entendia|percebia|identificou|interpretou|reconheceu|viu|vimos|viram|sabia|sabiam|ciente|consciente|believed|understood|perceived|identified|interpreted|recognized|saw|knew|aware)\b/i]),
      ])
      if (!perceivedState.length) return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The descriptive root requires evidence of what the operator believed or perceived; environmental/system state alone cannot substitute for that belief.' }
      return { answer: 'START', supportingEvidence: perceivedState.slice(0, 2), rationale: 'Root node establishes the operator perceived state before that assessment is tested.' }
    }
    case 'P_ASSESSMENT': {
      const positive = c('adequateAssessment')
      const negative = c('inadequateAssessment')
      if (negative.length > 0) return { answer: 'NÃO', supportingEvidence: negative, rationale: 'Pre-escape evidence supports inaccurate or inadequate situation assessment.' }
      if (positive.length > 0) return { answer: 'SIM', supportingEvidence: positive, rationale: 'Pre-escape evidence supports adequate perception or timely recognition.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape evidence answers whether assessment was adequate.' }
    }
    case 'P_CAPABILITY': {
      const sensory = c('sensoryLimitation')
      const knowledge = c('knowledgeLimitation')
      const capabilityPresent = c('perceptionCapabilityPresent')
      if (sensory.length > 0) return { answer: 'NÃO_SENSORIAL', supportingEvidence: sensory, rationale: 'Evidence localizes the perception issue to sensory/perceptual capability.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence localizes the perception issue to knowledge/training capability.' }
      const informationQuality = unique([
        ...c('informationAvailableCorrect'),
        ...c('informationAmbiguous'),
        ...c('informationUnavailable'),
      ])
      if (capabilityPresent.length > 0 || informationQuality.length > 0) return {
        answer: 'SIM',
        supportingEvidence: unique([...capabilityPresent, ...informationQuality]),
        rationale: 'Positive evidence shows that the issue can be evaluated in the information/attention branches rather than being assumed to be sensory or knowledge incapacity.',
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The text does not identify a canonical capability subtype.' }
    }
    case 'P_TIME_PRESSURE': {
      const attention = c('attentionPressure')
      const management = c('timeManagementPressure')
      if (management.length > 0 && attention.length > 0) return { answer: 'SIM_ATENCAO', supportingEvidence: unique([...attention, ...management]), rationale: 'Attention impairment is supported together with explicit excessive time/urgency pressure.' }
      if (management.length > 0) return { answer: 'SIM_GERENCIAMENTO', supportingEvidence: management, rationale: 'Explicit excessive time-management pressure is supported.' }
      if (attention.length > 0 || any(['informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'])) {
        return { answer: 'NÃO', supportingEvidence: attention.length > 0 ? attention : statements.slice(0, 2), rationale: 'Attention-demand evidence exists without explicit excessive time pressure; continue to information-quality branches and retain attention as contextual evidence only.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No evidence answers whether perceived time pressure was excessive.' }
    }
    case 'P_INFORMATION_AMBIGUOUS': {
      const ambiguous = c('informationAmbiguous')
      if (ambiguous.length > 0) return { answer: 'SIM', supportingEvidence: ambiguous, rationale: 'Information ambiguity is explicit.' }
      if (any(['informationAvailableCorrect', 'informationUnavailable'])) {
        return { answer: 'NÃO', supportingEvidence: statements.slice(0, 2), rationale: 'Information evidence is present but ambiguity is not supported.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No explicit information-quality evidence is available.' }
    }
    case 'P_INFORMATION_AVAILABLE': {
      const available = c('informationAvailableCorrect')
      const unavailable = c('informationUnavailable')
      if (available.length > 0) return { answer: 'SIM', supportingEvidence: available, rationale: 'Evidence supports information being available and correct.' }
      if (unavailable.length > 0) return { answer: 'NÃO', supportingEvidence: unavailable, rationale: 'Evidence supports missing or unavailable information.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Available/correct information is not established strongly enough for a P-G/P-H leaf.' }
    }
    default:
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: `Unsupported perception node ${nodeId}.` }
  }
}

function decideO(nodeId: string, statements: string[], ctx: SeraNodeEvidenceContext): Decision {
  const c = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName)
  const cn = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName, true)
  const any = (conceptNames: SeraEvidenceConcept[]) => conceptNames.some((conceptName) => c(conceptName).length > 0)
  const conceptWindow = (left: SeraEvidenceConcept, right: SeraEvidenceConcept, maxDistance: number) => decisionConceptWindow(ctx, statements, left, right, maxDistance)
  switch (nodeId) {
    case 'O_ROOT': {
      const actionIntentOnly = (statement: string): boolean =>
        /\b(?:selecionou|configurou|programou|ajustou|selected|configured|programmed|set)\b.{0,180}\b(?:diferente d(?:aquele|aquela|o|a) que pretendia|different from (?:what|the one) (?:he|she|the operator) intended|not what (?:he|she|the operator) intended)\b/i.test(statement)
      const intendedGoal = unique([
        // The root must answer Hendy's explicit goal/intention question. A procedure that
        // should have been executed (safeGoal) is not evidence of what this actor intended.
        ...c('efficiencyObjective'),
        ...semanticRoleStatements(ctx, 'OBJECTIVE_INTENT'),
        ...decisionMatching(ctx, statements, [
          /\b(objetiv|inten[cç][aã]o|pretend|planej|meta|queria|desej|buscava|visava|goal|intent|planned|planning)\w*/i,
          /\b(decidiu|decidiram|decidimos|resolveu|resolveram|resolvemos|optou|optaram|escolheu|escolheram|decided|resolved|chose|opted)\b.{0,120}\b(continuar|continuou|prosseguir|prosseguiu|tentar|decolar|decolou|pousar|pousou|aproximar|aproximou|descer|desceu|subir|subiu|continue|continued|proceed|proceeded|try|take off|took off|land|landed|approach|approached|descend|descended|climb|climbed)\b/i,
          /\b(decidiu|resolveu|decided|resolved)\b.{0,80}\b(violar|descumprir|desrespeitar|violate|breach|disregard)\b.{0,100}\b(continuar|continuou|prosseguir|prosseguiu|seguir|seguiu|continue|continued|proceed|proceeded|press on|pressed on)\b/i,
          /\b((?:passou|come[cç]ou) a (?:preparar|conduzir|planejar)|iniciou (?:o )?planejamento|iniciou (?:a )?aproxima[cç][aã]o|preparou|conduziu)\b.{0,90}\b(aproxima[cç][aã]o|approach|pouso|landing|destino|destination|unidade|unit-|plataforma|helideck)\b/i,
          /\b(called for|requested|solicitou|chamou (?:pela |a )?)\b.{0,60}\b(go-around|go around|arremetida)\b/i,
        ]),
      ])
      const filteredIntendedGoal = semanticInterpretationPresent(ctx)
        ? intendedGoal
        : intendedGoal.filter((statement) => !actionIntentOnly(statement))
      if (!filteredIntendedGoal.length) return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The descriptive root requires evidence of the actor intended objective. The observed unsafe action, intended control/configuration, a rule deviation, or the outcome cannot substitute for the operational goal.' }
      return { answer: 'START', supportingEvidence: filteredIntendedGoal.slice(0, 2), rationale: 'Root node establishes the operator intended goal before rule/risk consistency is tested.' }
    }
    case 'O_RULES': {
      const safeGoal = c('safeGoal')
      const violationPrerequisites = unique([
        ...cn('knownRule'),
        ...cn('explicitAwareness'),
        ...cn('consciousDeviation'),
      ])
      const unmanagedRisk = c('unmanagedRisk')
      const mistakenTarget = c('inadequateAssessment').filter((statement) =>
        /\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|destino|helideck|runway|surface|destination|deck)\b/i.test(statement),
      )
      const plannedTargetEvidence = c('informationAvailableCorrect')

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
      const knownRuleWindow = cn('knownRule')
      const explicitAwarenessWindow = cn('explicitAwareness')
      const consciousDeviationWindow = cn('consciousDeviation')

      const hasKnownRule = knownRuleWindow.length > 0
      const hasAwareness = explicitAwarenessWindow.length > 0
      const hasConscious = consciousDeviationWindow.length > 0

      // Tier 1: All three present within contextual window
      const windowPair1 = conceptWindow('knownRule', 'explicitAwareness', 3)
      const windowPair2 = conceptWindow('explicitAwareness', 'consciousDeviation', 3)

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
      const routine = cn('routineDeviation')
      const exceptional = cn('exceptionalDeviation')
      const awareness = unique([
        ...cn('knownRule'),
        ...cn('explicitAwareness'),
        ...cn('consciousDeviation'),
      ])
      if (routine.length > 0 && awareness.length > 0) return { answer: 'SIM', supportingEvidence: unique([...routine, ...awareness]), rationale: 'Routine violation requires positive normalization/habit evidence together with rule awareness.' }
      if (exceptional.length > 0 && awareness.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...exceptional, ...awareness]), rationale: 'Exceptional violation is explicitly supported together with rule awareness.' }
      const known = cn('knownRule')
      const explicit = cn('explicitAwareness')
      const conscious = cn('consciousDeviation')
      if (known.length > 0 && explicit.length > 0 && conscious.length > 0 && routine.length === 0) {
        return { answer: 'NÃO', supportingEvidence: unique([...known, ...explicit, ...conscious]), rationale: 'A conscious rule deviation is established and no positive evidence of normalization/habit exists; the canonical non-routine branch is O-C.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Violation subtype is not established.' }
    }
    case 'O_MANAGED_RISK': {
      const managed = c('managedRisk')
      const safeGoal = c('safeGoal')
      const unmanaged = c('unmanagedRisk')
      const efficiencyObjective = c('efficiencyObjective')
      const mistakenTarget = c('inadequateAssessment').filter((statement) =>
        /\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|destino|helideck|runway|surface|destination|deck)\b/i.test(statement),
      )
      const plannedTargetEvidence = c('informationAvailableCorrect')
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

function decideA(nodeId: string, statements: string[], ctx: SeraNodeEvidenceContext): Decision {
  const c = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName)
  const cn = (conceptName: SeraEvidenceConcept) => decisionConceptStatements(ctx, statements, conceptName, true)
  const any = (conceptNames: SeraEvidenceConcept[]) => conceptNames.some((conceptName) => c(conceptName).length > 0)
  const conceptWindow = (left: SeraEvidenceConcept, right: SeraEvidenceConcept, maxDistance: number) => decisionConceptWindow(ctx, statements, left, right, maxDistance)
  switch (nodeId) {
    case 'A_ROOT': {
      const proceduralOmission = c('proceduralOmission')
      const semanticProceduralOmission = semanticActionMechanismStatements(ctx, 'PROCEDURAL_OMISSION')
      const semanticImplementationMismatch = semanticActionMechanismStatements(ctx, 'IMPLEMENTATION_MISMATCH')
      const semanticFeedbackFailure = semanticActionMechanismStatements(ctx, 'FEEDBACK_FAILURE')
      const actionStrategy = unique([
        ...semanticActionStrategyStatements(ctx),
        ...c('selectionSubtype'),
        // Failure mechanisms are deliberately not strategy evidence. A source-anchored
        // omission or implementation mismatch may allow the implementation node to be
        // tested, but must not be displayed as HOW the actor was trying to achieve a goal.
        // Hendy asks HOW the actor was trying to achieve the goal — the plan/means.
        // A bare observed control movement is not sufficient to establish that strategy.
        ...decisionMatching(ctx, statements, [
          /\b(pretendia|intencionava|planejava|decidiu|decidiram|decidimos|resolveu|resolveram|resolvemos|optou|optaram|escolheu|escolheram|tentava|buscava|visava|intended|planned|decided|resolved|opted|chose|was trying|sought|aimed)\b.{0,180}\b(usar|utilizar|executar|realizar|conduzir|prosseguir|continuar|tentar|selecionar|acionar|aproximar|pousar|use|using|execute|perform|conduct|proceed|continue|try|select|activate|approach|land)\b/i,
          /\b(passou|come[cç]ou) a (?:tratar|planejar|conduzir|preparar|executar|usar|utilizar)\b/i,
          /\b(iniciou (?:o )?planejamento|iniciou (?:a )?aproxima[cç][aã]o|conduziu a aproxima[cç][aã]o|preparou a aproxima[cç][aã]o|planejou a aproxima[cç][aã]o)\b/i,
          /\b(usou|utilizou|selecionou|acionou|configurou|programou|inseriu)\b.{0,120}\b(para|a fim de|com o objetivo de|visando|to|in order to|so as to)\b/i,
          /\b(inseriu|programou|selecionou|ajustou)\b.{0,140}\b(n[ií]vel|altitude|modo|mode|valor|value|setting|flight level|painel|panel)\b/i,
          /\b(pulled|pushed)\b.{0,100}\binstead of\b|\b(puxou|empurrou)\b.{0,100}\b(em vez de|ao inv[eé]s de)\b/i,
          /\b(did not initiate|did not execute|failed to initiate|failed to execute)\b.{0,80}\b(go-around|go around)\b/i,
          /\b(n[aã]o iniciou|n[aã]o executou|falhou em iniciar|falhou em executar)\b.{0,80}\b(arremetida|go-around)\b/i,
          /\b(hesitou|demorou|esperou|hesitated|delayed|waited)\b.{0,100}\b(antes de|before)\b.{0,100}\b(executar|iniciar|realizar|execute|initiate|perform)\b/i,
          /\b(por meio de|atrav[eé]s de|by means of|by using|using)\b.{0,160}/i,
          /\b(inspe[cç][aã]o (?:de )?pr[eé][ -]?voo|preflight inspection|inspe[cç][aã]o visual)\b.{0,140}\b(conclu[ií]d[ao]|realizad[ao]|completed|performed|nada de anormal|nenhuma anormalidade|no abnormality)\b/i,
          /\b(associou|identificou|tratou)\b.{0,140}\b(unidade|plataforma|pista|destino)\b.{0,220}\b(conduzindo|conduzir|aproxima[cç][aã]o|pouso|landing|approach)\b/i,
        ]),
      ])
      const specificProceduralOmission = decisionMatching(ctx, statements, [
        /\b(?:omitiu|omitiram|omitted|skipped)\b.{0,160}\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b/i,
        /\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b.{0,180}\b(?:n[aã]o foi executad[oa]|n[aã]o foram executad[oa]s?|foi omitid[oa]|foram omitid[oa]s?|was not executed|were not executed|was omitted|were omitted)\b/i,
        /\b(?:n[aã]o executou|n[aã]o realizou|deixou de executar|deixou de realizar|failed to execute|failed to perform|did not execute|did not perform)\b.{0,160}\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b/i,
      ])
      if (!actionStrategy.length && semanticImplementationMismatch.length) {
        return { answer: 'START', supportingEvidence: semanticImplementationMismatch.slice(0, 2), rationale: 'The strategy is not independently described. A source-anchored implementation mismatch is sufficient to test implementation without reconstructing the strategy or operational objective.' }
      }
      if (!actionStrategy.length && semanticFeedbackFailure.length) {
        return { answer: 'START', supportingEvidence: semanticFeedbackFailure.slice(0, 2), rationale: 'The strategy is not independently described. A source-anchored failure to verify the result of the actor own action is sufficient to test the implementation/feedback branch without reconstructing the strategy or operational objective.' }
      }
      if (!actionStrategy.length && (semanticProceduralOmission.length || (!semanticInterpretationPresent(ctx) && (proceduralOmission.length || specificProceduralOmission.length)))) {
        return { answer: 'START', supportingEvidence: unique([...semanticProceduralOmission, ...proceduralOmission, ...specificProceduralOmission]).slice(0, 2), rationale: 'The strategy is not independently described. A specific expected procedural step was identified as omitted, which is sufficient to test implementation without reconstructing the strategy, Perception, or Objective.' }
      }
      if (!actionStrategy.length) return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'The descriptive root requires evidence of the actor plan, strategy, or means for achieving the goal; an observed movement or control input alone cannot substitute for that plan.' }
      return { answer: 'START', supportingEvidence: actionStrategy.slice(0, 2), rationale: 'Root node establishes how the operator was trying to achieve the goal before implementation and adequacy are tested.' }
    }
    case 'A_IMPLEMENTED': {
      const safeAction = c('safeAction')
      const implemented = c('implementedAction')
      const perceptionDriven = c('inadequateAssessment')
      const feedbackFailure = c('feedbackImplementationFailure').filter((statement) =>
        /\b(pr[oó]pria a[cç][aã]o|pr[oó]prio comando|own action|own command|resultado da a[cç][aã]o|resultado do comando|fma|modo ativo|post[- ]?checklist)\b/i.test(statement)
      )
      const slipOrLapse = c('slipLapse')
      const proceduralOmission = c('proceduralOmission')
      const implementationMismatch = c('implementationMismatch')
      const semanticProceduralOmission = semanticActionMechanismStatements(ctx, 'PROCEDURAL_OMISSION')
      const semanticImplementationMismatch = semanticActionMechanismStatements(ctx, 'IMPLEMENTATION_MISMATCH')
      const semanticMonitoringLapse = semanticActionMechanismStatements(ctx, 'MONITORING_ATTENTION_LAPSE')
      const semanticFeedbackFailure = semanticActionMechanismStatements(ctx, 'FEEDBACK_FAILURE')
      const semanticOtherActionFailure = semanticActionMechanismStatements(ctx, 'OTHER_ACTION_FAILURE')
      const auditedProceduralOmission = semanticAuditedActionMechanismStatements(ctx, 'PROCEDURAL_OMISSION')
      const auditedImplementationMismatch = semanticAuditedActionMechanismStatements(ctx, 'IMPLEMENTATION_MISMATCH')
      const auditedMonitoringLapse = semanticAuditedActionMechanismStatements(ctx, 'MONITORING_ATTENTION_LAPSE')
      const auditedFeedbackFailure = semanticAuditedActionMechanismStatements(ctx, 'FEEDBACK_FAILURE')
      const auditedOtherActionFailure = semanticAuditedActionMechanismStatements(ctx, 'OTHER_ACTION_FAILURE')
      const auditedUnknown = semanticAuditedActionMechanismStatements(ctx, 'NONE_OR_UNKNOWN')
      const selected = c('selectionSubtype')
      const timed = c('timeManagementAction')
      const intendedAction = decisionMatching(ctx, statements, [
        /\b(pretendia|intencionava|queria|tentava|planejava|decidiu|optou|escolheu|selecionou|prosseguiu|continuou|intended|wanted|was trying|planned to|decided|opted|chose|selected|proceeded|continued)\b/i,
        /\b((?:passou|come[cç]ou) a (?:trat[aá](?:-l[ao])?|planejar|conduzir|preparar)|iniciou (?:o )?planejamento|iniciou (?:a )?aproxima[cç][aã]o|conduziu a aproxima[cç][aã]o|preparou a aproxima[cç][aã]o|comprometeu(?:-se)?|tratava .* como (?:o )?destino)\b/i,
        /\b(associou|identificou|tratou)\b.{0,140}\b(unidade|plataforma|pista|destino)\b.{0,220}\b(conduzindo|conduzir|aproxima[cç][aã]o|pouso|landing|approach)\b/i,
        /\b(inspe[cç][aã]o (?:de )?pr[eé][ -]?voo|preflight inspection|inspe[cç][aã]o visual)\b.{0,140}\b(conclu[ií]d[ao]|realizad[ao]|completed|performed|nada de anormal|nenhuma anormalidade|no abnormality)\b/i,
        /\b(a[cç][aã]o pretendida|comando pretendido|intended action|intended command)\b/i,
      ])
      const observedDeliberateAction = decisionMatching(ctx, statements, [
        /\b((?:passou|come[cç]ou) a (?:planejar|conduzir|aproximar|preparar)|iniciou (?:o )?planejamento|iniciou (?:a )?aproxima[cç][aã]o|conduziu a aproxima[cç][aã]o|preparou a aproxima[cç][aã]o|conduzindo (?:o )?pouso|associou .* unidade|compromet(?:eu|endo).*aproxima[cç][aã]o)\b/i,
      ])
      const explicitCorrespondence = decisionMatching(ctx, statements, [
        /\b(como pretendia|conforme pretendia|correspondeu ao que pretendia|implementad[ao] como pretendid[ao]|as intended|matched the intended|corresponded to the intended)\b/i,
      ])
      const explicitImplementationMismatch = decisionMatching(ctx, statements, [
        /\b(?:selecionou|configurou|programou|ajustou|selected|configured|programmed|set)\b.{0,180}\b(?:diferente d(?:aquele|aquela|o|a) que pretendia|different from (?:what|the one) (?:he|she|the operator) intended|not what (?:he|she|the operator) intended)\b/i,
      ])
      const specificProceduralOmission = decisionMatching(ctx, statements, [
        /\b(?:omitiu|omitiram|omitted|skipped)\b.{0,160}\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b/i,
        /\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b.{0,180}\b(?:n[aã]o foi executad[oa]|n[aã]o foram executad[oa]s?|foi omitid[oa]|foram omitid[oa]s?|was not executed|were not executed|was omitted|were omitted)\b/i,
        /\b(?:n[aã]o executou|n[aã]o realizou|deixou de executar|deixou de realizar|failed to execute|failed to perform|did not execute|did not perform)\b.{0,160}\b(?:checklist|item|etapa|passo|procedimento|procedure|step)\b/i,
      ])
      const deliberateOmission = cn('consciousDeviation').length > 0 && cn('explicitAwareness').length > 0
      if (semanticInterpretationPresent(ctx)) {
        const mechanismGroups = [
          ['PROCEDURAL_OMISSION', semanticProceduralOmission],
          ['IMPLEMENTATION_MISMATCH', semanticImplementationMismatch],
          ['MONITORING_ATTENTION_LAPSE', semanticMonitoringLapse],
          ['FEEDBACK_FAILURE', semanticFeedbackFailure],
          ['OTHER_ACTION_FAILURE', semanticOtherActionFailure],
        ].filter(([, evidence]) => (evidence as string[]).length > 0)
        const auditedGroups = [
          ['PROCEDURAL_OMISSION', auditedProceduralOmission],
          ['IMPLEMENTATION_MISMATCH', auditedImplementationMismatch],
          ['MONITORING_ATTENTION_LAPSE', auditedMonitoringLapse],
          ['FEEDBACK_FAILURE', auditedFeedbackFailure],
          ['OTHER_ACTION_FAILURE', auditedOtherActionFailure],
        ].filter(([, evidence]) => (evidence as string[]).length > 0)
        if (auditedGroups.length > 1 || mechanismGroups.length > 1) {
          return {
            answer: 'INSUFFICIENT_EVIDENCE',
            supportingEvidence: unique([...mechanismGroups, ...auditedGroups].flatMap(([, evidence]) => evidence as string[])),
            rationale: 'Conflicting source-anchored semantic action mechanisms were returned. The deterministic engine fails closed until the mechanism is resolved.',
          }
        }
        if (auditedUnknown.length > 0) {
          return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: auditedUnknown, rationale: 'The independent semantic action-mechanism audit could not establish an implementation mechanism; the Action implementation branch remains unresolved.' }
        }
        if (auditedGroups.length === 1 && mechanismGroups.length === 1 && auditedGroups[0][0] !== mechanismGroups[0][0]) {
          return {
            answer: 'INSUFFICIENT_EVIDENCE',
            supportingEvidence: unique([...(auditedGroups[0][1] as string[]), ...(mechanismGroups[0][1] as string[])]),
            rationale: `Primary semantic extraction and the independent action-mechanism audit disagree (${mechanismGroups[0][0]} vs ${auditedGroups[0][0]}). The deterministic engine fails closed.`,
          }
        }
        if (auditedMonitoringLapse.length > 0) return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: auditedMonitoringLapse, rationale: 'The independent semantic audit identifies a monitoring/attention lapse, which does not establish implementation different from intention.' }
        if (auditedFeedbackFailure.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: auditedFeedbackFailure, rationale: 'The independent source-anchored semantic audit establishes an independent feedback/verification failure.' }
        if (auditedImplementationMismatch.length > 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: auditedImplementationMismatch, rationale: 'The independent source-anchored semantic audit establishes an implementation mismatch between intended and implemented action.' }
        if (auditedProceduralOmission.length > 0 && !deliberateOmission) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: auditedProceduralOmission, rationale: 'The independent source-anchored semantic audit establishes omission of a specific expected procedural step.' }
        if (semanticFeedbackFailure.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: semanticFeedbackFailure, rationale: 'Source-anchored semantic evidence establishes an independent feedback/verification failure.' }
        if (semanticImplementationMismatch.length > 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: semanticImplementationMismatch, rationale: 'Source-anchored semantic evidence establishes an implementation mismatch between intended and implemented action.' }
        if (semanticProceduralOmission.length > 0 && !deliberateOmission) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: semanticProceduralOmission, rationale: 'Source-anchored semantic evidence establishes omission of a specific expected procedural step; absent deliberate-deviation evidence, this supports A-B.' }
        if (semanticMonitoringLapse.length > 0) return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: semanticMonitoringLapse, rationale: 'A monitoring/attention lapse does not establish that an intended action was implemented differently; the Action implementation branch remains unresolved without independent implementation evidence.' }
      } else {
        if (feedbackFailure.length > 0) return { answer: 'NÃO_FEEDBACK', supportingEvidence: feedbackFailure, rationale: 'Evidence supports an independent failure in feedback/verification of the actor own action.' }
        if (implementationMismatch.length > 0 || explicitImplementationMismatch.length > 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: unique([...implementationMismatch, ...explicitImplementationMismatch]), rationale: 'Evidence establishes that the implemented selection/configuration differed from the actor stated intended implementation.' }
        if ((proceduralOmission.length > 0 || specificProceduralOmission.length > 0) && !deliberateOmission) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: unique([...proceduralOmission, ...specificProceduralOmission]), rationale: 'Evidence establishes omission of a specific expected procedural step; absent deliberate-deviation evidence, this supports A-B.' }
        const independentStrategy = semanticActionStrategyStatements(ctx)
        if (slipOrLapse.length > 0 && perceptionDriven.length === 0 && independentStrategy.length > 0 && implemented.length > 0) return { answer: 'NÃO_DESLIZE_LAPSO_ERRO', supportingEvidence: unique([...slipOrLapse, ...independentStrategy, ...implemented]), rationale: 'A generic slip/lapse label is accepted only when independent evidence establishes both the intended strategy and an implemented action.' }
      }
      if (explicitCorrespondence.length > 0 || selected.length > 0 || timed.length > 0 || safeAction.length > 0 || (intendedAction.length > 0 && (implemented.length > 0 || perceptionDriven.length > 0 || observedDeliberateAction.length > 0))) {
        return {
          answer: 'SIM',
          supportingEvidence: unique([...explicitCorrespondence, ...intendedAction, ...observedDeliberateAction, ...safeAction, ...selected, ...timed, ...implemented, ...perceptionDriven]),
          rationale: perceptionDriven.length > 0
            ? 'Evidence establishes an intended action and an implemented action consistent with the actor perceived state; perception-linked wording is not double-counted as an independent implementation failure.'
            : 'Evidence establishes both the intended action and an implemented action, allowing implementation-as-intended to be tested.',
        }
      }
      if (implemented.length > 0 || safeAction.length > 0 || selected.length > 0 || timed.length > 0 || observedDeliberateAction.length > 0) {
        return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: unique([...implemented, ...observedDeliberateAction, ...safeAction, ...selected, ...timed]), rationale: 'An observed action is supported, but the actor intended action is not established; implementation cannot be judged against intention.' }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'No pre-escape evidence establishes both the intended and implemented action.' }
    }
    case 'A_CORRECT': {
      const correct = c('correctAction')
      const incorrect = c('incorrectAction')
      const perceptionDriven = c('inadequateAssessment')
      const independentSelectionError = decisionMatching(ctx, statements, [
        /\b(selected|selecionou|escolheu|acionou|apertou|programou|inseriu)\b.*\b(wrong|errad[oa]|incorret[oa]|modo|mode|valor|value|comando|control)\b/i,
        /\bwrong checklist|checklist errado|wrong switch|interruptor errado|wrong control|comando errado\b/i,
      ])
      const selectionSubtype = c('selectionSubtype')
      const timingSubtype = c('timeManagementAction')
      if (timingSubtype.length > 0) return { answer: 'NÃO', supportingEvidence: timingSubtype, rationale: 'The response was eventually executed, but explicit delay/hesitation makes execution timing independently inadequate.' }
      if (correct.length > 0) return { answer: 'SIM', supportingEvidence: correct, rationale: 'Action evidence supports an adequate response.' }
      if (perceptionDriven.length > 0 && independentSelectionError.length === 0 && selectionSubtype.length === 0) return { answer: 'SIM', supportingEvidence: perceptionDriven, rationale: 'The action was coherent with the actor incorrect perceived state and no independent action-selection/implementation mechanism is established; A-axis double counting is avoided.' }
      if (incorrect.length > 0 || independentSelectionError.length > 0 || selectionSubtype.length > 0 || timingSubtype.length > 0) return { answer: 'NÃO', supportingEvidence: unique([...incorrect, ...independentSelectionError, ...selectionSubtype, ...timingSubtype]), rationale: 'Evidence supports an independent implemented but inadequate action, selection, or execution timing.' }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Correctness of action is not established.' }
    }
    case 'A_CAPABILITY': {
      const physical = c('physicalActionLimitation')
      const knowledge = c('actionKnowledgeLimitation')
      const capabilityPresent = c('actionCapabilityPresent')
      if (physical.length > 0) return { answer: 'NÃO_INABILIDADE', supportingEvidence: physical, rationale: 'Evidence supports physical/capability limitation.' }
      if (knowledge.length > 0) return { answer: 'NÃO_CONHECIMENTO', supportingEvidence: knowledge, rationale: 'Evidence supports knowledge/skill limitation.' }
      const specificActionMechanism = unique([
        ...c('selectionSubtype'),
        ...c('feedbackSubtype'),
        ...c('timeManagementAction'),
      ])
      if (capabilityPresent.length > 0) return {
        answer: 'SIM',
        supportingEvidence: capabilityPresent,
        rationale: 'Positive evidence independently establishes the knowledge/capability needed to form and implement an appropriate action.',
      }
      if (specificActionMechanism.length > 0) {
        if (semanticInterpretationPresent(ctx)) return {
          answer: 'INSUFFICIENT_EVIDENCE',
          supportingEvidence: specificActionMechanism,
          rationale: 'An identifiable action subtype does not establish knowledge, skill, or capability. Positive capability evidence is required before subtype discrimination can continue.',
        }
        // Historical V1/lexical fixtures predate the explicit actionCapabilityPresent concept.
        // Preserve their established behavior without weakening the canonical V2 AI contract.
        return {
          answer: 'SIM',
          supportingEvidence: specificActionMechanism,
          rationale: 'Legacy evidence contract uses a specific action subtype as the capability continuation signal; V2 requires independent positive capability evidence.',
        }
      }
      return { answer: 'INSUFFICIENT_EVIDENCE', supportingEvidence: [], rationale: 'Action capability cannot be assumed without positive evidence.' }
    }
    case 'A_TIME_PRESSURE': {
      const feedbackFailed = c('feedbackUnderPressureFailed')
      const selectionFailed = c('selectionUnderPressureFailed')
      const feedback = c('feedbackSubtype')
      const rushed = c('timeManagementAction')
      const selection = c('selectionSubtype')
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
  const directRootClarification = ctx.node.nodeId.endsWith('_ROOT')
    ? directNodeClarificationStatements(ctx)
    : []
  // Root questions are descriptive (Hendy Step 2), not binary classification
  // decisions. A substantive response explicitly linked to the active canonical root
  // is sufficient to establish the descriptive P/O/A statement and continue to the
  // first decision node. It never selects a terminal code by itself.
  const decision: Decision = directRootClarification.length > 0
    ? {
        answer: 'START',
        supportingEvidence: directRootClarification.slice(0, 2),
        rationale: 'A factual clarification response directly answers this canonical descriptive root; traversal may continue without inferring a leaf from that response alone.',
      }
    : ctx.axis === 'P'
      ? decideP(ctx.node.nodeId, statements, ctx)
      : ctx.axis === 'O'
        ? decideO(ctx.node.nodeId, statements, ctx)
        : decideA(ctx.node.nodeId, statements, ctx)

  const branchTarget = decision.answer === 'INSUFFICIENT_EVIDENCE'
    ? null
    : ctx.node.branchMap[decision.answer]

  const terminalCode = branchTarget?.includes('-') ? branchTarget : null
  const nextNodeId = branchTarget && !terminalCode ? branchTarget : null
  const supportingEvidence = unique(decision.supportingEvidence).slice(0, 4)
  const counterEvidenceMatches = decisionMatching(ctx, statements, [/\b(does not establish|not established|not clearly established|unclear whether)\b/i])
  const counterEvidence = counterEvidenceMatches.length
    ? counterEvidenceMatches.slice(0, 3)
    : []

  return {
    nodeId: ctx.node.nodeId,
    question: ctx.node.question,
    exactQuestionTextENAnchor: ctx.node.exactQuestionTextENAnchor,
    answer: branchTarget ? decision.answer : 'INSUFFICIENT_EVIDENCE',
    responseText: ctx.node.nodeId.endsWith('_ROOT')
      ? (branchTarget ? rootResponseText(ctx, supportingEvidence) : insufficientRootResponse(ctx.axis, ctx.locale))
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
