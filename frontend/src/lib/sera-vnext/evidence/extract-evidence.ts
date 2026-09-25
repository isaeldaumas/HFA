import type { SeraFact, SeraSupplementalEvidenceInput, SeraTimelineItem } from '../engine-contract'
import { confidenceFromCount } from '../engine-v0/utils'
import { hasConcept, type SeraEvidenceConcept } from '../engine-v02/language/concepts'
import { detectEvidenceActor, classifyActorRelation } from './actor-scope'
import { classifyTemporalRelation } from './temporal-scope'
import type { SeraEvidenceItem, SeraEvidenceUse } from './types'

function pushUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) target.push(value)
}

function classifyEvidenceType(statement: string, category: SeraFact['category'], sourceSection?: SeraFact['sourceSection']): SeraEvidenceItem['evidenceType'] {
  if (sourceSection === 'REPORT_ANALYSIS' || sourceSection === 'RECOMMENDATION') return 'UNSUPPORTED_REPORT_ANALYSIS'
  if (/\b(probable cause|conclusion|recommendation|hfacs|risk\/erc|arms\/erc|causa provável|recomendação|report focuses|report does not describe|report only mentions|relat[oó]rio foca|relat[oó]rio (?:n[aã]o )?descreve|par[aá]grafo .* menciona apenas|n[aã]o h[aá] descri[cç][aã]o|n[aã]o ficou registrado)\b/i.test(statement)) return 'UNSUPPORTED_REPORT_ANALYSIS'
  if (category === 'outcome') return 'OUTCOME'
  if (['decision', 'control_input', 'action'].includes(category)) return 'ACTION_OR_DECISION'
  if (['cue', 'warning'].includes(category)) return 'REPORTED_CUE'
  if (['condition', 'environment', 'timeline'].includes(category)) return 'CONTEXT'
  return 'OBSERVED_FACT'
}

function statementHasAnyConcept(statement: string, concepts: SeraEvidenceConcept[]): boolean {
  return concepts.some((concept) => hasConcept([statement], concept))
}

