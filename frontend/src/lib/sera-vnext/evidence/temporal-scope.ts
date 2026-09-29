import type { SeraEvidenceSourceSection, SeraTimelineItem } from '../engine-contract'
import type { SeraEvidenceTemporalRelation } from './types'
import { isNonCausalDocumentStatement, isOperationalEventStatement, isProcedureReferenceStatement, isSystemDescriptionStatement } from '../engine-v0/factual-extraction-helpers'

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasConsequenceMarker(text: string): boolean {
  return /\b(a aeronave|aircraft)\b.{0,180}\b(colidiu|impactou|caiu|crashed|impacted|struck|ditched|was destroyed|ficou destru[ií]da)\b/i.test(text)
    || /\b(colis[aã]o|impacto)\b.{0,100}\b(contra|com|against|with)\b.{0,60}\b(solo|terreno|ground|terrain|resid[eê]ncia|obst[aá]culo)\b/i.test(text)
    || /\b(ap[oó]s|depois d[ao]|following|after)\b.{0,60}\b(colis[aã]o|impacto|crash|collision)\b/i.test(text)
    || /\b(resultou|evoluiu|culminou|causou|resulted|led to|culminated)\b.{0,160}\b(colis[aã]o|impacto|crash|collision|fatal|inc[eê]ndio|fire)\b/i.test(text)
    || /\b(destro[cç]os|wreckage|fogo p[oó]s[- ]?impacto|post[- ]impact fire)\b/i.test(text)
    || /\b(pousou|realizou o pouso|efetuou o pouso|concluiu o pouso|landed|touchdown)\b.*\b(errad[oa]|equivocad[oa]|erroneamente|por engano|mistakenly|erroneously|nao previst[oa]|não previst[oa]|nao autorizad[oa]|não autorizad[oa]|erro|wrong|diferente|distint[ao]|different|confundindo)\b/i.test(text)
    || /\b(pousou|landed)\b.*\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|helideck)\b.*\b(embora|although)\b.*\b(destino|rota|planned destination|planned route)\b/i.test(text)
    || /\b(ap[oó]s (?:concluir )?o pouso|depois do pouso|ap[oó]s o toque|depois do toque|after landing|after touchdown)\b/i.test(text)
}

function hasRecoveryMarker(text: string): boolean {
  return /\b(recovery|recover(?:ed|y)?|arrested|corrected|go around|go-around|late corrective|correction|finally recognized|later recognition|recovery control inputs)\b/i.test(text)
}

function hasExplicitPostEscapeCue(text: string): boolean {
  const normalized = normalize(text)
  if (/\b(?:only\s+)?later\b.{0,60}\b(?:impact|impacto|collision|colis[aã]o|crash|terrain|terreno)\b/i.test(text)
    || /\b(?:posteriormente|mais tarde)\b.{0,60}\b(?:impacto|colis[aã]o|acidente|terreno)\b/i.test(text)) return true
  if (/\b(after|only after|only later|later|seconds later|subsequently|following|posteriormente|mais tarde|depois)\b/.test(normalized) && (hasConsequenceMarker(text) || hasRecoveryMarker(text) || /\b(pouso|landing|touchdown)\b/.test(normalized))) return true
  if (/\b(after .*already|already occurred|already below|had already (?:departed|occurred|escalated))\b/.test(normalized)) return true
  if (/\b(?:\d+\s*)?(?:segundos?|instantes?|momentos?)\s+antes\s+d[oa]\s+(?:impacto|colis[aã]o|acidente)\b/i.test(text)) return true
  if (/\b(during the recovery|recovery control inputs|finally recognized|very low height above the water)\b/.test(normalized)) return true
  if (/\b(later (?:struck|impacted|ditched|crashed|hit)|struck terrain|struck runway lights|impact with terrain)\b/.test(normalized)) return true
  return false
}

function isOpeningTemporalContext(text: string): boolean {
  return /\b(after (?:takeoff|departure|offshore departure)|during (?:approach|taxi|final approach|compressor wash|execution)|on visual approach)\b/i.test(text)
}

function hasExplicitPreEscapeCue(text: string): boolean {
  return /\b(during approach|during final approach|during taxi|on visual approach|before landing|before takeoff|before departure|before dispatch|prior to landing|prior to takeoff|prior to departure|prior to dispatch|rota prevista|planejamento|coordenadas? (?:foram )?inseridas?|gps|briefing|checklist|autoriza[cç][aã]o|proa direta|na aproxima[cç][aã]o|antes do pouso|antes da decolagem|antes do despacho|antes da aproxima[cç][aã]o)\b/i.test(text)
}

type OperationalPhase = 'MAINTENANCE' | 'DISPATCH' | 'INFLIGHT' | 'APPROACH'

function operationalPhase(text: string): OperationalPhase | null {
  const normalized = normalize(text)
  if (/\b(despach\w*|dispatch\w*|mel|cco|dov|antes do despacho|before dispatch|planejamento de voo|flight planning|n[ií]vel de voo planejado|planned flight level)\b/.test(normalized)) return 'DISPATCH'
  if (/\b(manutenc|maintenance|mecan|mechanic|inspecao pre-voo|preflight inspection|tlb)\b/.test(normalized)) return 'MAINTENANCE'
  if (/\b(aproximacao|approach|aproximacao final|final approach|pouso|landing|go-around|arremet|runway|pista|lined up|line up|wrong surface)\b/.test(normalized)) return 'APPROACH'
  if (/\b(subida|climb|cruzeiro|cruise|descida|descent|durante o voo|during the flight|durante o voo em rota|during cruise|fl\d{2,3}|nivelamento|levelled|leveling|de-icing|anti-icing|airframe|cruise speed|degraded performance|increase speed|gelo|icing|stall)\b/.test(normalized)) return 'INFLIGHT'
  return null
}

