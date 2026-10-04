import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { isEvidenceUsableFor } from '../../evidence'
import { isPt, localizeActor } from '../localization'

export type SeraAxisStatementBundle = {
  perception: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
  objective: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
  action: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function evidenceFor(
  factualExtraction: SeraVNextEngineOutput['factualExtraction'],
  escapePoint: SeraVNextEngineOutput['escapePoint'],
  use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION',
): string[] {
  const escapeSupport = new Set(
    escapePoint.firstDepartureSupportingEvidence?.length
      ? escapePoint.firstDepartureSupportingEvidence
      : escapePoint.supportingEvidence,
  )
  const criticalAnchor = escapePoint.firstDepartureCandidate
    ?? escapePoint.earliestCandidate
  const criticalAnchorIndex = criticalAnchor
    ? factualExtraction.timeline.find((item) => item.statement === criticalAnchor || item.statement.includes(criticalAnchor) || criticalAnchor.includes(item.statement))?.sourceSentenceIndex ?? null
    : null
  const maxDistance = use === 'ACTION' ? 60 : 90
  const criticalAnchorText = (criticalAnchor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const anchorAcknowledgesCrewCue = /\b(acknowledg\w*|recognized|noted|confirmed|reconheceu|confirmou|acusou recebimento|ciente)\b/.test(criticalAnchorText)
  const firstLandmarkText = (escapePoint.firstDepartureCandidate ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const laterLandmarkText = (escapePoint.criticalUnsafeActCandidate ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  const hasDistinctLaterLandmark = Boolean(firstLandmarkText && laterLandmarkText && firstLandmarkText !== laterLandmarkText)
  const compoundLandmarkSentence = (statement: string): boolean => {
    if (!hasDistinctLaterLandmark) return false
    const normalizedStatement = statement.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return normalizedStatement.includes(firstLandmarkText) && normalizedStatement.includes(laterLandmarkText)
  }
  const semanticPassPresent = factualExtraction.evidence.some((item) => item.collectionSource === 'AI_SEMANTIC_EXTRACTION')
  const semanticPoABySentence = new Set(
    factualExtraction.evidence
      .filter((item) => item.collectionSource === 'AI_SEMANTIC_EXTRACTION')
      .filter((item) => item.semanticRoles?.some((role) =>
        ['FIRST_DEPARTURE', 'PERCEPTION_STATE', 'OBJECTIVE_INTENT', 'ACTION_STRATEGY', 'CRITICAL_UNSAFE_ACT', 'PRECONDITION', 'BARRIER', 'CONTEXT', 'OUTCOME'].includes(role),
      ))
      .map((item) => item.sourceSentenceIndex),
  )
  const ranked = factualExtraction.evidence
    .filter((item) => {
      // If one source sentence contains two sequential operator landmarks, the first clause is
      // the unique P/O/A anchor. The full compound sentence is unsafe for P/O/A because it would
      // re-import the later actor/action through lexical or semantic concepts.
      if (compoundLandmarkSentence(item.statement)) return false
      // In canonical AI-assisted analyses, semantic interpretation is the primary P/O/A layer.
      // Raw lexical evidence remains only as a fallback when no semantic pass exists, plus the
      // exact observable critical act for Action when semantic extraction missed that sentence.
      // Clarification responses are always preserved because they are explicit human evidence.
      if (semanticPassPresent
        && item.collectionSource !== 'AI_SEMANTIC_EXTRACTION'
        && item.collectionSource !== 'CLARIFICATION_RESPONSE') {
        const highValueActionFallback = use === 'ACTION' && /\b(nunca (?:fiz|havia feito).{0,140}sempre (?:instrui|instru[ií]|ensinei) contra|barra na barra.{0,180}(?:o certo|o correto|deveria).{0,120}pitch down)\b/i.test(item.statement)
        const criticalAnchorValue = criticalAnchor ?? ''
        const sameCriticalAct = use === 'ACTION' && criticalAnchorValue.length > 0 && (item.statement === criticalAnchorValue || item.statement.includes(criticalAnchorValue) || criticalAnchorValue.includes(item.statement))
        if (!highValueActionFallback && !sameCriticalAct) return false
      }
      // When the semantic pass has explicitly interpreted a sentence for P/O/A, critical-act,
      // or outcome meaning, its actor/temporal binding is authoritative for that sentence.
      // The raw lexical duplicate must not re-enter as actor UNKNOWN and bypass semantic scope.
      if (item.collectionSource !== 'AI_SEMANTIC_EXTRACTION' && semanticPoABySentence.has(item.sourceSentenceIndex)) return false
      if (isEvidenceUsableFor(item, use)) return true
      // isEvidenceUsableFor intentionally blocks CONTEXT_ACTOR for P/O/A. The only exception
      // considered here is a locally communicated perception cue that the direct actor explicitly
      // acknowledged at the critical anchor; the next filter enforces that linkage.
      const admissibleContext = item.assertionStatus === 'AFFIRMED'
        && item.temporalRelation !== 'POST_ESCAPE'
        && item.sourceSection !== 'REPORT_ANALYSIS'
        && item.sourceSection !== 'RECOMMENDATION'
        && item.sourceSection !== 'ADMINISTRATIVE'
        && !['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(item.evidenceType)
      if (use === 'PERCEPTION') {
        return item.actorRelation === 'CONTEXT_ACTOR'
          && admissibleContext
          && !item.prohibitedFor.includes(use)
          && item.supports.includes(use)
      }
      if (use === 'OBJECTIVE' && item.actorRelation === 'SYSTEM_ENVIRONMENT' && admissibleContext) {
        return /\b(destino|destination|rota|route|gps|fms|autorizad|authorized|planned|planejad|previst)\w*/i.test(item.statement)
      }
      return false
    })
    .filter((item) => !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN'))
    .filter((item) => {
      // A human clarification explicitly linked to this canonical stage is evidence about
      // the already selected direct actor even when the short answer does not repeat the
      // actor name and therefore parses as actorRelation=UNKNOWN.
      if (item.collectionSource === 'CLARIFICATION_RESPONSE' && item.clarificationStage === use) return true
      if (criticalAnchorIndex == null) {
        return item.actorRelation === 'DIRECT_ACTOR'
          || (use === 'PERCEPTION' && item.actorRelation === 'SYSTEM_ENVIRONMENT')
          || item.actorRelation === 'UNKNOWN'
      }
      const distance = Math.abs(item.sourceSentenceIndex - criticalAnchorIndex)
      if (distance > maxDistance && !escapeSupport.has(item.statement)) return false
      // Hendy P/O/A belongs to the operator of the critical unsafe act. Merely being
      // contemporaneous with the anchor must never allow another crewmember's own
      // perception, objective, or action to answer that operator's canonical branch.
      if (item.actorRelation === 'DIRECT_ACTOR') return true
      // Perception is evaluated against the state of the world available to the actor. A nearby
      // system/environment cue (e.g. missing annunciation, degraded visibility) is therefore
      // legitimate P evidence even though the system is not the direct human actor.
      if (use === 'PERCEPTION' && item.actorRelation === 'SYSTEM_ENVIRONMENT' && distance <= 16) return true
      // Planned/authorized target or route data is legitimate O_RULES context once O_ROOT
      // is independently established. It cannot create the objective by itself because the
      // descriptive root is filtered separately by hasObjectiveRootEvidence.
      if (use === 'OBJECTIVE' && ['SYSTEM_ENVIRONMENT', 'UNKNOWN'].includes(item.actorRelation) && distance <= 16 &&
          /\b(destino|destination|rota|route|gps|fms|autorizad|authorized|planned|planejad|previst)\w*/i.test(item.statement)) return true
      // A cue voiced by the other crewmember may support the direct actor's perception only
      // when the critical-anchor sentence explicitly establishes that the direct actor
      // acknowledged/recognized that cue. This is a local communication link, not actor migration.
      if (use === 'PERCEPTION' && item.actorRelation === 'CONTEXT_ACTOR' && distance <= 4 && anchorAcknowledgesCrewCue &&
          /\b(mentioned|said|called out|noted|commented|informed|reported|mencionou|disse|comentou|informou|reportou|alertou)\b/i.test(item.statement)) return true
      // Permit a very small local window for evidence that explicitly states the relevant
      // P/O/A semantics but whose actor parser could not resolve a grammatical subject.
      const semantic = semanticEvidenceScore(use, item.statement)
      const localUnknownLimit = use === 'ACTION' ? 10 : 16
      return item.actorRelation === 'UNKNOWN' && distance <= localUnknownLimit && semantic > 0
    })
    .sort((a, b) => {
      const rank = (item: typeof a): number => {
        if (item.temporalRelation === 'AT_ESCAPE') return 0
        if (escapeSupport.has(item.statement)) return 1
        if (item.temporalRelation === 'PRE_ESCAPE') return 2
        return 3
      }
      const delta = rank(a) - rank(b)
      if (delta !== 0) return delta
      // Within pre-escape evidence, prefer the item temporally closest to the escape.
      return b.sourceSentenceIndex - a.sourceSentenceIndex
    })
  return unique(ranked.map((item) => item.statement)).slice(0, 10)
}

function counterEvidenceFor(
  factualExtraction: SeraVNextEngineOutput['factualExtraction'],
  use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION',
): string[] {
  return unique(
    factualExtraction.evidence
      .filter((item) => item.contradicts.includes(use) || (item.assertionStatus === 'REJECTED_AS_FACTOR' && item.supports.includes(use)))
      .map((item) => item.statement),
  ).slice(0, 6)
}

function actorLabel(actor: string | null, locale: SeraVNextEngineInput['locale']): string {
  return localizeActor(actor, locale)?.trim() || (isPt(locale) ? 'ator direto' : 'direct actor')
}

function semanticEvidenceScore(use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', text: string): number {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (use === 'PERCEPTION') {
    let score = 0
    if (/\b(identific|associ|acredit|entend|perceb|reconhec|confund|interpret|achav|achei|pensav|pensei|sabia|ciente|julgav)\w*/.test(t)) score += 6
    if (/\b(visao de tunel|tunnel vision|destino|unidade|plataforma|pista|helideck|warning|alerta)\b/.test(t)) score += 4
    if (/\b(gps|fms|navegacao|navigation|coordenad|autoriza|configurad|programad)\w*/.test(t)) score += 4
    if (/\b(visibilidade|visibility|nevoa|fog|nuvem|cloud|chuva|rain|noite|night|referencia visual|referencias visuais|visual reference|visual references|pistas visuais|visual cues)\b/.test(t)) score += 5
    if (/\b(corretamente|correto|correta|correctly|correct|accurate)\b/.test(t)) score += 2
    return score
  }
  if (use === 'OBJECTIVE') {
    let score = 0
    if (/\b(objetiv|intenc|pretend|planej|meta|goal|intent|planned|planning|decidi|resolvi|escolhi|preferi|optei)\w*/.test(t)) score += 6
    if (/\b(entendemos que|acreditava que|pouso seria|destino (?:inicial )?(?:previsto|planejado|programado)|rota prevista|planned (?:initial )?destination|planned route)\b/.test(t)) score += 5
    if (/\b(autorizad|authorization|clearance)\w*/.test(t) && /\b(destino|destination|unidade|unit-)\b/.test(t)) score += 4
    if (/\b(eficiencia|economia|prazo|schedule|productivity|produtividade|cost|custo)\b/.test(t)) score += 4
    return score
  }
  let score = 0
  if (/\b(aproxim|pous|decol|descend|subi|prosseg|continu|selecion|acion|execut|realiz|planej|conduz|virou|manteve|tirou|tirei|retirou|retirei|desguarneci|peguei|puxou|puxei|empurrou|empurrei|desacopl|colocou|coloquei|land|approach|descend|climb|continued|selected|executed)\w*/.test(t)) score += 6
  if (/\b(comando|controle de voo|flight control|checklist|switch|modo|mode)\b/.test(t)) score += 2
  return score
}

function primaryEvidence(use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', evidence: string[]): string | null {
  if (!evidence.length) return null
  return evidence
    .map((text, index) => ({ text, index, score: semanticEvidenceScore(use, text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.text ?? evidence[0]
}


function hasPerceptionRootEvidence(text: string, criticalAnchor: string): boolean {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const anchor = criticalAnchor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/\b(acredit|entend|perceb|reconhec|identific|interpret|confund|notou|notei|observou|observei|achei|achava|pensei|pensava|sabia|ciente|julgava|believ|understood|perceiv|recogniz|identif|interpret|misidentif|noticed|observed)\w*/.test(t)) return true
  const anchorAcknowledgesCue = /\b(acknowledg\w*|recognized|noted|confirmed|reconheceu|confirmou|acusou recebimento|ciente)\b/.test(anchor)
  const communicatedCue = /\b(mentioned|said|called out|noted|commented|informed|reported|mencionou|disse|comentou|informou|reportou|alertou)\b/.test(t)
  const perceptualContent = /\b(horizonte|horizon|visibilidade|visibility|refer[eê]ncia visual|visual reference|warning|alerta|mensagem|message|modo|mode|pista|runway|destino|destination)\b/.test(t)
  return anchorAcknowledgesCue && communicatedCue && perceptualContent
}

function hasObjectiveRootEvidence(text: string): boolean {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return /\b(objetiv|intenc|pretend|planej|meta|goal|intent|planned|planning|queria|buscava|visava)\w*/.test(t)
    || /\b(decidiu|decidi|resolveu|resolvi|optou|optei|escolheu|escolhi|preferiu|preferi|julgou|julguei|decided|chose|opted)\b.{0,140}\b(continuar|prosseguir|decolar|pousar|pouso|aproximar|descer|subir|lado|continue|proceed|take off|land|approach|descend|climb|side)\b/.test(t)
    || /\b(decidiu|resolveu|decided|resolved)\b.{0,80}\b(violar|descumprir|desrespeitar|violate|breach|disregard)\b.{0,100}\b(continuar|continuou|prosseguir|prosseguiu|seguir|seguiu|continue|continued|proceed|proceeded|press on|pressed on)\b/.test(t)
    || /\b(destino (?:inicial )?(?:previsto|planejado|programado)|planned (?:initial )?destination|rota prevista|planned route)\b/.test(t)
    || /\b((?:passou|come[cç]ou) a (?:preparar|conduzir|planejar)|iniciou (?:o )?planejamento|iniciou (?:a )?aproximacao|preparou|conduziu)\b.{0,90}\b(aproximacao|approach|pouso|landing|destino|destination|unidade|unit-|plataforma|helideck)\b/.test(t)
}

function genericStatement(label: string, evidence: string[], use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', override?: string | null): string | null {
  const primary = override?.trim() || primaryEvidence(use, evidence)
  if (!primary) return null
  return `${label}: ${primary}`
}

export function runStep07AxisStatements(input: {
  engineInput: SeraVNextEngineInput
  directActor: SeraVNextEngineOutput['directActor']
  unsafeActOrCondition: SeraVNextEngineOutput['unsafeActOrCondition']
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraAxisStatementBundle {
  const anchorResolved =
    input.escapePoint.status !== 'INSUFFICIENT_EVIDENCE' &&
    input.escapePoint.status !== 'NO_HUMAN_ESCAPE_POINT' &&
    input.escapePoint.confidence !== 'LOW' &&
    input.directActor.status === 'IDENTIFIED'
  if (!anchorResolved) {
    return {
      perception: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'PERCEPTION'), alternativesConsidered: [] },
      objective: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'OBJECTIVE'), alternativesConsidered: [] },
      action: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'ACTION'), alternativesConsidered: [] },
    }
  }

  const perceptionEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'PERCEPTION')
  const objectiveEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'OBJECTIVE')
  const actionEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'ACTION')
  const semanticPerceptionRoot = new Set(input.factualExtraction.evidence
    .filter((item) => item.collectionSource === 'AI_SEMANTIC_EXTRACTION' && isEvidenceUsableFor(item, 'PERCEPTION'))
    .filter((item) => item.semanticRoles?.includes('PERCEPTION_STATE') || (item.semanticConcepts?.length ?? 0) > 0)
    .map((item) => item.statement))
  const semanticObjectiveRoot = new Set(input.factualExtraction.evidence
    .filter((item) => item.collectionSource === 'AI_SEMANTIC_EXTRACTION' && isEvidenceUsableFor(item, 'OBJECTIVE'))
    .filter((item) => item.semanticRoles?.includes('OBJECTIVE_INTENT') || (item.semanticConcepts?.length ?? 0) > 0)
    .map((item) => item.statement))

  const perceptionCounter = counterEvidenceFor(input.factualExtraction, 'PERCEPTION')
  const objectiveCounter = counterEvidenceFor(input.factualExtraction, 'OBJECTIVE')
  const actionCounter = counterEvidenceFor(input.factualExtraction, 'ACTION')

  const locale = input.engineInput.locale
  const actor = actorLabel(input.directActor.actor, locale)

  const criticalAnchor = input.escapePoint.firstDepartureCandidate
    ?? input.escapePoint.earliestCandidate
    ?? ''
  const perceptionRootEvidence = perceptionEvidence.filter((text) => hasPerceptionRootEvidence(text, criticalAnchor) || semanticPerceptionRoot.has(text))
  const perceptionStatement = genericStatement(
    isPt(locale) ? `Estado perceptivo de ${actor} no ponto de fuga` : `Perceptual state of ${actor} at the escape point`,
    perceptionRootEvidence,
    'PERCEPTION',
  )
  const objectiveRootEvidence = objectiveEvidence.filter((text) => hasObjectiveRootEvidence(text) || semanticObjectiveRoot.has(text))
  const objectiveStatement = genericStatement(
    isPt(locale) ? `Objetivo operacional de ${actor} no ponto de fuga` : `Operational objective of ${actor} at the escape point`,
    objectiveRootEvidence,
    'OBJECTIVE',
  )
  const actionStatement = genericStatement(
    isPt(locale) ? `Ação observada de ${actor} no ponto de fuga` : `Observed action of ${actor} at the escape point`,
    actionEvidence,
    'ACTION',
    input.unsafeActOrCondition.type === 'UNSAFE_ACT' ? input.unsafeActOrCondition.statement : null,
  )

  return {
    perception: {
      statement: perceptionStatement,
      supportingEvidence: perceptionEvidence,
      counterEvidence: perceptionCounter,
      alternativesConsidered: ['P-A', 'P-B', 'P-C', 'P-D', 'P-E', 'P-F', 'P-G', 'P-H'],
    },
    objective: {
      statement: objectiveStatement,
      supportingEvidence: objectiveEvidence,
      counterEvidence: objectiveCounter,
      alternativesConsidered: ['O-A', 'O-B', 'O-C', 'O-D'],
    },
    action: {
      statement: actionStatement,
      supportingEvidence: actionEvidence,
      counterEvidence: actionCounter,
      alternativesConsidered: ['A-A', 'A-B', 'A-C', 'A-D', 'A-E', 'A-F', 'A-G', 'A-H', 'A-I', 'A-J'],
    },
  }
}