function classifySupportedUses(statement: string, category: SeraFact['category']): SeraEvidenceUse[] {
  const supports: SeraEvidenceUse[] = []
  const normalState = /\b(treinamentos?|habilita[cç][oõ]es?|certificados?|cma|cht)\b.*\b(em dia|v[aá]lid[oa]s?|current|valid)\b|\b(situa[cç][aã]o t[eé]cnica normal|coordenadas? (?:foram )?inseridas? normalmente|checklists? (?:foram )?lidos?)\b/i.test(statement)
  if (['action', 'decision', 'control_input'].includes(category)) pushUnique(supports, 'ACTION')
  if (/\b(crew|pilot|captain|continued|decided|moved|turned|descended|approach|lever|line(?:d)? up|go-around|executed|failed to|did not|tripula[cç][aã]o|piloto|comandante|continuou|decidiu|moveu|virou|desceu|aproxima[cç][aã]o|manete|alinhou|arremetida|executou|falhou|n[aã]o)\b/i.test(statement)) pushUnique(supports, 'ESCAPE_POINT')
  if (/\b(perceiv\w*|notic\w*|recogniz\w*|warning|alert|cue|visual|visibility|cloud|fog|night|instrument|deviation|awareness|information|ambiguous|misleading|did not see|failed to notice|horizon|visual reference|visual references|reference points|sense of height|message|meaning|display|percebeu|perceber|notou|notar|reconheceu|reconhecer|identificou|identificar|confundiu|avistou|avistar|observou|enxergou|distinguir|acreditando|tratar-se|gps|fms|sistema de navega[cç][aã]o|dados? corret[ao]s?|plano|planejamento|coordenadas?|rota prevista|destino previsto|autoriza[cç][aã]o|proa direta|alerta|pista visual|visibilidade|nuvem|nevoeiro|noite|instrumento|desvio|consci[eê]ncia|informa[cç][aã]o|amb[ií]gu[ao]|enganos[ao]|n[aã]o viu|falhou em notar|horizonte|refer[eê]ncia visual|refer[eê]ncias visuais|pontos? de refer[eê]ncia|no[cç][aã]o de altura|mensagem|atualiza[cç][aã]o|despacho|identificador|significado|painel)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(surface|superf[ií]cie)\b.*\b(dark|darkened|escura|escuro)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(n[aã]o havia recebido|nunca havia recebido|n[aã]o recebeu|n[aã]o sabia|n[aã]o conhecia|desconhecia|n[aã]o familiar|falta de conhecimento|falta de treinamento|treinamento insuficiente|not trained|lack of knowledge|lack of training|unfamiliar)\b/i.test(statement)) pushUnique(supports, 'PERCEPTION')
  if (/\b(objective|goal|intent|decided|continued|chose|planned|approach|takeoff|go-around|discontinued|aborted|despite warning|wrong runway|wrong surface|known rule|conscious|deliberate|violation|deviation|objetivo|meta|inten[cç][aã]o|decidiu|continuou|escolheu|planejou|planejamento|rota prevista|destino previsto|autoriza[cç][aã]o|procedimentos previstos|aproxima[cç][aã]o|decolagem|arremetida|descontinuou|abortou|apesar do alerta|pista errada|superf[ií]cie errada|regra conhecida|sabia da regra|consciente|deliberad[ao]|viola[cç][aã]o|violar|desviar)\b/i.test(statement)) pushUnique(supports, 'OBJECTIVE')
  if (/\b(action|input|control|executed|turned|descended|climbed|moved|pulled|pushed|lever|line(?:d)? up|selected|configured|go-around|correction|continued below|below profile|readback|feedback|hesitated|delayed|waited|a[cç][aã]o|comando|controle|executou|virou|desceu|subiu|moveu|puxou|empurrou|manete|alinhou|selecionou|configurou|inseriu|programou|ajustou|acionou|digitou|arremetida|corre[cç][aã]o|continuou abaixo|abaixo do perfil|colacionamento|retorno|hesitou|demorou|esperou)\b/i.test(statement)) pushUnique(supports, 'ACTION')
  if (statementHasAnyConcept(statement, ['adequateAssessment', 'inadequateAssessment', 'sensoryLimitation', 'knowledgeLimitation', 'perceptionCapabilityPresent', 'attentionPressure', 'timeManagementPressure', 'informationAmbiguous', 'informationAvailableCorrect', 'informationUnavailable'])) pushUnique(supports, 'PERCEPTION')
  if (statementHasAnyConcept(statement, ['safeGoal', 'knownRule', 'explicitAwareness', 'consciousDeviation', 'routineDeviation', 'exceptionalDeviation', 'managedRisk', 'unmanagedRisk'])) pushUnique(supports, 'OBJECTIVE')
  if (statementHasAnyConcept(statement, ['safeAction', 'implementedAction', 'feedbackImplementationFailure', 'slipLapse', 'correctAction', 'incorrectAction', 'physicalActionLimitation', 'actionKnowledgeLimitation', 'actionCapabilityPresent', 'selectionUnderPressureFailed', 'feedbackUnderPressureFailed', 'selectionSubtype', 'feedbackSubtype', 'timeManagementAction'])) pushUnique(supports, 'ACTION')
  if (!normalState && /\b(visibility|fog|cloud|weather|wind|night|system|automation|warning|failure|fault|rudder|technical|training|knowledge|time pressure|rushed|dispatch|organizational|staffing|supervision|maintenance|coordination|intent|decided|decision|conscious|physical|fatigue|ergonomic|fmc|autothrottle|dafcs|trim|control law|visibilidade|nevoeiro|nuvem|tempo|vento|meteorolog|noite|sistema|automa[cç][aã]o|alerta|falha|leme|t[eé]cnic[ao]|treinamento|conhecimento|press[aã]o de tempo|apressad[ao]|despacho|organizacional|equipe|supervis[aã]o|manuten[cç][aã]o|coordena[cç][aã]o|inten[cç][aã]o|decis[aã]o|consciente|f[ií]sic[ao]|fadiga|ergon[oô]mic[ao]|distra[cç][aã]o|vis[aã]o de t[uú]nel|focad[oa]s?|proximidade|pr[oó]xim[oa]s?)\b/i.test(statement)) pushUnique(supports, 'PRECONDITION')
  if (category === 'outcome') pushUnique(supports, 'LIMITATION')
  return supports
}