function relativePhaseRelation(statement: string, escapePointStatement?: string | null): SeraEvidenceTemporalRelation | null {
  if (!escapePointStatement) return null
  const statementPhase = operationalPhase(statement)
  const escapePhase = operationalPhase(escapePointStatement)
  if (!statementPhase || !escapePhase || statementPhase === escapePhase) return null
  const rank: Record<OperationalPhase, number> = { MAINTENANCE: 0, DISPATCH: 1, INFLIGHT: 2, APPROACH: 3 }
  return rank[statementPhase] < rank[escapePhase] ? 'PRE_ESCAPE' : 'POST_ESCAPE'
}

export function classifyTemporalRelation(args: {
  statement: string
  sourceSentenceIndex: number
  latestEscapeSentenceIndex?: number | null
  escapePointStatement?: string | null
  sourceSection?: SeraEvidenceSourceSection
}): SeraEvidenceTemporalRelation {
  // Administrative, recommendation, and investigator-analysis prose are documentary layers,
  // not event-time observations. Keep them temporally unclassified instead of mislabeling
  // words such as "accident" or "impact" as post-escape facts.
  if (args.sourceSection === 'ADMINISTRATIVE' || args.sourceSection === 'RECOMMENDATION' || args.sourceSection === 'REPORT_ANALYSIS') return 'UNKNOWN'
  if (isNonCausalDocumentStatement(args.statement) || isProcedureReferenceStatement(args.statement) || isSystemDescriptionStatement(args.statement)) return 'UNKNOWN'
  if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex === args.latestEscapeSentenceIndex) return 'AT_ESCAPE'
  if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex > args.latestEscapeSentenceIndex
      && /^(?:\s*)(?:nesse momento|naquele momento|em seguida|na sequ[eê]ncia|logo ap[oó]s|depois|posteriormente|then|at that moment|subsequently|afterward)\b/i.test(args.statement)
      && isOperationalEventStatement(args.statement)) return 'POST_ESCAPE'
  if (hasExplicitPostEscapeCue(args.statement)) return 'POST_ESCAPE'
  if (hasConsequenceMarker(args.statement) && !isOpeningTemporalContext(args.statement)) return 'POST_ESCAPE'
  if (hasExplicitPreEscapeCue(args.statement)) return 'PRE_ESCAPE'

  // Operational phase is stronger than document order in investigation reports. A dispatch
  // escape point makes later in-flight/approach facts post-escape even when those facts are
  // summarized elsewhere in the report; maintenance facts remain pre-escape. The reverse
  // applies for a later-phase anchor.
  const phaseRelation = isOperationalEventStatement(args.statement)
    ? relativePhaseRelation(args.statement, args.escapePointStatement)
    : null
  if (phaseRelation) return phaseRelation

  // Use document order only for genuinely operational event statements. This prevents a
  // glossary, regulation, system description, or topic-based report section appearing later
  // in the document from being mislabeled as chronologically post-escape.
  const conversationalNarrativeAnchor = /\b(eu|n[oó]s|a gente|meu|minha|I|we|our|my)\b/i.test(args.escapePointStatement ?? '')
  const documentOrderEligible = !args.sourceSection
    || args.sourceSection === 'UNKNOWN'
    || (args.sourceSection === 'FACTUAL' && conversationalNarrativeAnchor)
  if (documentOrderEligible && isOperationalEventStatement(args.statement)) {
    if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex > args.latestEscapeSentenceIndex) return 'POST_ESCAPE'
    if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex < args.latestEscapeSentenceIndex) return 'PRE_ESCAPE'
  }

  if (/\b(while|during|when|on visual approach|during approach|during taxi|during final approach)\b/i.test(args.statement) && isOperationalEventStatement(args.statement)) return 'PRE_ESCAPE'
  return 'UNKNOWN'
}

export function isPostEscapeStatement(statement: string): boolean {
  return classifyTemporalRelation({ statement, sourceSentenceIndex: 0 }) === 'POST_ESCAPE'
}

export function excludedPostEscapeEvidenceFromTimeline(
  timeline: SeraTimelineItem[],
  latestEscapeSentenceIndex: number | null,
  escapePointStatement?: string | null,
): string[] {
  return timeline
    .filter((item) => item.sourceSection !== 'ADMINISTRATIVE' && item.sourceSection !== 'REPORT_ANALYSIS' && item.sourceSection !== 'RECOMMENDATION')
    .filter((item) => classifyTemporalRelation({
      statement: item.statement,
      sourceSentenceIndex: item.sourceSentenceIndex,
      latestEscapeSentenceIndex,
      escapePointStatement,
      sourceSection: item.sourceSection,
    }) === 'POST_ESCAPE')
    .map((item) => item.statement)
}
