import type { SeraTimelineItem } from '../engine-contract'
import { isPostEscapeStatement } from '../evidence/temporal-scope'
import { isExplicitOperationalDeviationStatement, isExplicitOperationalOmissionStatement, isOperationalEventStatement, OUTCOME_KEYWORDS } from './factual-extraction-helpers'

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
  supportingEvidence: string[]
  counterEvidence: string[]
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
  return /\b(pousou|realizou o pouso|efetuou o pouso|conclu(?:iu|ir) o pouso|landed|completed the landing)\b.*\b(errad[oa]|erroneamente|equivocad[oa]|nao previst[oa]|nao autorizad[oa]|erro|wrong|different|diferente|distint[ao]|different destination|destino diferente)\b/.test(lower)
    || /\bapos concluir o pouso|after (?:completing|the) landing\b/.test(lower) || /\b(apos concluir o pouso|after landing|after touchdown)\b/.test(lower)
}

function admissible(item: SeraTimelineItem): boolean {
  if (item.assertionStatus && item.assertionStatus !== 'AFFIRMED') return false
  if (item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION' || item.sourceSection === 'ADMINISTRATIVE') return false
  if (item.occurrenceScope === 'HISTORICAL_COMPARATOR') return false
  if (!isOperationalEventStatement(item.statement)) return false
  return !isPostEscapeStatement(item.statement)
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
  if (/\b(aproximacao|approach|final|pouso|landing|go-around|arremet)\b/.test(text)) return 'APPROACH'
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
  return /\b(tripulacao|crew|piloto|pilot|comandante|captain|copiloto|first officer|pic|sic|pf|pm|operador|operator|mecanico|mechanic|tecnico de manutencao|maintenance technician|inspetor|inspector|despachante|dispatcher|cco|dov|eles|they)\b/.test(text)
}

function isOperatorControlledUnsafeCondition(statement: string): boolean {
  const text = normalized(statement)
  return /\b(aeronave|aircraft)\b.*\b(desceu|descendeu|descended|permaneceu|remained|entrou|entered|alinhou|lined up|pousou|landed)\b.*\b(abaixo|below|mda|minim[oa]|perfil|profile|sem referencia|without visual|pista|runway|insegur|unsafe)\b/.test(text)
    || /\b(separacao|separation|clearance|distancia|distance)\b.*\b(abaixo|below|menor que|less than)\b.*\b(minim[oa]|required|requerid[oa]|aceitavel|acceptable)\b/.test(text)
    || /\b(instalacao|installation)\b.*\b(peca errada|wrong part|incorrect part)\b/.test(text)
    || /\b(torque)\b.*\b(errad[oa]|incorret[oa]|wrong|incorrect|fora do limite|out of limit)\b/.test(text)
}

function hasObservableHumanAct(statement: string): boolean {
  const text = normalized(statement)
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
  return /\b(decidiu|decidiram|optou|escolheu|continuou|continuaram|prosseguiu|prosseguiram|manteve|mantiveram|selecionou|acionou|desligou|ligou|executou|executaram|omitiu|deixou de|falhou|iniciou|iniciaram|iniciado|iniciada|inseriu|programou|ajustou|configurou|conduziu|conduziram|preparou|prepararam|passou|passaram|aproximou|aproximaram|desceu|desceram|subiu|subiram|moveu|moveram|puxou|puxaram|empurrou|empurraram|alinhou|alinharam|permitiu|permitiram|hesitou|hesitaram|demorou|demoraram|esperou|esperaram|decided|chose|opted|continued|proceeded|maintained|selected|executed|failed to|did not|initiated|started|inserted|programmed|configured|conducted|prepared|approached|began|started|descended|climbed|moved|pulled|pushed|lined up|allowed|hesitated|delayed|waited)\b/.test(text)
}

export function classifyHumanFactorEscapeStatement(statement: string): HumanFactorEscapeAnchorType | null {
  if (!isOperationalEventStatement(statement)) return null
  if (hasObservableHumanAct(statement)) return 'UNSAFE_ACT'
  if (isOperatorControlledUnsafeCondition(statement)) return 'OPERATOR_CONTROLLED_UNSAFE_CONDITION'
  return null
}

function seraEpisodeRole(item: SeraTimelineItem): SeraEpisodeRole {
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
  let score = 0
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
  if (/\b(iniciou|iniciaram|prosseguiu|prosseguiram|conduziu|conduziram|alinhou|alinhados|aproximou|approach|lined up|continued)\b.*\b(pouso|aproximacao|approach|landing|destino|unidade|plataforma|pista|helideck)\b/.test(text)) score += 6
  if (/\bpassou a\b.*\b(conduzir|preparar|realizar|executar|prosseguir|aproximar|alinhar|descer)\b.*\b(aproximacao|pouso|destino|unidade|plataforma|pista|helideck|unit-[a-z0-9-]+)\b/.test(text)) score += 6
  if (/\b(nao reconfirm|nao confirm|nao verific|nao confer|sem reconfirm|sem confirm|failed to verify|did not verify|did not confirm)\b/.test(text)) score += 5
  if (/\b(did not|failed to|neither pilot|nao|nenhum dos pilotos|nenhum piloto)\b.*\b(notic\w*|perceiv\w*|recogniz\w*|process\w*|initiat\w*|call(?:ed)? for|insist\w*|notou|percebeu|reconheceu|processou|iniciou|chamou|insistiu)\b/.test(text)) score += 8
  if (/\b(inserted|selected|set|programmed|inseriu|selecionou|programou|ajustou)\b.*\b(different|wrong|incorrect|diferente|errad[oa]|incorret[oa])\b/.test(text)) score += 9
  if (/\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(take off|continue|proceed|descend|decolar|continuar|prosseguir|descer)\b/.test(text)) score += 8
  if (/\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(attempt|try|realizar|tentar|efetuar)\b.*\b(flight|voo|departure|partida)\b.*\b(despite|apesar|mesmo com)\b/.test(text)) score += 8
  if (/\b(crew|tripulacao|tripulação|a tripulacao|a tripulação)\b.*\b(partiu|decolou|departed|took off|prosseguiu)\b.*\b(despite|apesar|mesmo com)\b.*\b(piora|worsening|condi[cç][oõ]es?|weather|meteorolog)\b/.test(text)) score += 8
  if (/\b(pulled|pushed|moved|puxou|empurrou|moveu)\b.*\b(control column|column|stick|cyclic|collective|coluna|manche|c[ií]clico|coletivo|comando)\b.*\b(instead of|em vez de|ao inv[eé]s de)\b/.test(text)) score += 10
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
  if (/\b(decidiu|continuou|executou|desceu|subiu|virou|tripula|pilot|crew)\b/.test(text)) score += 1
  if (/\b(sem incidentes|sem intercorr[eê]ncias|without incident|safely|normal landing|pouso normal)\b/.test(text)) score -= 10
  if (hasOutcomeSignal(sentence)) score -= 10
  return score
}

function hasControlWindowSignal(item: SeraTimelineItem): boolean {
  if (!admissible(item)) return false
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
      humanFactorEligible: role !== 'TECHNICAL_ENVIRONMENT' && classifyHumanFactorEscapeStatement(item.statement) !== null,
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
    item.occurrenceScope !== 'HISTORICAL_COMPARATOR' &&
    hasOutcomeSignal(item.statement)
  ) ?? null
  const candidateItems = timeline.filter((item) => hasControlWindowSignal(item) && !hasOutcomeSignal(item.statement))
  const scored = candidateItems
    .map((item) => ({ item, score: candidateScore(item.statement) }))
    .filter(({ score }) => score >= 5)
  const episodeCandidates = buildEpisodeCandidates(scored, timeline)

  // Global reconstruction may see technical, environmental and organizational facts, but SERA
  // classification starts only from an observable unsafe act/inaction or an operator-controlled unsafe condition.
  // No operator group or operational phase is privileged in advance: maintenance, dispatch and flight-crew
  // acts can each be valid SERA anchors if they mark the supported departure from safe operation.
  const humanFactorScored = scored.filter(({ item }) => classifyHumanFactorEscapeStatement(item.statement) !== null)
  const selectedPool = [...humanFactorScored].sort((a, b) => a.item.sourceSentenceIndex - b.item.sourceSentenceIndex)
  const effectiveItems = selectedPool.map(({ item }) => item)
  const earliest = effectiveItems[0] ?? null
  const beliefCandidates = selectedPool.filter(({ item }) => /\b(identificou|entendemos|acreditou|assumiu|associou|misidentified|mistook)\b/i.test(item.statement))
  const sameBeliefBoundary = beliefCandidates.length > 0 && beliefCandidates.length === selectedPool.length
  const decisionCommitment = Boolean(earliest && /\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(start|initiate|iniciar|come[cç]ar)\b.*\b(crank|cranking|partida|giro)\b/i.test(earliest.statement))
  const supportingItems = earliest ? episodeSupport(earliest, timeline) : []
  const sameEpisodeCandidates = earliest
    ? effectiveItems.filter((item) => supportingItems.some((support) => support.statement === item.statement))
    : []
  const latest = (sameBeliefBoundary || decisionCommitment) ? earliest : (sameEpisodeCandidates[sameEpisodeCandidates.length - 1] ?? earliest)

  const counterEvidence: string[] = []
  if (!effectiveItems.length) counterEvidence.push('No explicit pre-outcome controllable departure statement was found in admissible factual evidence.')
  if (!outcomeItem && sameEpisodeCandidates.length > 1) counterEvidence.push('No explicit consequence boundary was detected inside the selected operational episode; multiple departure moments require review.')
  if (sameEpisodeCandidates.length > 1 && !sameBeliefBoundary && !decisionCommitment) counterEvidence.push('Multiple departure candidates remain inside the selected operational episode; the earliest supported candidate is retained for first-departure review.')
  const humanEpisodeCandidates = episodeCandidates.filter((episode) => episode.humanFactorEligible)
  if (humanEpisodeCandidates.length > 1) counterEvidence.push('Multiple human-factor unsafe-act/condition candidates were identified across the event. SERA analyses one unsafe act at a time; the earliest supported candidate is provisional and requires human confirmation of the escape boundary.')
  if (earliest && /\b(developed across several moments|across several moments|progressively|gradually|allowed .* to develop|desenvolveu[- ]?se (?:ao longo de|em) (?:v[aá]rios|diversos) momentos|permitiu .* (?:desenvolver|evoluir)|zona progressiva)\b/i.test(earliest.statement)) {
    counterEvidence.push('The narrative explicitly describes the departure as progressive across multiple moments; retain a progressive-zone boundary for human review.')
  }
  if (earliest && /\b(continued visually|continued visual|continuou visualmente|prosseguiu visualmente)\b/i.test(earliest.statement)) {
    const laterUnsafeState = timeline.some((item) => item.sourceSentenceIndex > earliest.sourceSentenceIndex && /\b(high descent rate|low airspeed|low-energy|alta raz[aã]o de descida|baixa velocidade|baixa energia)\b/i.test(item.statement))
    if (laterUnsafeState) counterEvidence.push('Visual continuation was followed by a developing unsafe energy state; the safe-operation boundary is retained as a progressive zone.')
  }

  if (earliest) {
    const selectedEpisode = episodeCandidates.find((episode) => episode.anchorStatement === earliest.statement)
      ?? episodeCandidates.find((episode) => episode.humanFactorEligible && episode.supportingEvidence.includes(earliest.statement))
    if (selectedEpisode) selectedEpisode.selected = true
  }

  const anchorType = earliest ? classifyHumanFactorEscapeStatement(earliest.statement) : null
  const selectedRole = earliest ? seraEpisodeRole(earliest) : null
  const humanFactorGate = anchorType
    ? {
        status: 'PASSED' as const,
        anchorType,
        rationale: [
          'SERA anchor is an observable operator unsafe act/inaction or operator-controlled unsafe condition, without privileging a particular operator group or phase.',
          'Technical, environmental and organizational facts may support context or preconditions but cannot by themselves determine P/O/A.',
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
    statement: earliest ? `Human-factor safe-operation departure candidate: "${earliest.statement}".` : null,
    earliestCandidate: earliest?.statement ?? null,
    latestCandidate: latest?.statement ?? null,
    supportingEvidence: supportingItems.map((item) => item.statement),
    counterEvidence,
    episodeCandidates,
    humanFactorGate,
  }
}