function classifyProhibitedUses(statement: string, temporalRelation: SeraEvidenceItem['temporalRelation'], evidenceType: SeraEvidenceItem['evidenceType'], assertionStatus: SeraEvidenceItem['assertionStatus']): SeraEvidenceUse[] {
  const prohibited: SeraEvidenceUse[] = []
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
}): SeraEvidenceItem[] {
  const timelineByStatement = new Map(args.timeline.map((item) => [item.statement, item]))
  return args.facts.map((fact, index) => {
    const timelineItem = timelineByStatement.get(fact.statement)
    const sourceSentenceIndex = timelineItem?.sourceSentenceIndex ?? fact.sourceSentenceIndex
    const sourceSection = fact.sourceSection ?? timelineItem?.sourceSection ?? 'UNKNOWN'
    const temporalRelation = classifyTemporalRelation({
      statement: fact.statement,
      sourceSentenceIndex,
      latestEscapeSentenceIndex: args.latestEscapeSentenceIndex,
      sourceSection,
    })
    const actor = detectEvidenceActor(fact.statement)
    const actorRelation = classifyActorRelation({ statement: fact.statement, directActor: args.directActor ?? null })
    const assertionStatus = fact.assertionStatus ?? timelineItem?.assertionStatus ?? 'AFFIRMED'
    const evidenceType = classifyEvidenceType(fact.statement, fact.category, sourceSection)
    const supports = classifySupportedUses(fact.statement, fact.category)
    const prohibitedFor = classifyProhibitedUses(fact.statement, temporalRelation, evidenceType, assertionStatus)
    const base = {
      evidenceId: `EVID-${index + 1}`,
      statement: fact.statement,
      category: fact.category,
      sourceSentenceIndex,
      sourceSection,
      assertionStatus,
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
      ],
    } satisfies Omit<SeraEvidenceItem, 'relationshipToFailure'>

    return {
      ...base,
      relationshipToFailure: classifyRelationship(base),
    }
  })
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
    const supports = classifySupportedUses(item.statement, category)
    const prohibitedFor = classifyProhibitedUses(item.statement, item.temporalRelation, evidenceType, assertionStatus)
    const base = {
      evidenceId: item.evidenceId || `SUP-EVID-${index + 1}`,
      statement: item.statement,
      category,
      sourceSentenceIndex: args.sourceSentenceIndex,
      sourceSection,
      assertionStatus,
      temporalRelation: item.temporalRelation,
      actorRelation,
      actor,
      evidenceType,
      supports,
      contradicts: [],
      prohibitedFor,
      confidence: confidenceFromCount(supports.length),
      collectionSource: 'CLARIFICATION_RESPONSE' as const,
      linkedQuestionId: item.linkedQuestionId,
      rationale: [
        `temporalRelation=${item.temporalRelation}`,
        `actorRelation=${actorRelation}`,
        `evidenceType=${evidenceType}`,
        'sourceSection=FACTUAL',
        'assertionStatus=AFFIRMED',
        'collectionSource=CLARIFICATION_RESPONSE',
        `linkedQuestionId=${item.linkedQuestionId}`,
      ],
    } satisfies Omit<SeraEvidenceItem, 'relationshipToFailure'>
    return { ...base, relationshipToFailure: classifyRelationship(base) }
  })
}
