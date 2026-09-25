import type { SeraTimelineItem } from '../engine-contract'
import { isPostEscapeStatement } from '../evidence/temporal-scope'
import { OUTCOME_KEYWORDS } from './factual-extraction-helpers'

type CandidateEscapeWindow = {
  statement: string | null
  earliestCandidate: string | null
  latestCandidate: string | null
  supportingEvidence: string[]
  counterEvidence: string[]
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
  return !isPostEscapeStatement(item.statement)
}

function candidateScore(sentence: string): number {
  // Statements about what the report does not describe, what an investigation focuses on,
  // or what was not recorded are evidence limitations/meta-analysis, never operational escape points.
  if (/\b(n[aã]o h[aá] descri[cç][aã]o|n[aã]o foi descrito|n[aã]o ficou registrado|relat[oó]rio foca|relat[oó]rio (?:n[aã]o )?descreve|par[aá]grafo .* menciona apenas|no description|not described|not recorded|report focuses|report does not describe|report only mentions)\b/i.test(sentence)) return -20
  const text = normalized(sentence)
  let score = 0
  if (/\b(identificou|reconheceu|entendeu)\b.*\bcomo\b.*\b(pouso|destino|unidade|plataforma|pista|helideck)\b/.test(text)) score += 9
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
  if (/\bcontinued visually|continued visual|continuou visualmente|prosseguiu visualmente\b.*\b(low cloud|poor visibility|degraded visibility|nuvens? baixas?|baixa visibilidade|visibilidade degradada)\b/.test(text)) score += 8
  if (/\b(lost (?:the )?sense of height|lost visual reference|perdeu (?:a )?no[cç][aã]o de altura|perdeu (?:a )?refer[eê]ncia visual)\b/.test(text)) score += 8

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

export function buildCandidateEscapeWindow(timeline: SeraTimelineItem[]): CandidateEscapeWindow {
  const outcomeItem = timeline.find((item) =>
    (!item.assertionStatus || item.assertionStatus === 'AFFIRMED') &&
    item.sourceSection !== 'REPORT_ANALYSIS' &&
    item.sourceSection !== 'RECOMMENDATION' &&
    item.sourceSection !== 'ADMINISTRATIVE' &&
    hasOutcomeSignal(item.statement)
  ) ?? null
  const candidateItems = timeline.filter((item) => hasControlWindowSignal(item) && !hasOutcomeSignal(item.statement))
  const scored = candidateItems
    .map((item) => ({ item, score: candidateScore(item.statement) }))
    .filter(({ score }) => score >= 5)

  // Routine activity is not an escape point. Without an explicit unsafe-departure signal,
  // abstain instead of promoting a generic crew action into the causal anchor.
  const effectiveItems = scored.map(({ item }) => item)
  const earliest = effectiveItems[0] ?? null
  const beliefCandidates = scored.filter(({ item }) => /\b(identificou|entendemos|acreditou|assumiu|associou|misidentified|mistook)\b/i.test(item.statement))
  const sameBeliefBoundary = beliefCandidates.length > 0 && beliefCandidates.length === scored.length
  const decisionCommitment = Boolean(earliest && /\b(decided|chose|opted|decidiu|decidiram|optou|escolheu)\b.*\b(start|initiate|iniciar|come[cç]ar)\b.*\b(crank|cranking|partida|giro)\b/i.test(earliest.statement))
  const latest = (sameBeliefBoundary || decisionCommitment) ? earliest : (effectiveItems[effectiveItems.length - 1] ?? earliest)
  const supportingItems = decisionCommitment && earliest ? [earliest] : effectiveItems

  const counterEvidence: string[] = []
  if (!effectiveItems.length) counterEvidence.push('No explicit pre-outcome controllable departure statement was found in admissible factual evidence.')
  if (!outcomeItem && scored.length > 1) counterEvidence.push('No explicit consequence boundary was detected; multiple candidate departure moments require review.')
  if (scored.length > 1 && !sameBeliefBoundary && !decisionCommitment) counterEvidence.push('Multiple pre-outcome departure candidates remain; earliest supported candidate retained for first-departure review.')
  if (earliest && /\b(developed across several moments|across several moments|progressively|gradually|allowed .* to develop|desenvolveu[- ]?se (?:ao longo de|em) (?:v[aá]rios|diversos) momentos|permitiu .* (?:desenvolver|evoluir)|zona progressiva)\b/i.test(earliest.statement)) {
    counterEvidence.push('The narrative explicitly describes the departure as progressive across multiple moments; retain a progressive-zone boundary for human review.')
  }
  if (earliest && /\b(continued visually|continued visual|continuou visualmente|prosseguiu visualmente)\b/i.test(earliest.statement)) {
    const laterUnsafeState = timeline.some((item) => item.sourceSentenceIndex > earliest.sourceSentenceIndex && /\b(high descent rate|low airspeed|low-energy|alta raz[aã]o de descida|baixa velocidade|baixa energia)\b/i.test(item.statement))
    if (laterUnsafeState) counterEvidence.push('Visual continuation was followed by a developing unsafe energy state; the safe-operation boundary is retained as a progressive zone.')
  }

  return {
    statement: earliest ? `First supported safe-operation departure candidate: "${earliest.statement}".` : null,
    earliestCandidate: earliest?.statement ?? null,
    latestCandidate: latest?.statement ?? null,
    supportingEvidence: supportingItems.map((item) => item.statement),
    counterEvidence,
  }
}
