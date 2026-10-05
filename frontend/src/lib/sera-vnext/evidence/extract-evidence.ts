import type { SeraFact, SeraSemanticEvidenceAnnotation, SeraSupplementalEvidenceInput, SeraTimelineItem } from '../engine-contract'
import { confidenceFromCount } from '../engine-v0/utils'
import { isNonCausalDocumentStatement, isProcedureReferenceStatement, isSystemDescriptionStatement } from '../engine-v0/factual-extraction-helpers'
import { hasConcept, type SeraEvidenceConcept } from '../engine-v02/language/concepts'
import { detectEvidenceActor, classifyActorRelation, classifyActorRelationForActor } from './actor-scope'
import { classifyTemporalRelation } from './temporal-scope'
import type { SeraEvidenceItem, SeraEvidenceUse } from './types'

function pushUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) target.push(value)
}

function classifyEvidenceType(statement: string, category: SeraFact['category'], sourceSection?: SeraFact['sourceSection']): SeraEvidenceItem['evidenceType'] {
  if (isNonCausalDocumentStatement(statement) || sourceSection === 'ADMINISTRATIVE') return 'NON_CAUSAL_DOCUMENT'
  if (sourceSection === 'REPORT_ANALYSIS' || sourceSection === 'RECOMMENDATION') return 'UNSUPPORTED_REPORT_ANALYSIS'
  if (/\b(probable cause|conclusion|recommendation|hfacs|risk\/erc|arms\/erc|causa provável|recomendação|report focuses|report does not describe|report only mentions|relat[oó]rio foca|relat[oó]rio (?:n[aã]o )?descreve|par[aá]grafo .* menciona apenas|n[aã]o h[aá] descri[cç][aã]o|n[aã]o ficou registrado)\b/i.test(statement)) return 'UNSUPPORTED_REPORT_ANALYSIS'
  if (/\b(considera|considerou|avalia|avaliou|conclui|concluiu|entende|entendeu|considers?|considered|assesses?|assessed|concludes?|concluded)\b.*\b(barreira(?: de seguran[cç]a)?|safety barrier|ponto de fuga|escape point|opera[cç][aã]o segura|safe operation)\b/i.test(statement)) return 'UNSUPPORTED_REPORT_ANALYSIS'
  if (isProcedureReferenceStatement(statement)) return 'REFERENCE_PROCEDURE'
  if (isSystemDescriptionStatement(statement)) return 'SYSTEM_DESCRIPTION'
  if (category === 'outcome') return 'OUTCOME'
  if (['decision', 'control_input', 'action'].includes(category)) return 'ACTION_OR_DECISION'
  if (['cue', 'warning'].includes(category)) return 'REPORTED_CUE'
  if (['condition', 'environment', 'timeline'].includes(category)) return 'CONTEXT'
  return 'OBSERVED_FACT'
}

function statementHasAnyConcept(statement: string, concepts: SeraEvidenceConcept[]): boolean {
  return concepts.some((concept) => hasConcept([statement], concept))
}

