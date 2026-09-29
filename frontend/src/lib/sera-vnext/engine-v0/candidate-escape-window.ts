import type { SeraTimelineItem } from '../engine-contract'
import { isPostEscapeStatement } from '../evidence/temporal-scope'
import { isDirectControlResponseStatement, isExplicitOperationalDeviationStatement, isExplicitOperationalOmissionStatement, isOperationalEventStatement, OUTCOME_KEYWORDS } from './factual-extraction-helpers'

export type HumanFactorEscapeAnchorType = 'UNSAFE_ACT' | 'OPERATOR_CONTROLLED_UNSAFE_CONDITION'
export type SeraEpisodeRole = 'HUMAN_FACTOR_CANDIDATE' | 'TECHNICAL_ENVIRONMENT'

export type OperationalEpisodeCandidate = {
  phase: OperationalPhase
  anchorStatement: string
  supportingEvidence: string[]
  occurrenceScope: SeraTimelineItem['occurrenceScope']
  seraRole: SeraEpisodeRole
  humanFactorEligible: boolean
  selected: boolean
}

type CandidateEscapeWindow = {
  statement: string | null
  earliestCandidate: string | null
  latestCandidate: string | null
  firstDepartureCandidate: string | null
  criticalUnsafeActCandidate: string | null
  criticalCandidateAlternatives: string[]
  irreversibilityBoundaryCandidate: string | null
  anchorBasis: 'FIRST_DEPARTURE_AND_CRITICAL_ACT' | 'FIRST_DEPARTURE_PRIMARY' | 'FIRST_DEPARTURE_ONLY' | 'UNRESOLVED'
  firstDepartureSupportingEvidence: string[]
  criticalUnsafeActSupportingEvidence: string[]
  poaAnchorCandidate: string | null
  poaAnchorSupportingEvidence: string[]
  poaAnchorBasis: 'CRITICAL_UNSAFE_ACT' | 'FIRST_DEPARTURE_FALLBACK' | 'UNRESOLVED'
  supportingEvidence: string[]
  counterEvidence: string[]
  progressiveBoundary: boolean
  episodeCandidates: OperationalEpisodeCandidate[]
  humanFactorGate: {
    status: 'PASSED' | 'BLOCKED'
    anchorType: HumanFactorEscapeAnchorType | null
    rationale: string[]
  }
}

