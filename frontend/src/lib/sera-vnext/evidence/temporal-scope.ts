import type { SeraEvidenceSourceSection, SeraTimelineItem } from '../engine-contract'
import type { SeraEvidenceTemporalRelation } from './types'

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasConsequenceMarker(text: string): boolean {
  return /\b(crash|impact|impacted|collision|damage|damaged|fatal|injury|injured|ditch|ditched|struck|strike|hit|terrain|runway lights|very low height|acidente|impacto|colis[aã]o|dano|ferid|bateu)\b/i.test(text)
    || /\b(pousou|realizou o pouso|efetuou o pouso|concluiu o pouso|landed|touchdown)\b.*\b(errad[oa]|equivocad[oa]|erroneamente|por engano|mistakenly|erroneously|nao previst[oa]|não previst[oa]|nao autorizad[oa]|não autorizad[oa]|erro|wrong|diferente|distint[ao]|different|confundindo)\b/i.test(text)
    || /\b(pousou|landed)\b.*\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|helideck)\b.*\b(embora|although)\b.*\b(destino|rota|planned destination|planned route)\b/i.test(text)
    || /\b(ap[oó]s (?:concluir )?o pouso|depois do pouso|ap[oó]s o toque|depois do toque|after landing|after touchdown)\b/i.test(text)
}

function hasRecoveryMarker(text: string): boolean {
  return /\b(recovery|recover(?:ed|y)?|arrested|corrected|go around|go-around|late corrective|correction|finally recognized|later recognition|recovery control inputs)\b/i.test(text)
}

function hasExplicitPostEscapeCue(text: string): boolean {
  const normalized = normalize(text)
  if (/\b(after|only after|only later|later|seconds later|subsequently|following)\b/.test(normalized) && (hasConsequenceMarker(text) || hasRecoveryMarker(text))) return true
  if (/\b(after .*already|already occurred|already below|had already (?:departed|occurred|escalated))\b/.test(normalized)) return true
  if (/\b(during the recovery|recovery control inputs|finally recognized|very low height above the water)\b/.test(normalized)) return true
  if (/\b(later (?:struck|impacted|ditched|crashed|hit)|struck terrain|struck runway lights|impact with terrain)\b/.test(normalized)) return true
  return false
}

function isOpeningTemporalContext(text: string): boolean {
  return /\b(after (?:takeoff|departure|offshore departure)|during (?:approach|taxi|final approach|compressor wash|execution)|on visual approach)\b/i.test(text)
}

function hasExplicitPreEscapeCue(text: string): boolean {
  return /\b(before|prior to|during approach|during final approach|during taxi|on visual approach|before landing|rota prevista|planejamento|coordenadas? (?:foram )?inseridas?|gps|briefing|checklist|autoriza[cç][aã]o|proa direta|na aproxima[cç][aã]o|antes do pouso|antes da aproxima[cç][aã]o)\b/i.test(text)
}

export function classifyTemporalRelation(args: {
  statement: string
  sourceSentenceIndex: number
  latestEscapeSentenceIndex?: number | null
  sourceSection?: SeraEvidenceSourceSection
}): SeraEvidenceTemporalRelation {
  if (hasExplicitPostEscapeCue(args.statement)) return 'POST_ESCAPE'
  if (hasConsequenceMarker(args.statement) && !isOpeningTemporalContext(args.statement)) return 'POST_ESCAPE'
  if (hasExplicitPreEscapeCue(args.statement)) return 'PRE_ESCAPE'
  if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex === args.latestEscapeSentenceIndex) return 'AT_ESCAPE'

  // Investigation reports are usually structured by topic, not chronology. A sentence that
  // appears later in the document can describe pre-escape evidence from an interview.
  // Document order is therefore a temporal fallback only for unstructured narratives.
  if (!args.sourceSection || args.sourceSection === 'UNKNOWN') {
    if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex > args.latestEscapeSentenceIndex) return 'POST_ESCAPE'
    if (args.latestEscapeSentenceIndex != null && args.sourceSentenceIndex < args.latestEscapeSentenceIndex) return 'PRE_ESCAPE'
  }

  if (/\b(before|prior to|while|during|when|on visual approach|during approach|during taxi|during final approach)\b/i.test(args.statement)) return 'PRE_ESCAPE'
  return 'UNKNOWN'
}

export function isPostEscapeStatement(statement: string): boolean {
  return classifyTemporalRelation({ statement, sourceSentenceIndex: 0 }) === 'POST_ESCAPE'
}

export function excludedPostEscapeEvidenceFromTimeline(
  timeline: SeraTimelineItem[],
  latestEscapeSentenceIndex: number | null,
): string[] {
  return timeline
    .filter((item) => item.sourceSection !== 'ADMINISTRATIVE' && item.sourceSection !== 'REPORT_ANALYSIS' && item.sourceSection !== 'RECOMMENDATION')
    .filter((item) => classifyTemporalRelation({
      statement: item.statement,
      sourceSentenceIndex: item.sourceSentenceIndex,
      latestEscapeSentenceIndex,
      sourceSection: item.sourceSection,
    }) === 'POST_ESCAPE')
    .map((item) => item.statement)
}