function classifySupportedUses(statement: string, category: SeraFact['category'], evidenceType: SeraEvidenceItem['evidenceType']): SeraEvidenceUse[] {
  if (['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(evidenceType)) return []
  const supports: SeraEvidenceUse[] = []
  const positiveTrainingProvision = /\b(programa de treinamento|training program|treinamentos?|training)\b.*\b(inclu[ií]a|inclu[ií]do|integrad[oa]s?|contemplava|previa|provided|included|integrated|completed|realizado|realizados|ministrado|recebeu|received)\b/i.test(statement)
    && !/\b(falta|lacuna|insuficient|inadequad|n[aã]o recebeu|n[aã]o realizou|n[aã]o treinad|lack|gap|insufficient|inadequate|not trained|did not receive)\b/i.test(statement)
  const normalState = /\b(treinamentos?|habilita[cç][oõ]es?|certificados?|cma|cht)\b.*\b(em dia|v[aá]lid[oa]s?|current|valid)\b|\b(situa[cç][aã]o t[eé]cnica normal|coordenadas? (?:foram )?inseridas? normalmente|checklists? (?:foram )?lidos?)\b/i.test(statement)
    || positiveTrainingProvision
  if (['action', 'decision', 'control_input'].includes(category)) pushUnique(supports, 'ACTION')
  if (/\b(crew|pilot|captain|continued|decided|moved|turned|descended|approach|lever|line(?:d)? up|go-around|executed|failed to|did not|tripula[cç][aã]o|piloto|comandante|continuou|continuei|decidiu|decidi|resolvi|escolhi|preferi|julguei|tirei|retirei|desguarneci|puxei|moveu|virou|desceu|aproxima[cç][aã]o|manete|alinhou|arremetida|executou|falhou|n[aã]o)\b/i.test(statement)) pushUnique(supports, 'ESCAPE_POINT')
  if (/\b(perceiv\w*|notic\w*|recogniz\w*|warning|alert|cue|visual|visibility|cloud|fog|night|instrument|deviation|awareness|information|ambiguous|misleading|did not see|failed to notice|horizon|visual reference|visual references|reference points|sense of height|message|meaning|display|percebeu|percebi|perceber|notou|notei|notar|reconheceu|reconheci|reconhecer|identificou|identifiquei|identificar|confundiu|confundi|avistou|avistei|avistar|observou|observei|enxergou|enxerguei|viu|vi|vimos|viram|sabia|sabiamos|sabiam|ciente|consciente|achei|achava|acreditei|acreditava|pensei|pensava|entendi|entendia|saw|knew|aware|distinguir|acreditando|tratar-se|gps|fms|sistema de navega[cç][aã]o|dados? corret[ao]s?|plano|planejamento|coordenadas?|rota prevista|destino previsto|autoriza[cç][aã]o|proa direta|alerta|pista visual|visibilidade|nuvem|nevoeiro|noite|instrumento|desvio|consci[eê]ncia|informa[cç][aã]o|amb[ií]gu[ao]|enganos[ao]|n[aã]o viu|falhou em notar|horizonte|refer[eê]ncia visual|refer[eê]ncias visuais|pontos? de refer[eê]ncia|no[cç][aã]o de altura|mensagem|atualiza[cç][aã]o|despacho|identificador|significado|painel)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(surface|superf[ií]cie)\b.*\b(dark|darkened|escura|escuro)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(n[aã]o havia recebido|nunca havia recebido|n[aã]o recebeu|n[aã]o sabia|n[aã]o conhecia|desconhecia|n[aã]o familiar|falta de conhecimento|falta de treinamento|treinamento insuficiente|not trained|lack of knowledge|lack of training|unfamiliar)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(objective|goal|intent|decided|continued|chose|planned|approach|takeoff|go-around|discontinued|aborted|despite warning|wrong runway|wrong surface|known rule|conscious|deliberate|violation|deviation|objetivo|meta|inten[cç][aã]o|decidiu|decidi|decidiram|decidimos|resolveu|resolvi|resolveram|resolvemos|continuou|continuei|escolheu|escolhi|preferiu|preferi|julgou|julguei|optei|planejou|planejei|planejamento|rota prevista|destino previsto|autoriza[cç][aã]o|procedimentos previstos|aproxima[cç][aã]o|decolagem|arremetida|descontinuou|abortou|apesar do alerta|pista errada|superf[ií]cie errada|regra conhecida|sabia da regra|consciente|deliberad[ao]|viola[cç][aã]o|violar|desviar)\b/i.test(statement)) pushUnique(supports, 'OBJECTIVE')
  if (statementHasAnyConcept(statement, ['safeGoal', 'knownRule', 'explicitAwareness', 'consciousDeviation', 'routineDeviation', 'exceptionalDeviation', 'managedRisk', 'unmanagedRisk', 'efficiencyObjective'])) pushUnique(supports, 'OBJECTIVE')
  if (/\b(rota|plano|planejamento)\b.*\b(indicava|indicavam|previa|previam|definia|definiam|estabelecia|estabeleciam)\b.*\b(unit-[a-z0-9-]+|pcp-?[0-9]+|destino|unidade|plataforma|pista|helideck)\b/i.test(statement)) pushUnique(supports, 'OBJECTIVE')
  if (/\bdestino\s+inicial\s+(?:previst[ao]|planejad[ao]|programad[ao])(?:\s+e\s+autorizad[ao])?\s+(?:era|foi)\b/i.test(statement)) pushUnique(supports, 'OBJECTIVE')
  if (/\b(action|input|control|executed|turned|descended|climbed|moved|pulled|pushed|lever|line(?:d)? up|selected|configured|go-around|correction|continued below|below profile|readback|feedback|hesitated|delayed|waited|a[cç][aã]o|comando|controle|executou|executei|virou|virei|desceu|desci|subiu|subi|moveu|movi|puxou|puxei|empurrou|empurrei|tirou|tirei|retirou|retirei|desguarneci|pegou|peguei|desacoplou|desacoplei|cancelou|cancelei|colocou|coloquei|manete|alinhou|alinhei|selecionou|selecionei|configurou|configurei|inseriu|inseri|programou|programei|ajustou|ajustei|acionou|acionei|digitou|digitei|arremetida|corre[cç][aã]o|continuou abaixo|abaixo do perfil|colacionamento|retorno|hesitou|demorou|esperou)\b/i.test(statement)) pushUnique(supports, 'ACTION')
  if (/\b(nunca (?:fiz|havia feito).{0,140}sempre (?:instrui|instru[ií]|ensinei) contra)\b/i.test(statement)) pushUnique(supports, 'ACTION')
  if (statementHasAnyConcept(statement, ['inadequateAssessment']) && (/\b(iniciou|iniciaram|conduziu|conduziram|prosseguiu|prosseguiram|come[cç]ou|come[cç]aram|aproximou|aproximaram)\b.*\b(planejamento|aproxima[cç][aã]o)\b/i.test(statement) || /\b(passou a preparar|passou a conduzir|passou a aproximar)\b/i.test(statement))) pushUnique(supports, 'ACTION')
  if (statementHasAnyConcept(statement, ['adequateAssessment', 'inadequateAssessment', 'sensoryLimitation', 'knowledgeLimitation', 'perceptionCapabilityPresent', 'attentionPressure', 'timeManagementPressure', 'informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'])) pushUnique(supports, 'PERCEPTION')
  if (statementHasAnyConcept(statement, ['safeGoal', 'knownRule', 'explicitAwareness', 'consciousDeviation', 'routineDeviation', 'exceptionalDeviation', 'managedRisk', 'unmanagedRisk'])) pushUnique(supports, 'OBJECTIVE')
  if (statementHasAnyConcept(statement, ['safeAction', 'implementedAction', 'feedbackImplementationFailure', 'slipLapse', 'correctAction', 'incorrectAction', 'physicalActionLimitation', 'actionKnowledgeLimitation', 'actionCapabilityPresent', 'selectionUnderPressureFailed', 'feedbackUnderPressureFailed', 'selectionSubtype', 'feedbackSubtype', 'timeManagementAction'])) pushUnique(supports, 'ACTION')
  if (!normalState && /\b(visibility|fog|cloud|weather|wind|night|system|automation|warning|failure|fault|rudder|technical|training|knowledge|time pressure|rushed|dispatch|organizational|staffing|supervision|maintenance|coordination|intent|decided|decision|conscious|physical|fatigue|ergonomic|fmc|autothrottle|dafcs|trim|control law|visibilidade|nevoeiro|nuvem|tempo|vento|meteorolog\w*|icing|gelo|sev ice|severe icing|noite|sistema|automa[cç][aã]o|alerta|falha|leme|t[eé]cnic[ao]|treinamento|conhecimento|press[aã]o de tempo|apressad[ao]|despacho|organizacional|cultura|culture|tlb|registro formal|formal record|equipe|supervis[aã]o|manuten[cç][aã]o|coordena[cç][aã]o|inten[cç][aã]o|decis[aã]o|consciente|f[ií]sic[ao]|fadiga|cansa[cç]o|cansad[oa]|descanso|ergon[oô]mic[ao]|distra[cç][aã]o|vis[aã]o de t[uú]nel|focad[oa]s?|proximidade|pr[oó]xim[oa]s?)\b/i.test(statement)) pushUnique(supports, 'PRECONDITION')
  if (category === 'outcome') pushUnique(supports, 'LIMITATION')
  if (normalState) {
    return supports.filter((use) => !['PERCEPTION', 'OBJECTIVE', 'ACTION', 'PRECONDITION'].includes(use))
  }
  if (/^\s*\d+(?:\.\d+)*\s+(?:informa[cç][oõ]es sobre o evento|event information)\b/i.test(statement)) {
    return supports.filter((use) => !['PERCEPTION', 'OBJECTIVE', 'ACTION'].includes(use))
  }
  return supports
}

function classifyProhibitedUses(statement: string, temporalRelation: SeraEvidenceItem['temporalRelation'], evidenceType: SeraEvidenceItem['evidenceType'], assertionStatus: SeraEvidenceItem['assertionStatus'], occurrenceScope?: SeraEvidenceItem['occurrenceScope']): SeraEvidenceUse[] {
  const prohibited: SeraEvidenceUse[] = []
  if (occurrenceScope === 'HISTORICAL_COMPARATOR' || occurrenceScope === 'PRE_EVENT_CAUSAL_HISTORY') {
    pushUnique(prohibited, 'ESCAPE_POINT')
    pushUnique(prohibited, 'PERCEPTION')
    pushUnique(prohibited, 'OBJECTIVE')
    pushUnique(prohibited, 'ACTION')
    // External comparators are never causal evidence for this occurrence. Prior numbered
    // legs of the same occurrence aircraft are different: they remain eligible only as
    // pre-event causal history for preconditions.
    if (occurrenceScope === 'HISTORICAL_COMPARATOR') pushUnique(prohibited, 'PRECONDITION')
  }
  if (temporalRelation === 'POST_ESCAPE') {
    pushUnique(prohibited, 'ESCAPE_POINT')
    pushUnique(prohibited, 'PERCEPTION')
    pushUnique(prohibited, 'OBJECTIVE')
    pushUnique(prohibited, 'ACTION')
  }
  if (evidenceType === 'OUTCOME' || evidenceType === 'UNSUPPORTED_REPORT_ANALYSIS' || assertionStatus !== 'AFFIRMED') {
    pushUnique(prohibited, 'ESCAPE_POINT')
    pushUnique(prohibited, 'PERCEPTION')
    pushUnique(prohibited, 'OBJECTIVE')
    pushUnique(prohibited, 'ACTION')
    if (evidenceType === 'UNSUPPORTED_REPORT_ANALYSIS' || assertionStatus !== 'AFFIRMED') pushUnique(prohibited, 'PRECONDITION')
  }
  if (['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(evidenceType)) {
    pushUnique(prohibited, 'ESCAPE_POINT')
    pushUnique(prohibited, 'PERCEPTION')
    pushUnique(prohibited, 'OBJECTIVE')
    pushUnique(prohibited, 'ACTION')
    pushUnique(prohibited, 'PRECONDITION')
  }
  if (/\b(hfacs|risk\/erc|arms\/erc|probable cause|recommendation)\b/i.test(statement)) {
    pushUnique(prohibited, 'PERCEPTION')
    pushUnique(prohibited, 'OBJECTIVE')
    pushUnique(prohibited, 'ACTION')
    pushUnique(prohibited, 'PRECONDITION')
  }
  return prohibited
}

function classifyRelationship(item: Omit<SeraEvidenceItem, 'relationshipToFailure'>): SeraEvidenceItem['relationshipToFailure'] {
  if (item.temporalRelation === 'POST_ESCAPE' || item.evidenceType === 'OUTCOME') return 'POST_ESCAPE_CONSEQUENCE'
  if (item.supports.includes('ESCAPE_POINT') && ['DIRECT_ACTOR', 'UNKNOWN'].includes(item.actorRelation)) return 'DIRECT_ESCAPE_POINT'
  if (item.supports.includes('PRECONDITION')) {
    return item.actorRelation === 'CONTEXT_ACTOR' || item.actorRelation === 'SYSTEM_ENVIRONMENT'
      ? 'CONTEXTUAL_PRECONDITION'
      : 'ENABLING_PRECONDITION'
  }
  return 'UNRELATED_OR_UNSUPPORTED'
}

export function extractEvidenceItems(args: {
  facts: SeraFact[]
  timeline: SeraTimelineItem[]
  directActor?: string | null
  latestEscapeSentenceIndex?: number | null
  escapePointStatement?: string | null
}): SeraEvidenceItem[] {
  const timelineByStatement = new Map(args.timeline.map((item) => [item.statement, item]))
  const inferredActorFor = (statement: string, sourceSentenceIndex: number): string | null => {
    const explicit = detectEvidenceActor(statement)
    if (explicit) return explicit
    if (!/^\s*(em seguida|na sequ[eê]ncia|logo ap[oó]s|depois|then|subsequently|afterward)\b/i.test(statement)) return null
    const prior = args.timeline
      .filter((item) => item.sourceSentenceIndex < sourceSentenceIndex)
      .sort((a, b) => b.sourceSentenceIndex - a.sourceSentenceIndex)
      .slice(0, 3)
    for (const item of prior) {
      const actor = detectEvidenceActor(item.statement)
      if (actor) return actor
    }
    return null
  }
  return args.facts.map((fact, index) => {
    const timelineItem = timelineByStatement.get(fact.statement)
    const sourceSentenceIndex = timelineItem?.sourceSentenceIndex ?? fact.sourceSentenceIndex
    const sourceSection = fact.sourceSection ?? timelineItem?.sourceSection ?? 'UNKNOWN'
    const occurrenceScope = fact.occurrenceScope ?? timelineItem?.occurrenceScope ?? 'UNKNOWN'
    const inferredTemporalRelation = classifyTemporalRelation({
      statement: fact.statement,
      sourceSentenceIndex,
      latestEscapeSentenceIndex: args.latestEscapeSentenceIndex,
      escapePointStatement: args.escapePointStatement,
      sourceSection,
    })
    const temporalRelation = occurrenceScope === 'HISTORICAL_COMPARATOR'
      ? 'UNKNOWN' as const
      : occurrenceScope === 'PRE_EVENT_CAUSAL_HISTORY'
        ? 'PRE_ESCAPE' as const
        : inferredTemporalRelation
    const actor = inferredActorFor(fact.statement, sourceSentenceIndex)
    const actorRelation = actor
      ? classifyActorRelationForActor(actor, args.directActor ?? null)
      : classifyActorRelation({ statement: fact.statement, directActor: args.directActor ?? null })
    const assertionStatus = fact.assertionStatus ?? timelineItem?.assertionStatus ?? 'AFFIRMED'
    const evidenceType = classifyEvidenceType(fact.statement, fact.category, sourceSection)
    const supports = classifySupportedUses(fact.statement, fact.category, evidenceType)
    const prohibitedFor = classifyProhibitedUses(fact.statement, temporalRelation, evidenceType, assertionStatus, occurrenceScope)
    const base = {
      evidenceId: `EVID-${index + 1}`,
      statement: fact.statement,
      category: fact.category,
      sourceSentenceIndex,
      sourceSection,
      assertionStatus,
      occurrenceScope,
      temporalRelation,
      actorRelation,
      actor,
      evidenceType,
      supports,
      contradicts: [],
      prohibitedFor,
      confidence: confidenceFromCount(supports.length),
      rationale: [
        `temporalRelation=${temporalRelation}`,
        `actorRelation=${actorRelation}`,
        `evidenceType=${evidenceType}`,
        `sourceSection=${sourceSection}`,
        `assertionStatus=${assertionStatus}`,
        `occurrenceScope=${occurrenceScope}`,
      ],
    } satisfies Omit<SeraEvidenceItem, 'relationshipToFailure'>

    return {
      ...base,
      relationshipToFailure: classifyRelationship(base),
    }
  })
}

export function applySemanticAnnotationsToEvidence(args: {
  items: SeraEvidenceItem[]
  annotations?: SeraSemanticEvidenceAnnotation[]
  directActor?: string | null
  canonicalEscapeSentenceIndex?: number | null
  semanticSchemaVersion?: 'SERA_SEMANTIC_AI_V1' | 'SERA_SEMANTIC_AI_V2' | null
}): SeraEvidenceItem[] {
  if (!args.annotations?.length) return args.items

  const perceptionConcepts = new Set([
    'adequateAssessment', 'inadequateAssessment', 'sensoryLimitation', 'knowledgeLimitation',
    'perceptionCapabilityPresent', 'attentionPressure', 'timeManagementPressure',
    'informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable',
  ])
  const objectiveConcepts = new Set([
    'safeGoal', 'knownRule', 'explicitAwareness', 'consciousDeviation', 'routineDeviation',
    'exceptionalDeviation', 'managedRisk', 'unmanagedRisk', 'efficiencyObjective',
  ])
  const actionConcepts = new Set([
    'safeAction', 'implementedAction', 'feedbackImplementationFailure', 'slipLapse',
    'proceduralOmission', 'implementationMismatch',
    'correctAction', 'incorrectAction', 'physicalActionLimitation', 'actionKnowledgeLimitation',
    'actionCapabilityPresent', 'selectionUnderPressureFailed', 'feedbackUnderPressureFailed',
    'selectionSubtype', 'feedbackSubtype', 'timeManagementAction',
  ])

  const semanticItems = args.annotations.map((annotation, index): SeraEvidenceItem => {
    const source = args.items.find((item) => item.sourceSentenceIndex === annotation.sourceSentenceIndex)
    const roles = annotation.roles
    const concepts = annotation.confidence === 'LOW' ? [] : (annotation.concepts ?? [])
    const supports: SeraEvidenceUse[] = []
    if (roles.some((role) => ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'DIRECT_ACTOR'].includes(role))) pushUnique(supports, 'ESCAPE_POINT')
    if (roles.includes('PERCEPTION_STATE') || concepts.some((concept) => perceptionConcepts.has(concept))) pushUnique(supports, 'PERCEPTION')
    if (roles.includes('OBJECTIVE_INTENT') || concepts.some((concept) => objectiveConcepts.has(concept))) pushUnique(supports, 'OBJECTIVE')
    if (roles.some((role) => role === 'ACTION_STRATEGY' || role === 'ACTION_MECHANISM' || role === 'CRITICAL_UNSAFE_ACT') || annotation.actionFailureMechanism && annotation.actionFailureMechanism !== 'NONE_OR_UNKNOWN' || concepts.some((concept) => actionConcepts.has(concept))) pushUnique(supports, 'ACTION')
    if (roles.some((role) => role === 'PRECONDITION' || role === 'BARRIER')) pushUnique(supports, 'PRECONDITION')
    if (roles.includes('OUTCOME')) pushUnique(supports, 'LIMITATION')

    let temporalRelation = annotation.temporalRelation === 'UNKNOWN'
      ? source?.temporalRelation ?? 'UNKNOWN'
      : annotation.temporalRelation
    const afterCanonicalEscape = args.canonicalEscapeSentenceIndex != null
      && annotation.sourceSentenceIndex > args.canonicalEscapeSentenceIndex
    if (args.semanticSchemaVersion === 'SERA_SEMANTIC_AI_V2') {
      // V2 temporal meaning is supplied by the semantic layer and structurally checked by
      // semantic-integrity. Only a later occurrence landmark/outcome is forced POST_ESCAPE;
      // retrospective P/O/A/precondition statements keep the time they explicitly describe.
      if (afterCanonicalEscape && roles.some((role) => role === 'CRITICAL_UNSAFE_ACT' || role === 'OUTCOME')) {
        temporalRelation = 'POST_ESCAPE'
      }
    } else {
      const retrospectiveAtEscape = /\b(naquele momento|naquela hora|na hora|eu (?:acreditava|achava|sabia|pretendia|queria)|a percep[cç][aã]o que .* tinha|o objetivo (?:era|foi)|com o objetivo de|pra ajudar|para ajudar|proativ\w*|at that moment|at the time|believed|thought|knew|intended|wanted)\b/i.test(annotation.sourceQuote)
      const explicitLaterOperationalAct = roles.includes('CRITICAL_UNSAFE_ACT')
        || /\b(tomei o comando|assumi os comandos|recuperei|abandonei a miss[aã]o|barra na barra|desacoplou|cancelou o automatismo|stick pusher|afterward|took control|recovered)\b/i.test(annotation.sourceQuote)
      if (afterCanonicalEscape && (explicitLaterOperationalAct || (source?.temporalRelation === 'POST_ESCAPE' && !retrospectiveAtEscape))) {
        temporalRelation = 'POST_ESCAPE'
      }
    }
    const occurrenceScope = annotation.occurrenceScope === 'UNKNOWN'
      ? source?.occurrenceScope ?? 'UNKNOWN'
      : annotation.occurrenceScope
    const actorRelation = annotation.actor
      ? classifyActorRelationForActor(annotation.actor, args.directActor ?? null)
      : args.semanticSchemaVersion === 'SERA_SEMANTIC_AI_V2'
        ? 'UNKNOWN' as const
        : source?.actorRelation ?? classifyActorRelation({ statement: annotation.sourceQuote, directActor: args.directActor ?? null })
    // A sentence may describe an unsafe act/decision and its consequence together. In that
    // mixed case, preserve the actionable semantic role as the primary evidence type; treating
    // the entire sentence as OUTCOME would prohibit the very P/O/A evidence it contains.
    const evidenceType: SeraEvidenceItem['evidenceType'] = roles.some((role) =>
      ['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT', 'OBJECTIVE_INTENT', 'ACTION_STRATEGY', 'ACTION_MECHANISM'].includes(role),
    )
      ? 'ACTION_OR_DECISION'
      : roles.includes('OUTCOME')
        ? 'OUTCOME'
        : roles.includes('PERCEPTION_STATE')
          ? 'REPORTED_CUE'
          : roles.some((role) => ['PRECONDITION', 'BARRIER', 'CONTEXT'].includes(role))
            ? 'CONTEXT'
            : source?.evidenceType ?? 'OBSERVED_FACT'
    const prohibitedFor = classifyProhibitedUses(
      annotation.sourceQuote,
      temporalRelation,
      evidenceType,
      annotation.assertionStatus,
      occurrenceScope,
    )
    const base = {
      evidenceId: `SEM-${annotation.id || index + 1}`,
      statement: annotation.sourceQuote,
      category: source?.category ?? 'other',
      sourceSentenceIndex: annotation.sourceSentenceIndex,
      sourceSection: source?.sourceSection ?? 'FACTUAL',
      assertionStatus: annotation.assertionStatus,
      occurrenceScope,
      temporalRelation,
      actorRelation,
      actor: annotation.actor,
      evidenceType,
      supports,
      contradicts: [],
      prohibitedFor,
      confidence: annotation.confidence,
      collectionSource: 'AI_SEMANTIC_EXTRACTION' as const,
      semanticRoles: roles,
      semanticConcepts: concepts,
      semanticPreconditionCategory: annotation.preconditionCategory ?? null,
      semanticPreconditionCausalStatus: annotation.preconditionCausalStatus ?? null,
      semanticPreconditionCausalTargetQuote: annotation.preconditionCausalTargetQuote ?? null,
      semanticActionFailureMechanism: annotation.actionFailureMechanism ?? null,
      semanticActionMechanismEvidenceQuote: annotation.actionMechanismEvidenceQuote ?? null,
      semanticDisplayInterpretation: annotation.displayInterpretation ?? null,
      semanticConfidence: annotation.confidence,
      semanticSchemaVersion: args.semanticSchemaVersion ?? null,
      semanticSource: 'AI_SEMANTIC_EXTRACTION' as const,
      rationale: [
        ...(annotation.rationale ? [annotation.rationale] : []),
        `semanticRoles=${roles.join(',') || 'NONE'}`,
        `semanticConcepts=${concepts.join(',') || 'NONE'}`,
        'semanticSource=AI_SEMANTIC_EXTRACTION',
      ],
    } satisfies Omit<SeraEvidenceItem, 'relationshipToFailure'>
    const relationshipToFailure = roles.includes('PRECONDITION')
      ? annotation.preconditionCausalStatus === 'SOURCE_LINKED'
        ? classifyRelationship(base)
        : 'UNRELATED_OR_UNSUPPORTED' as const
      : classifyRelationship(base)
    return { ...base, relationshipToFailure }
  })

  return [...args.items, ...semanticItems]
}

export function extractSupplementalEvidenceItems(args: {
  items: SeraSupplementalEvidenceInput[]
  directActor?: string | null
  sourceSentenceIndex: number
}): SeraEvidenceItem[] {
  return args.items.map((item, index) => {
    const category: SeraFact['category'] = 'other'
    const sourceSection: SeraFact['sourceSection'] = 'FACTUAL'
    const assertionStatus: SeraEvidenceItem['assertionStatus'] = 'AFFIRMED'
    const actor = detectEvidenceActor(item.statement)
    const actorRelation = classifyActorRelation({ statement: item.statement, directActor: args.directActor ?? null })
    const evidenceType = classifyEvidenceType(item.statement, category, sourceSection)
    const supports = classifySupportedUses(item.statement, category, evidenceType)
    const clarificationUse: SeraEvidenceUse | null = item.stage === 'PERCEPTION'
      ? 'PERCEPTION'
      : item.stage === 'OBJECTIVE'
        ? 'OBJECTIVE'
        : item.stage === 'ACTION'
          ? 'ACTION'
          : null
    // A clarification response is collected in direct answer to a stage-specific
    // question. Preserve that provenance even when the short answer itself does not
    // repeat lexical markers such as "objective" or "intention". This only admits
    // the response to the requested P/O/A lane; node evaluation still decides whether
    // the content is sufficient to take a canonical branch.
    if (clarificationUse && !['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION', 'UNSUPPORTED_REPORT_ANALYSIS', 'OUTCOME'].includes(evidenceType)) {
      pushUnique(supports, clarificationUse)
    }
    const inferredTemporalRelation = classifyTemporalRelation({
      statement: item.statement,
      sourceSentenceIndex: args.sourceSentenceIndex,
      sourceSection,
    })
    const temporalRelation = inferredTemporalRelation === 'POST_ESCAPE' || inferredTemporalRelation === 'PRE_ESCAPE'
      ? inferredTemporalRelation
      : item.temporalRelation
    const occurrenceScope = 'CURRENT_EVENT' as const
    const prohibitedFor = classifyProhibitedUses(item.statement, temporalRelation, evidenceType, assertionStatus, occurrenceScope)
    const base = {
      evidenceId: item.evidenceId || `SUP-EVID-${index + 1}`,
      statement: item.statement,
      category,
      sourceSentenceIndex: args.sourceSentenceIndex,
      sourceSection,
      assertionStatus,
      occurrenceScope,
      temporalRelation,
      actorRelation,
      actor,
      evidenceType,
      supports,
      contradicts: [],
      prohibitedFor,
      confidence: confidenceFromCount(supports.length),
      collectionSource: 'CLARIFICATION_RESPONSE' as const,
      linkedQuestionId: item.linkedQuestionId,
      clarificationStage: item.stage,
      rationale: [
        `temporalRelation=${temporalRelation}`,
        `actorRelation=${actorRelation}`,
        `evidenceType=${evidenceType}`,
        'sourceSection=FACTUAL',
        'assertionStatus=AFFIRMED',
        'collectionSource=CLARIFICATION_RESPONSE',
        `linkedQuestionId=${item.linkedQuestionId}`,
        `clarificationStage=${item.stage}`,
      ],
    } satisfies Omit<SeraEvidenceItem, 'relationshipToFailure'>
    return { ...base, relationshipToFailure: classifyRelationship(base) }
  })
}