function normalized(sentence: string): string {
  return sentence.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasOutcomeSignal(sentence: string): boolean {
  const lower = normalized(sentence)
  if (OUTCOME_KEYWORDS.some((keyword) => lower.includes(normalized(keyword)))) return true
  if (/\b(colidiu|colidir|colidiram|crashed|impacted|impactou|atingiu o solo|hit the ground)\b/.test(lower)) return true
  return /\b(pousou|realizou o pouso|efetuou o pouso|conclu(?:iu|ir) o pouso|landed|completed the landing)\b.*\b(errad[oa]|erroneamente|equivocad[oa]|nao previst[oa]|nao autorizad[oa]|erro|wrong|different|diferente|distint[ao]|different destination|destino diferente)\b/.test(lower)
    || /\bapos concluir o pouso|after (?:completing|the) landing\b/.test(lower) || /\b(apos concluir o pouso|after landing|after touchdown)\b/.test(lower)
}

function admissible(item: SeraTimelineItem): boolean {
  if (item.assertionStatus && item.assertionStatus !== 'AFFIRMED') return false
  if (item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION' || item.sourceSection === 'ADMINISTRATIVE') return false
  if (['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN')) return false
  if (isPostEscapeStatement(item.statement)) return false

  // A verified semantic landmark is itself evidence that the sentence describes an
  // operational event. Do not make the AI extraction pass a second lexical/regex gate:
  // naturalistic interviews routinely express acts with wording the deterministic
  // recognizer has never seen. Low-confidence semantic annotations never bypass it.
  const verifiedSemanticLandmark = item.semanticConfidence !== 'LOW' &&
    item.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT')
  if (verifiedSemanticLandmark) return true

  return isOperationalEventStatement(item.statement)
}

const EPISODE_STOPWORDS = new Set([
  'aeronave', 'aircraft', 'tripulacao', 'tripulação', 'crew', 'piloto', 'pilot', 'comandante', 'copiloto',
  'durante', 'during', 'apos', 'após', 'depois', 'after', 'sistema', 'system', 'procedimento', 'procedimentos',
  'procedure', 'procedures', 'alerta', 'warning', 'flight', 'voo', 'foram', 'foi', 'com', 'sem', 'para', 'from', 'that',
])

function topicTokens(statement: string): Set<string> {
  return new Set(normalized(statement)
    .replace(/[^a-z0-9à-ÿ-]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !EPISODE_STOPWORDS.has(token)))
}

function topicalOverlap(a: string, b: string): number {
  const left = topicTokens(a)
  const right = topicTokens(b)
  let count = 0
  for (const token of left) if (right.has(token)) count += 1
  return count
}

type OperationalPhase = 'DISPATCH' | 'MAINTENANCE' | 'INFLIGHT' | 'APPROACH' | 'GROUND' | 'GENERIC'

function operationalPhase(statement: string): OperationalPhase {
  const text = normalized(statement)
  if (/\b(despach\w*|dispatch\w*|mel|cco|dov|planejamento|flight planning|antes do despacho|before dispatch)\b/.test(text)) return 'DISPATCH'
  if (/\b(manutenc|maintenance|mecan|mechanic|inspecao pre-voo|preflight inspection|tlb)\b/.test(text)) return 'MAINTENANCE'
  if (/\b(aproximacao|approach|aproximacao final|final approach|pouso|landing|go-around|arremet|runway|pista|lined up|line up|wrong surface)\b/.test(text)) return 'APPROACH'
  if (/\b(subida|climb|cruzeiro|cruise|descida|descent|durante o voo|during the flight|fl\d{2,3}|nivelamento|levelled|leveling|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed|gelo|icing)\b/.test(text)) return 'INFLIGHT'
  if (/\b(taxi|solo|ground|pushback|estacionamento)\b/.test(text)) return 'GROUND'
  return 'GENERIC'
}

function phaseCompatible(anchor: string, candidate: string): boolean {
  const a = operationalPhase(anchor)
  const b = operationalPhase(candidate)
  if (a === 'GENERIC' || b === 'GENERIC') return true
  return a === b
}

function hasExplicitHumanActor(statement: string): boolean {
  const text = normalized(statement)
  return /\b(tripulacao|crew|piloto|pilot|piloto entrevistado|entrevistado|outro piloto|outro tripulante|o cara|comandante|captain|copiloto|first officer|pic|sic|pf|pm|operador|operator|mecanico|mechanic|tecnico de manutencao|maintenance technician|inspetor|inspector|despachante|dispatcher|cco|dov|eles|they|nos|we|eu|i|voce)\b|\ba gente\b/.test(text)
}

function isOperatorControlledUnsafeCondition(statement: string): boolean {
  const text = normalized(statement)
  return /\b(aeronave|aircraft)\b.*\b(desceu|descendeu|descended|permaneceu|remained|entrou|entered|alinhou|lined up|pousou|landed)\b.*\b(abaixo|below|mda|minim[oa]|perfil|profile|sem referencia|without visual|pista|runway|insegur|unsafe)\b/.test(text)
    || /(?:\b(tripulacao|pilotos?|crew|nos|we|eu)\b|\ba gente\b).{0,180}\b(500|quinhentos)\s*(?:pes|ft|feet)\b.{0,180}\b(sem (?:ver|visual|referencia)|nao (?:via|vi|estou vendo|estavamos vendo)|guardad[oa]|imc|instrumento)\b/.test(text)
    || /(?:\b(tripulacao|pilotos?|crew|nos|we)\b|\ba gente\b).{0,180}\b(imc|instrumento|sem referencia visual)\b.{0,180}\b(continuou|continuaram|prosseguiu|prosseguiram|resolveu continuar|resolvemos continuar)\b/.test(text)
    || /\b(separacao|separation|clearance|distancia|distance)\b.*\b(abaixo|below|menor que|less than)\b.*\b(minim[oa]|required|requerid[oa]|aceitavel|acceptable)\b/.test(text)
    || /\b(instalacao|installation)\b.*\b(peca errada|wrong part|incorrect part)\b/.test(text)
    || /\b(torque)\b.*\b(errad[oa]|incorret[oa]|wrong|incorrect|fora do limite|out of limit)\b/.test(text)
}

function hasObservableHumanAct(statement: string): boolean {
  const text = normalized(statement)
  if (isDirectControlResponseStatement(statement)) {
    const normativeOnly = /\b(n[aã]o deveria|deveria|should not|should|must not|must)\b/.test(text)
      && !/\b(dados registrados|recorded data|mostraram|showed|sic|pic|pilotos?|pilots?|tripula[cç][aã]o|crew|comandante|captain|copiloto|first officer|pf|pm)\b/.test(text)
    if (normativeOnly) return false
    // A control-surface/system movement is technical context unless the statement links the
    // input to a human actor. This prevents elevator reversal from becoming a human act.
    if (!hasExplicitHumanActor(statement)) return false
    return true
  }
  if (isExplicitOperationalOmissionStatement(statement) || isExplicitOperationalDeviationStatement(statement)) return true

  // Maintenance/preflight is a human operational act even when the report uses passive grammar.
  if (/\b(inspecao (?:de )?pre[- ]?voo|preflight inspection|inspecao visual|visual inspection)\b.*\b(concluida|completed|nao detectou|nada de anormal|nenhuma anormalidade|fora detectad[oa]|no abnormality|nothing abnormal|had been detected)\b/.test(text)) return true
  if (/\b(aeronave|aircraft)\b.*\b(considerada apta|considered fit|liberad[ao]|released)\b.*\b(pre[- ]?voo|preflight|inspecao|inspection)\b.*\b(sem travamento|not secured|unlatched|latches?|fechos?)\b/.test(text)) return true
  if (/\b(inspecao (?:de )?pre[- ]?voo|preflight inspection)\b.*\b(concluida|completed)\b.*\b(aeronave|aircraft)\b.*\b(liberad[ao]|released)\b.*\b(sem travamento|not secured|unlatched|latches?|fechos?)\b/.test(text)) return true

  // A wrong operational identification/association is a human-factor anchor only when tied to an operational target.
  const wrongOperationalTarget = /\b(identificou|identificaram|associou|associaram|confundiu|confundiram|interpretou|interpretaram|tratou|trataram|tomou|tomaram|identified|misidentified|mistook|took|associated|interpreted|treated)\b.*\b(destino|unidade|plataforma|pista|helideck|pouso|landing|runway|unit-[a-z0-9-]+|pcp[- ]?\d+)\b/.test(text)
  if (wrongOperationalTarget && /\b(tripulacao|crew|piloto|pilot|comandante|captain|copiloto|first officer|pf|pm)\b/.test(text)) return true

  if (!hasExplicitHumanActor(statement)) return false
  if (/\b(nao notou|nao percebeu|nao reconheceu|nao processou|nao monitorou|nao verificou|nao confirmou|nao insistiu|deixou de monitorar|deixou de verificar|did not notice|did not perceive|did not recognize|did not process|did not monitor|did not verify|did not confirm|did not insist|failed to monitor|failed to verify)\b/.test(text)) return true
  return /\b(decidiu|decidi|decidiram|decidimos|resolveu|resolvi|resolveram|resolvemos|optou|optei|escolheu|escolhi|continuou|continuei|continuaram|prosseguiu|prossegui|prosseguiram|manteve|mantive|mantiveram|selecionou|selecionei|acionou|acionei|desligou|desliguei|ligou|liguei|desacoplou|desacoplei|desacoplaram|cancelou|cancelei|cancelaram|reduziu|reduzi|reduziram|colocou|coloquei|colocaram|aplicou|apliquei|aplicaram|executou|executei|executaram|omitiu|omiti|deixou de|deixei de|falhou|falhei|iniciou|iniciei|iniciaram|iniciado|iniciada|inseriu|inseri|programou|programei|ajustou|ajustei|configurou|configurei|conduziu|conduzi|conduziram|preparou|preparei|prepararam|passou|passei|passaram|aproximou|aproximei|aproximaram|desceu|desci|desceram|subiu|subi|subiram|moveu|movi|moveram|puxou|puxei|puxaram|empurrou|empurrei|empurraram|alinhou|alinhei|alinharam|permitiu|permiti|permitiram|abandonou|abandonei|abandonaram|hesitou|hesitei|hesitaram|demorou|demorei|demoraram|esperou|esperei|esperaram|tirou|tirei|retirou|retirei|pegou|peguei|meteu|meti|julgou|julguei|preferiu|preferi|assumiu|assumi|desguarneci|mexeu|mexendo|decided|chose|opted|resolved|continued|proceeded|maintained|selected|disengaged|cancelled|reduced|put|applied|executed|failed to|did not|initiated|started|inserted|programmed|configured|conducted|prepared|approached|began|started|descended|climbed|moved|pulled|pushed|lined up|allowed|hesitated|delayed|waited)\b/.test(text)
}

export function classifyHumanFactorEscapeStatement(statement: string): HumanFactorEscapeAnchorType | null {
  if (!isOperationalEventStatement(statement)) return null
  if (hasObservableHumanAct(statement)) return 'UNSAFE_ACT'
  if (isOperatorControlledUnsafeCondition(statement)) return 'OPERATOR_CONTROLLED_UNSAFE_CONDITION'
  return null
}

function seraEpisodeRole(item: SeraTimelineItem): SeraEpisodeRole {
  const semanticHumanLandmark = item.semanticConfidence !== 'LOW'
    && item.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT')
  if (semanticHumanLandmark) return 'HUMAN_FACTOR_CANDIDATE'
  return classifyHumanFactorEscapeStatement(item.statement) ? 'HUMAN_FACTOR_CANDIDATE' : 'TECHNICAL_ENVIRONMENT'
}

function episodeSupport(anchor: SeraTimelineItem, timeline: SeraTimelineItem[]): SeraTimelineItem[] {
  const nearby = timeline.filter((item) =>
    item.assertionStatus === 'AFFIRMED' &&
    item.sourceSection !== 'REPORT_ANALYSIS' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    !hasOutcomeSignal(item.statement) &&
    Math.abs(item.sourceSentenceIndex - anchor.sourceSentenceIndex) <= 6,
  )
  const support = nearby.filter((item) => {
    if (item.statement === anchor.statement) return true
    if (!phaseCompatible(anchor.statement, item.statement)) return false
    if (topicalOverlap(anchor.statement, item.statement) >= 1) return true
    const anchorText = normalized(anchor.statement)
    const itemText = normalized(item.statement)
    const icingEpisode = /\b(gelo|icing|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed)\b/.test(anchorText)
      && /\b(gelo|icing|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed)\b/.test(itemText)
    const dispatchEpisode = /\b(despach\w*|dispatch\w*|mel|meteorolog\w*|weather|sigmet)\b/.test(anchorText)
      && /\b(despach\w*|dispatch\w*|mel|meteorolog\w*|weather|sigmet)\b/.test(itemText)
    return icingEpisode || dispatchEpisode
  })
  return support.sort((a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex).slice(0, 6)
}

function candidateScore(sentence: string): number {
  // Statements about what the report does not describe, what an investigation focuses on,
  // or what was not recorded are evidence limitations/meta-analysis, never operational escape points.
  if (/\b(n[aã]o h[aá] descri[cç][aã]o|n[aã]o foi descrito|n[aã]o ficou registrado|relat[oó]rio foca|relat[oó]rio (?:n[aã]o )?descreve|par[aá]grafo .* menciona apenas|no description|not described|not recorded|report focuses|report does not describe|report only mentions)\b/i.test(sentence)) return -20
  const text = normalized(sentence)
  // A reviewer/investigator statement that labels the boundary is meta-analysis, not a new act.
  // Keep it available as context, but do not let it compete with the underlying observed event.
  if (/\b(considera|considerou|avalia|avaliou|conclui|concluiu|entende|entendeu|considers?|considered|assesses?|assessed|concludes?|concluded)\b.*\b(barreira(?: de seguranca)?|safety barrier|ponto de fuga|escape point|operacao segura|safe operation)\b/.test(text)) return -20
  let score = 0
  if (isDirectControlResponseStatement(sentence)) score += 16
  if (isDirectControlResponseStatement(sentence) && /\b(sic|pic|pilotos?|pilots?|tripulacao|tripula[cç][aã]o|comandante|captain|copiloto|first officer|pf|pm)\b/.test(text)) score += 6
  if (/\b(esfor[cç]o|force)\b.*\b(10\s*dan|nose up|nose down|cabrar|picar)\b/.test(text)) score += 3
  if (isExplicitOperationalOmissionStatement(sentence)) score += 12
  if (isExplicitOperationalDeviationStatement(sentence)) score += 11
  if (
    /\b(inspecao (?:de )?pre[- ]?voo|pre[- ]?voo|preflight inspection)\b/.test(text) &&
    /\b(nada de anormal (?:foi|fora) detectado|nenhuma anormalidade (?:foi )?detectada|no abnormality (?:was )?detected)\b/.test(text)
  ) score += 10
  if (
    /\binspecao visual\b/.test(text) &&
    /\b(nada de anormal|nenhuma anormalidade|no abnormality)\b/.test(text)
  ) score += 9
  if (/\b(identificou|reconheceu|entendeu)\b.*\bcomo\b.*\b(pouso|destino|unidade|plataforma|pista|helideck)\b/.test(text)) score += 9
  if (/\b(tomou|tomaram|took|mistook)\b.*\b(unidade|plataforma|pista|destino|helideck|unit-[a-z0-9-]+)\b.*\b(previst|destino|unidade|plataforma|pista|helideck|unit-[a-z0-9-]+)\b/.test(text)) score += 9
  if (/\bassociou\b.*\b(unidade|plataforma|pista|destino|helideck)\b/.test(text)) score += 9
  if (/\b(confundiu|confundiram|misidentified|mistook|wrong runway|wrong surface|wrong deck)\b/.test(text)) score += 9
  if (/\b(entendemos|acreditou|acreditavam|julgou|assumiu)\b.*\b(pouso|destino|unidade|plataforma|pista|helideck)\b/.test(text)) score += 8
  if (/\b(prosseguiu|prosseguiram|conduziu|conduziram|alinhou|alinhados|aproximou|approach|lined up|continued)\b.*\b(pouso|aproximacao|approach|landing|destino|unidade|plataforma|pista|helideck)\b/.test(text)) score += 6
  if (/\b(iniciou|iniciaram|initiated|started)\b\s+(?:a\s+|o\s+|the\s+)?\b(aproximacao|approach|descida|descent|pouso|landing|curva|turn|manobra|maneuver)\b/.test(text)) score += 6
  if (/\b(iniciou|iniciaram|initiated|started)\b.*\b(planejamento|preparacao|planning|preparation)\b.*\b(aproximacao|approach|pouso|landing)\b/.test(text)) score += 6
  if (/\bpassou a\b.*\b(conduzir|preparar|realizar|executar|prosseguir|aproximar|alinhar|descer)\b.*\b(aproximacao|pouso|destino|unidade|plataforma|pista|helideck|unit-[a-z0-9-]+)\b/.test(text)) score += 6
  if (/\b(nao reconfirm|nao confirm|nao verific|nao confer|sem reconfirm|sem confirm|failed to verify|did not verify|did not confirm)\b/.test(text)) score += 5
  if (/\b(did not|failed to|neither pilot|nao|nenhum dos pilotos|nenhum piloto)\b.*\b(notic\w*|perceiv\w*|recogniz\w*|process\w*|initiat\w*|call(?:ed)? for|insist\w*|notou|percebeu|reconheceu|processou|iniciou|chamou|insistiu)\b/.test(text)) score += 8
  if (/\b(inserted|selected|set|programmed|inseriu|selecionou|programou|ajustou)\b.*\b(different|wrong|incorrect|diferente|errad[oa]|incorret[oa])\b/.test(text)) score += 9
  if (/\b(decided|chose|opted|resolved|decidiu|decidiram|decidimos|resolveu|resolveram|resolvemos|optou|escolheu)\b.*\b(take off|continue|proceed|descend|attempt|try|decolar|continuar|prosseguir|descer|tentar)\b/.test(text)) score += 8
  if (/\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(attempt|try|realizar|tentar|efetuar)\b.*\b(flight|voo|departure|partida)\b.*\b(despite|apesar|mesmo com)\b/.test(text)) score += 8
  if (/\b(crew|tripulacao|tripulação|a tripulacao|a tripulação)\b.*\b(partiu|decolou|departed|took off|prosseguiu)\b.*\b(despite|apesar|mesmo com)\b.*\b(piora|worsening|condi[cç][oõ]es?|weather|meteorolog)\b/.test(text)) score += 8
  if (/\b(pulled|pushed|moved|puxou|empurrou|moveu)\b.*\b(control column|column|stick|cyclic|collective|coluna|manche|c[ií]clico|coletivo|comando)\b.*\b(instead of|em vez de|ao inv[eé]s de)\b/.test(text)) score += 10
  if (/\b(piloto|pilot|comandante|captain|copiloto|first officer)\b.*\b(desacoplou|cancelou|disengaged|cancelled)\b.*\b(automatismo|diretor de voo|flight director|autopilot|automacao|automation)\b/.test(text)) score += 9
  if (/\b(piloto|pilot|comandante|captain|copiloto|first officer)\b.*\b(colocou|aplicou|moveu|puxou|empurrou|put|applied|moved|pulled|pushed)\b.*\b(barra na barra|pitch down|ciclico|cyclic|comando|control)\b/.test(text)) score += 10
  if (/\b(hesitated|delayed|waited|hesitou|demorou|esperou)\b.*\b(seconds?|segundos?|antes de|before)\b.*\b(execut|initiat|perform|agir|atuar|executar|iniciar|manobra|maneuver)\b/.test(text)) score += 9
  if (/\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(start|initiate|iniciar|come[cç]ar)\b.*\b(the )?(crank|cranking|partida|giro)\b/.test(text)) score += 10
  if (/\b(descended|descend|desceu|desceram)\b.*\b(below|abaixo)\b.*\b(glide path|glidepath|profile|trajet[oó]ria|perfil)\b/.test(text)) score += 9
  if (/\b(aeronave|aircraft)\b.*\b(desceu|descendeu|descended|permaneceu|remained)\b.*\b(abaixo|below)\b.*\b(mda|minim[oa]|minimums?|perfil|profile)\b/.test(text)) score += 10
  if (/\bcontinued visually|continued visual|continuou visualmente|prosseguiu visualmente\b.*\b(low cloud|poor visibility|degraded visibility|nuvens? baixas?|baixa visibilidade|visibilidade degradada)\b/.test(text)) score += 8
  if (/\b(lost (?:the )?sense of height|lost visual reference|perdeu (?:a )?no[cç][aã]o de altura|perdeu (?:a )?refer[eê]ncia visual)\b/.test(text)) score += 8
  if (/\b(piloto|pilot|comandante|captain|copiloto|first officer)\b.*\b(iniciou|iniciado|iniciada|initiated|started)\b.*\b(curva|turn|manobra|maneuver)\b/.test(text)) score += 10

  if (/\b(continued|continuou|prosseguiu|manteve)\b.*\b(below|without|incorrect|unstable|mismatch|abaixo|sem|incorret|instavel|instável|divergente)\b/.test(text)) score += 8
  if (/\b(continued|continuou|prosseguiu|manteve)\b.*\b(descent|descida|toward destination|em dire[cç][aã]o ao destino|toward rising terrain|terreno ascendente)\b.*\b(degraded|diminishing|limited|unsafe|low[- ]energy|degradad|reduzid|limitad|insegur|baixa energia)\b/.test(text)) score += 8
  if (/\btransitioned\b.*\bvisual approach\b.*\b(low cloud|poor visibility|degraded visibility)\b/.test(text)) score += 7
  if (/\b(transicionou|passou)\b.*\baproxima[cç][aã]o visual\b.*\b(nuvens? baixas?|baixa visibilidade|visibilidade degradada)\b/.test(text)) score += 7
  if (/\ballowed\b.*\b(low airspeed|high descent rate|unsafe state|deviation)\b.*\bdevelop\b/.test(text)) score += 8
  if (/\bpermitiu\b.*\b(baixa velocidade|alta raz[aã]o de descida|estado inseguro|desvio)\b.*\b(desenvolver|evoluir)\b/.test(text)) score += 8
  if (/\b(continued|continuou|prosseguiu)\b.*\b(toward destination|para o destino|rumo ao destino)\b.*\b(limited weather|weather options|fuel|combust[ií]vel|meteorolog)\b/.test(text)) score += 7
  if (/\b(control inputs|comandos? de voo|inputs? de controle)\b.*\b(did not preserve|failed to preserve|n[aã]o preservaram?|n[aã]o mantiveram?)\b.*\b(safe climb|safe path|trajet[oó]ria segura|subida segura)\b/.test(text)) score += 9

  if (/\b(unstable|instavel|instável|abaixo do perfil|below profile)\b.*\b(continued|was continued|prosseguiu|continuou|manteve)\b/.test(text)) score += 8
  if (/\b(moved|selected|set|turned|pulled|pushed|moveu|selecionou|acionou|girou|puxou|empurrou)\b.*\b(lever|switch|control|manete|seletor|comando)\b.*\b(out of stop|fora de stop|wrong|incorrect|errad[oa]|incorret[oa])\b/.test(text)) score += 9
  if (/\b(escape point|safe[- ]operation departure|ponto de fuga|sa[ií]da da opera[cç][aã]o segura)\b.*\b(when|quando)\b.*\b(moved|selected|continued|descended|moveu|selecionou|continuou|desceu|acionou)\b/.test(text)) score += 10
  if (/\b(perceived state|estado percebido|situa[cç][aã]o percebida)\b.*\b(did not match|n[aã]o correspondia|n[aã]o coincidia|divergia)\b.*\b(aircraft|aeronave|energy|energia|profile|perfil|state|estado)\b/.test(text)) score += 8
  if (/\b(meaning|significado)\b.*\b(not clear|unclear|n[aã]o (?:estava|era|ficou) claro|n[aã]o compreendido|not understood)\b/.test(text)) score += 8

  if (/\b(touched down long|landed long|pousou longo|toque longo)\b/.test(text)) score += 8
  if (/\b(suggested corrections|sugeriu corre[cç][oõ]es)\b.*\b(did not take control|nao assumiu o controle|não assumiu o controle)\b/.test(text)) score += 3
  if (/\b(did not insist|nao insistiu|não insistiu)\b/.test(text)) score += 7
  // Naturalistic interview language: preserve observable first-person/colloquial acts
  // without requiring formal report wording.
  if (/\b(tirei|tirou|retirei|retirou|desguarneci)\b.{0,100}\b(mao|mão)\b.{0,80}\b(coletivo|collective|comando)\b/.test(text)) score += 14
  if (/\b(o cara|outro piloto|outro tripulante|piloto entrevistado|eu|voce)\b.{0,180}\b(meteu|puxou|puxei|mexendo|mexeu|moveu|movimentei|movimentou)\b.{0,100}\b(comandos?|ciclico|cíclico|coletivo|cyclic|collective)\b/.test(text)) score += 12
  if (/\b(julguei|julgou|decidi|decidiu|escolhi|escolheu|preferi|preferiu|tomei a decisao|tomou a decisao)\b.{0,180}\b(lado|pouso|pousar|aproximacao|aproximação|landing|approach)\b/.test(text)) score += 11
  if (/\b(preferi|preferiu|decidi|decidiu|escolhi|escolheu)\b.{0,180}\b(pouso|pousar)\b.{0,180}\b(mesmo sabendo|mais trabalhoso|mais perto|menor margem|obstaculo|obstáculo|risco)\b/.test(text)) score += 18
  if (/(?:\b(tripulacao|pilotos?|nos|we|eu)\b|\ba gente\b).{0,180}\b(500|quinhentos)\s*(?:pes|ft|feet)\b.{0,180}\b(sem (?:ver|visual|referencia)|nao (?:via|vi|estou vendo|estavamos vendo)|guardad[oa]|imc|instrumento)\b/.test(text)) score += 10
  if (/\b(decidiu|decidiram|decidimos|resolveu|resolveram|resolvemos|continuou|executou|desceu|subiu|virou|desacoplou|cancelou|reduziu|tripula|pilot|crew|a gente|nos|we)\b/.test(text)) score += 1
  if (/\b(sem incidentes|sem intercorr[eê]ncias|sem problema(?: nenhum)?|sem anormalidade|without incident|without problem|safely|normal landing|pouso normal)\b/.test(text)) score -= 20
  if (hasOutcomeSignal(sentence)) score -= 10
  return score
}

function hasControlWindowSignal(item: SeraTimelineItem): boolean {
  if (!admissible(item)) return false
  if (item.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT')) return true
  return candidateScore(item.statement) > 0 || /\b(crew|pilot|operator|decided|continued|failed to|did not|executed|turned|descended|climbed|approach|landing|tripula|piloto|decidiu|continuou|falhou|executou|desceu|subiu|aproxima[cç][aã]o|pouso)\b/i.test(item.statement)
}

function buildEpisodeCandidates(scored: Array<{ item: SeraTimelineItem; score: number }>, timeline: SeraTimelineItem[]): OperationalEpisodeCandidate[] {
  const episodes: OperationalEpisodeCandidate[] = []
  for (const { item } of [...scored].sort((a, b) => a.item.sourceSentenceIndex - b.item.sourceSentenceIndex)) {
    const support = episodeSupport(item, timeline)
    const supportSet = new Set(support.map((candidate) => candidate.statement))
    const phase = operationalPhase(item.statement)
    const role = seraEpisodeRole(item)
    const duplicate = episodes.some((episode) => {
      if (episode.phase !== phase || episode.seraRole !== role) return false
      const existing = new Set(episode.supportingEvidence)
      const overlap = [...supportSet].filter((statement) => existing.has(statement)).length
      const denominator = Math.max(1, Math.min(existing.size, supportSet.size))
      return overlap / denominator >= 0.5
    })
    if (duplicate) continue
    episodes.push({
      phase,
      anchorStatement: item.statement,
      supportingEvidence: support.map((candidate) => candidate.statement),
      occurrenceScope: item.occurrenceScope ?? 'UNKNOWN',
      seraRole: role,
      humanFactorEligible: role !== 'TECHNICAL_ENVIRONMENT' && (
        classifyHumanFactorEscapeStatement(item.statement) !== null
        || Boolean(item.semanticConfidence !== 'LOW' && item.semanticRoles?.some((semanticRole) => semanticRole === 'FIRST_DEPARTURE' || semanticRole === 'CRITICAL_UNSAFE_ACT'))
      ),
      selected: false,
    })
    if (episodes.length >= 6) break
  }
  return episodes
}

export function buildCandidateEscapeWindow(timeline: SeraTimelineItem[]): CandidateEscapeWindow {
  const outcomeItem = timeline.find((item) =>
    (!item.assertionStatus || item.assertionStatus === 'AFFIRMED') &&
    item.sourceSection !== 'REPORT_ANALYSIS' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN') &&
    hasOutcomeSignal(item.statement)
  ) ?? null
  const irreversibilityItem = timeline.find((item) =>
    (!item.assertionStatus || item.assertionStatus === 'AFFIRMED') &&
    item.sourceSection !== 'REPORT_ANALYSIS' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN') &&
    /\b(recupera[cç][aã]o .* (?:j[aá] )?n[aã]o era mais poss[ií]vel|perda de controle .* tornou-se irrevers[ií]vel|irreversible|no way back|recovery .* no longer possible)\b/i.test(item.statement)
  ) ?? null
  const candidateItems = timeline.filter((item) => hasControlWindowSignal(item) && !hasOutcomeSignal(item.statement))
  const scored = candidateItems
    .map((item) => {
      let score = candidateScore(item.statement)
      // Semantic AI is an interpretation layer, not the methodological authority. Give
      // verified landmarks a meaningful bonus, but keep strong factual candidates in the
      // race so a bad semantic label cannot suppress an observable control act.
      if (item.semanticRoles?.includes('FIRST_DEPARTURE')) score += item.semanticConfidence === 'HIGH' ? 8 : 5
      if (item.semanticRoles?.includes('CRITICAL_UNSAFE_ACT')) score += item.semanticConfidence === 'HIGH' ? 12 : 8
      return { item, score }
    })
    .filter(({ score }) => score >= 5)
  const episodeCandidates = buildEpisodeCandidates(scored, timeline)

  // Hendy requires two related but non-identical landmarks to remain distinguishable:
  // (1) the first departure from safe operation and (2) the most critical unsafe act/condition,
  // i.e. the one on the occurrence trajectory from which only the direct outcome trajectory remains.
  // Upstream maintenance/dispatch/organizational material may set the scene without becoming the
  // first departure merely because it happened earlier. The first departure delimits the trajectory
  // boundary. Hendy's P/O/A questions, however, stay bound to the operator and critical unsafe act/
  // condition under analysis. These landmarks may coincide, but must never be silently conflated.
  const humanFactorScored = scored.filter(({ item }) =>
    classifyHumanFactorEscapeStatement(item.statement) !== null ||
    item.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT'),
  )
  const phaseRank: Record<OperationalPhase, number> = { MAINTENANCE: 0, DISPATCH: 1, GROUND: 2, INFLIGHT: 3, APPROACH: 4, GENERIC: 5 }
  const selectedPool = humanFactorScored

  // First departure is the earliest supported safe-to-unsafe crossing on the occurrence
  // trajectory. Prefer candidates whose operational phase is explicit; document order is
  // only a tie-breaker inside a phase and must never make a generic statement outrank a
  // clearly earlier operational phase.
  const semanticCriticalActors = new Set(
    humanFactorScored
      .filter(({ item }) => item.semanticRoles?.includes('CRITICAL_UNSAFE_ACT') && item.semanticConfidence !== 'LOW')
      .map(({ item }) => item.semanticActor?.trim())
      .filter((actor): actor is string => Boolean(actor)),
  )
  const sharedActor = (actor: string | null | undefined, statement: string): boolean => {
    const value = `${actor ?? ''} ${statement}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return /\b(tripulacao|crew|nos|nós|a gente|ambos|eles|pilotos|pilots)\b/.test(value)
      || /,/.test(actor ?? '')
      || /\b(e|and)\b/.test(actor ?? '')
  }
  const semanticFirstPoolRaw = humanFactorScored.filter(({ item }) => item.semanticRoles?.includes('FIRST_DEPARTURE'))
  const semanticFirstPool = semanticCriticalActors.size
    ? semanticFirstPoolRaw.filter(({ item }) => {
        const actor = item.semanticActor?.trim() ?? null
        if (!actor || sharedActor(actor, item.statement)) return true
        return semanticCriticalActors.has(actor)
      })
    : semanticFirstPoolRaw
  // Semantic extraction is advisory, not sovereign. If an isolated FIRST_DEPARTURE
  // annotation belongs to a different individual than every supported critical-act actor,
  // and it is not a shared/team decision, fall back to the factual candidate pool rather
  // than allowing that annotation to redefine the occurrence boundary by itself.
  const baseFirstPool = semanticFirstPool.length ? semanticFirstPool : humanFactorScored
  const phaseResolvedFirstPool = baseFirstPool.some(({ item }) => operationalPhase(item.statement) !== 'GENERIC')
    ? baseFirstPool.filter(({ item }) => operationalPhase(item.statement) !== 'GENERIC')
    : baseFirstPool
  const firstDepartureEntry = [...phaseResolvedFirstPool].sort((a, b) =>
    phaseRank[operationalPhase(a.item.statement)] - phaseRank[operationalPhase(b.item.statement)] ||
    a.item.sourceSentenceIndex - b.item.sourceSentenceIndex,
  )[0] ?? null
  const firstDeparture = firstDepartureEntry?.item ?? null

  type MechanismTag = 'PITCH_CONTROL' | 'STALL_RECOVERY' | 'WARNING_RESPONSE' | 'ICING_MANAGEMENT' | 'APPROACH_CONTROL' | 'DISPATCH' | 'MAINTENANCE'
  const mechanismTags = (statement: string): Set<MechanismTag> => {
    const text = normalized(statement)
    const tags = new Set<MechanismTag>()
    if (/\b(cabrar|nose up|pitch|arfagem|coluna|manche|control column|stick pusher|stick shaker|yoke)\b/.test(text)) tags.add('PITCH_CONTROL')
    if (/\b(stall|recupera[cç][aã]o|recovery|upset|uprt)\b/.test(text)) tags.add('STALL_RECOVERY')
    if (/\b(cruise speed low|degraded performance|increase speed|alerta|warning|master caution|master warning)\b/.test(text)) tags.add('WARNING_RESPONSE')
    if (/\b(gelo|icing|de-icing|anti-icing|airframe)\b/.test(text)) tags.add('ICING_MANAGEMENT')
    if (/\b(aproxima[cç][aã]o|approach|pouso|landing|mda|runway|pista)\b/.test(text)) tags.add('APPROACH_CONTROL')
    if (/\b(despach|dispatch|mel|cco|dov)\b/.test(text)) tags.add('DISPATCH')
    if (/\b(manutenc|maintenance|tlb|preflight|pre-voo|inspe[cç][aã]o)\b/.test(text)) tags.add('MAINTENANCE')
    return tags
  }

  const causalAnalysis = timeline.filter((item) =>
    item.sourceSection === 'REPORT_ANALYSIS' &&
    (!item.assertionStatus || item.assertionStatus === 'AFFIRMED') &&
    !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN') &&
    /\b(contribuiu|contribuinte|contributed|levou a|led to|resultou|resulted|provocou|caused|favoreceu|culminou|aggrav|agravamento|impacto direto)\b/i.test(item.statement),
  )

  function analysisCorroborationScore(candidate: SeraTimelineItem): number {
    const candidateTags = mechanismTags(candidate.statement)
    if (!candidateTags.size) return 0
    let best = 0
    for (const analysis of causalAnalysis) {
      const analysisTags = mechanismTags(analysis.statement)
      const shared = [...candidateTags].filter((tag) => analysisTags.has(tag)).length
      if (!shared) continue
      const overlap = topicalOverlap(candidate.statement, analysis.statement)
      const directContribution = /\b(contribuiu|contributed|levou a|led to|provocou|caused|resultou|resulted|impacto direto)\b/i.test(analysis.statement)
      const mechanismSpecific = candidateTags.has('PITCH_CONTROL') && analysisTags.has('PITCH_CONTROL')
        ? 5
        : candidateTags.has('STALL_RECOVERY') && analysisTags.has('STALL_RECOVERY')
          ? 3
          : 0
      const score = Math.min(shared, 2) * 2 + Math.min(overlap, 3) + (directContribution ? 2 : 0) + mechanismSpecific
      best = Math.max(best, Math.min(score, 10))
    }
    return best
  }

  const nextOutcomeDistance = (candidate: SeraTimelineItem): number | null => {
    const next = timeline
      .filter((item) => item.sourceSentenceIndex > candidate.sourceSentenceIndex)
      .filter((item) => item.sourceSection !== 'REPORT_ANALYSIS' && item.sourceSection !== 'RECOMMENDATION' && item.sourceSection !== 'ADMINISTRATIVE')
      .filter((item) => !['HISTORICAL_COMPARATOR', 'PRE_EVENT_CAUSAL_HISTORY'].includes(item.occurrenceScope ?? 'UNKNOWN'))
      .filter((item) => hasOutcomeSignal(item.statement) || /\b(perda de controle|loss of control)\b/i.test(item.statement))
      .sort((a, b) => a.sourceSentenceIndex - b.sourceSentenceIndex)[0]
    return next ? next.sourceSentenceIndex - candidate.sourceSentenceIndex : null
  }

  function criticalTrajectoryScore(candidate: { item: SeraTimelineItem; score: number }): number {
    const text = normalized(candidate.item.statement)
    const phase = operationalPhase(candidate.item.statement)
    let total = candidate.score
    // Hendy directness gate: a critical act is not selected merely for being late. Discrete
    // control responses, explicit transitions toward loss of control, and source-investigation
    // corroboration of the same mechanism carry more weight than temporal proximity.
    if (isDirectControlResponseStatement(candidate.item.statement)) total += 14
    if (isDirectControlResponseStatement(candidate.item.statement) && /\b(sic|pic|pilotos?|pilots?|tripulacao|tripula[cç][aã]o|comandante|captain|copiloto|first officer|pf|pm)\b/.test(text)) total += 7
    if (isExplicitOperationalOmissionStatement(candidate.item.statement)) total += 3
    if (isExplicitOperationalDeviationStatement(candidate.item.statement)) total += 3
    if (/\b(stall|upset)\b.*\b(recupera[cç][aã]o|recovery)\b|\b(recupera[cç][aã]o|recovery)\b.*\b(stall|upset)\b/.test(text)) total += 6
    if (/\b(provocou|causou|resultou em|levou a|caused|resulted in|led to)\b/.test(text)) total += 6
    if (/\b(checklist|qrh|procedimento|procedimentos|procedure|procedures)\b.*\b(nao foram realizados|nao foram executados|nao foi realizado|nao foi executado|not performed|not executed|failed to perform|failed to execute)\b/.test(text)) total += 3
    if (/\b(continuou|prosseguiu|manteve|continued|proceeded|maintained)\b.*\b(apesar|despite|abaixo|below|insegur|unsafe|gelo|icing)\b/.test(text)) total += 3
    if (/\b(desceu|descendeu|descended|permaneceu|remained)\b.*\b(abaixo|below)\b.*\b(mda|minim|perfil|profile)\b/.test(text)) total += 4
    if (/\b(errad[oa]|incorret[oa]|wrong|incorrect)\b.*\b(pista|runway|destino|destination|peca|part|torque)\b/.test(text)) total += 3
    // Critical-act directness in naturalistic cockpit interviews: these are concrete
    // control/selection acts immediately coupled to the hazardous aircraft state, so they
    // outrank an earlier contextual decision without erasing that first-departure boundary.
    if (/\b(barra na barra|pitch down)\b/.test(text)) total += 16
    if (/\b(desacoplou|cancelou|disengaged|cancelled)\b.{0,100}\b(automatismo|diretor de voo|flight director|autopilot|automacao|automation)\b/.test(text)) total += 12
    if (/\b(tirei|tirou|retirei|retirou|desguarneci)\b.{0,120}\b(mao|mão)\b.{0,100}\b(coletivo|collective|comando)\b/.test(text)) total += 12
    // Colloquial cockpit narratives often describe the decisive control act without a
    // formal actor label ("o cara meteu a mão", "puxou o cíclico/coletivo"). Preserve
    // that observable act as a strong critical-act candidate even if the AI misses it.
    if (/\b(meteu|puxou|puxei|mexeu|moveu|movimentou|empurrou|empurrei)\b.{0,140}\b(comandos?|ciclico|cíclico|coletivo|cyclic|collective|manche|stick)\b/.test(text)) total += 24
    if (/\b(julguei|julgou|preferi|preferiu|escolhi|escolheu|decidi|decidiu)\b.{0,180}\b(lado|pouso|pousar)\b.{0,220}\b(obstaculo|obstáculo|margem|risco|trabalhoso|mais perto)\b/.test(text)) total += 9
    if (/\b(preferi|preferiu|escolhi|escolheu|decidi|decidiu)\b.{0,180}\b(pouso|pousar)\b.{0,120}\b(mesmo sabendo)\b/.test(text)) total += 14
    total += analysisCorroborationScore(candidate.item)
    const distance = nextOutcomeDistance(candidate.item)
    if (distance !== null) total += distance <= 2 ? 4 : distance <= 5 ? 3 : distance <= 12 ? 2 : distance <= 30 ? 1 : 0
    if (irreversibilityItem && candidate.item.sourceSentenceIndex < irreversibilityItem.sourceSentenceIndex) {
      const irreversibleDistance = irreversibilityItem.sourceSentenceIndex - candidate.item.sourceSentenceIndex
      total += irreversibleDistance <= 20 ? 5 : irreversibleDistance <= 80 ? 3 : irreversibleDistance <= 1000 ? 1 : 0
    }
    // Operational phase is only a weak tie-breaker.
    total += phase === 'APPROACH' || phase === 'INFLIGHT' ? 1 : 0
    return total
  }

  const criticalSelectionPool = selectedPool
  const criticalRanked = [...criticalSelectionPool].sort((a, b) =>
    criticalTrajectoryScore(b) - criticalTrajectoryScore(a) ||
    b.item.sourceSentenceIndex - a.item.sourceSentenceIndex,
  )

  const isConcreteUnsafeActCandidate = (candidate: { item: SeraTimelineItem; score: number }): boolean => {
    const text = normalized(candidate.item.statement)
    if (candidate.item.semanticRoles?.includes('OUTCOME') || candidate.item.occurrenceScope === 'HISTORICAL_COMPARATOR') return false
    if (candidate.item.semanticRoles?.includes('CRITICAL_UNSAFE_ACT') && candidate.item.semanticConfidence !== 'LOW') return true
    if (isExplicitOperationalDeviationStatement(candidate.item.statement) || isExplicitOperationalOmissionStatement(candidate.item.statement)) return true
    return /\b(barra na barra|pitch down|desacoplou|cancelou|disengaged|cancelled|meteu|puxou|puxei|empurrou|empurrei|tirei|tirou|retirei|retirou|desguarneci)\b/.test(text)
      || /\b(julguei|julgou|preferi|preferiu|escolhi|escolheu|decidi|decidiu)\b.{0,180}\b(pouso|pousar|lado)\b.{0,220}\b(risco|obstaculo|obstáculo|margem|mais trabalhoso|mais perto)\b/.test(text)
  }

  let criticalEntry = criticalRanked[0] ?? null
  // Semantic extraction may over-label the first departure as the critical act as well.
  // If a later, concrete unsafe act is strongly supported on the same occurrence trajectory,
  // preserve Hendy's split: first departure delimits the trajectory; the later act anchors P/O/A.
  if (firstDeparture && criticalEntry?.item.statement === firstDeparture.statement) {
    const firstScore = criticalTrajectoryScore(criticalEntry)
    const downstreamConcrete = criticalRanked.find((candidate) =>
      candidate.item.sourceSentenceIndex > firstDeparture.sourceSentenceIndex
      && isConcreteUnsafeActCandidate(candidate)
      && criticalTrajectoryScore(candidate) >= Math.max(18, firstScore - 12),
    )
    if (downstreamConcrete) criticalEntry = downstreamConcrete
  }
  const criticalTopScore = criticalEntry ? criticalTrajectoryScore(criticalEntry) : 0
  const criticalCandidateAlternatives = criticalRanked
    .filter((candidate) => candidate.item.statement !== criticalEntry?.item.statement)
    .filter((candidate) => candidate.item.statement !== firstDeparture?.statement)
    .filter((candidate) => criticalTopScore - criticalTrajectoryScore(candidate) <= 4)
    .slice(0, 3)
    .map((candidate) => candidate.item.statement)
  const criticalAct = criticalEntry?.item ?? firstDeparture
  const primaryAnchor = firstDeparture ?? criticalAct
  const poaAnchor = criticalEntry?.item ?? firstDeparture
  const poaAnchorBasis: CandidateEscapeWindow['poaAnchorBasis'] = criticalEntry
    ? 'CRITICAL_UNSAFE_ACT'
    : firstDeparture
      ? 'FIRST_DEPARTURE_FALLBACK'
      : 'UNRESOLVED'
  const supportingItems = primaryAnchor ? episodeSupport(primaryAnchor, timeline) : []
  const criticalSupportItems = criticalAct ? episodeSupport(criticalAct, timeline) : []
  const firstDepartureSupportingItems = firstDeparture ? episodeSupport(firstDeparture, timeline) : []
  const firstDepartureSupportingEvidence = firstDeparture
    ? [...new Set([
        firstDeparture.statement,
        ...firstDepartureSupportingItems
          .filter((item) => {
            if (item.statement === firstDeparture.statement) return true
            const firstTags = mechanismTags(firstDeparture.statement)
            const sharedMechanisms = [...mechanismTags(item.statement)].filter((tag) => firstTags.has(tag)).length
            return sharedMechanisms >= 2 && topicalOverlap(item.statement, firstDeparture.statement) >= 2
          })
          .map((item) => item.statement),
      ])]
    : []
  const criticalUnsafeActSupportingEvidence = criticalAct
    ? [...new Set([
        criticalAct.statement,
        ...criticalSupportItems
          .filter((item) => item.statement === criticalAct.statement || topicalOverlap(item.statement, criticalAct.statement) >= 2)
          .map((item) => item.statement),
      ])]
    : []
  const sameEpisodeCandidates = primaryAnchor
    ? selectedPool.map(({ item }) => item).filter((item) => supportingItems.some((support) => support.statement === item.statement))
    : []
  const earliest = firstDeparture
  const latest = criticalAct
  const effectiveItems = selectedPool.map(({ item }) => item)
  const sameBoundary = Boolean(earliest && latest && earliest.statement === latest.statement)
  const anchorBasis: CandidateEscapeWindow['anchorBasis'] = !primaryAnchor
    ? 'UNRESOLVED'
    : sameBoundary
      ? 'FIRST_DEPARTURE_AND_CRITICAL_ACT'
      : firstDeparture
        ? 'FIRST_DEPARTURE_PRIMARY'
        : 'FIRST_DEPARTURE_ONLY'

  const counterEvidence: string[] = []
  let progressiveBoundary = false
  if (!effectiveItems.length) counterEvidence.push('No explicit pre-outcome controllable departure statement was found in admissible factual evidence.')
  if (!outcomeItem && sameEpisodeCandidates.length > 1) counterEvidence.push('No explicit consequence boundary was detected inside the selected operational episode; multiple departure moments require review.')
  if (sameEpisodeCandidates.length > 1) counterEvidence.push('Multiple departure candidates remain inside the selected operational episode; Hendy first-departure and critical-act landmarks are retained separately for review.')
  if (earliest && latest && earliest.statement !== latest.statement) counterEvidence.push('Hendy boundary split: the first departure from safe operation and the most critical unsafe act/condition are different supported landmarks. The first departure delimits the safe→unsafe trajectory; P/O/A is bound to the critical unsafe act/condition and its directly involved operator.')
  if (criticalCandidateAlternatives.length) counterEvidence.push(`Critical-act alternatives remain close in trajectory support and require human review: ${criticalCandidateAlternatives.join(' | ')}`)
  if (irreversibilityItem) counterEvidence.push(`Explicit no-return/irreversibility boundary preserved from the source: ${irreversibilityItem.statement}`)
  const humanEpisodeCandidates = episodeCandidates.filter((episode) => episode.humanFactorEligible)
  if (humanEpisodeCandidates.length > 1) counterEvidence.push('Multiple human-factor unsafe-act/condition candidates were identified across the event. SERA analyses one unsafe act at a time; the proposed critical-act anchor is provisional and requires human confirmation of the Hendy boundary.')
  if (earliest && /\b(developed across several moments|across several moments|progressively|gradually|allowed .* to develop|desenvolveu[- ]?se (?:ao longo de|em) (?:v[aá]rios|diversos) momentos|permitiu .* (?:desenvolver|evoluir)|zona progressiva)\b/i.test(earliest.statement)) {
    progressiveBoundary = true
    counterEvidence.push('The narrative explicitly describes the departure as progressive across multiple moments; retain a progressive-zone boundary for human review.')
  }
  if (earliest && /\b(continued visually|continued visual|continuou visualmente|prosseguiu visualmente)\b/i.test(earliest.statement)) {
    const laterUnsafeState = timeline.some((item) => item.sourceSentenceIndex > earliest.sourceSentenceIndex && /\b(high descent rate|low airspeed|low-energy|alta raz[aã]o de descida|baixa velocidade|baixa energia)\b/i.test(item.statement))
    if (laterUnsafeState) {
      progressiveBoundary = true
      counterEvidence.push('Visual continuation was followed by a developing unsafe energy state; the safe-operation boundary is retained as a progressive zone.')
    }
  }

  if (primaryAnchor) {
    const selectedEpisode = episodeCandidates.find((episode) => episode.anchorStatement === primaryAnchor.statement)
      ?? episodeCandidates.find((episode) => episode.humanFactorEligible && episode.supportingEvidence.includes(primaryAnchor.statement))
    if (selectedEpisode) selectedEpisode.selected = true
  }

  const anchorType = primaryAnchor
    ? classifyHumanFactorEscapeStatement(primaryAnchor.statement)
      ?? (primaryAnchor.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT') ? 'UNSAFE_ACT' : null)
    : null
  const humanFactorGate = anchorType
    ? {
        status: 'PASSED' as const,
        anchorType,
        rationale: [
          'Hendy gate: the anchor is an observable operator unsafe act/inaction or operator-controlled unsafe condition on the occurrence trajectory.',
          'The first departure from safe operation and the critical unsafe act are retained separately when they do not coincide; P/O/A is bound to the critical unsafe act/condition and its directly involved operator.',
          'Technical, environmental, maintenance, dispatch and organizational facts that only set the scene remain context/preconditions rather than displacing the directly outcome-linked unsafe act.',
        ],
      }
    : {
        status: 'BLOCKED' as const,
        anchorType: null,
        rationale: [
          'No observable unsafe act/inaction or operator-controlled unsafe condition was established.',
          'SERA cannot start P/O/A traversal from a purely technical, environmental or documentary condition.',
        ],
      }

  return {
    statement: primaryAnchor ? `Human-factor first-departure candidate: "${primaryAnchor.statement}".` : null,
    earliestCandidate: earliest?.statement ?? null,
    latestCandidate: latest?.statement ?? null,
    firstDepartureCandidate: earliest?.statement ?? null,
    criticalUnsafeActCandidate: latest?.statement ?? null,
    criticalCandidateAlternatives,
    irreversibilityBoundaryCandidate: irreversibilityItem?.statement ?? null,
    anchorBasis,
    firstDepartureSupportingEvidence,
    criticalUnsafeActSupportingEvidence,
    poaAnchorCandidate: poaAnchor?.statement ?? null,
    poaAnchorSupportingEvidence: criticalEntry
      ? criticalUnsafeActSupportingEvidence
      : firstDepartureSupportingEvidence,
    poaAnchorBasis,
    supportingEvidence: firstDepartureSupportingEvidence.length ? firstDepartureSupportingEvidence : criticalUnsafeActSupportingEvidence,
    counterEvidence,
    progressiveBoundary,
    episodeCandidates,
    humanFactorGate,
  }
}
