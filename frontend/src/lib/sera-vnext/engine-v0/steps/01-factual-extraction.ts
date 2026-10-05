import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { applySemanticAnnotationsToEvidence, extractEvidenceItems } from '../../evidence'
import { buildCandidateTimeline, extractCandidateFacts, isExplicitOperationalDeviationStatement, isExplicitOperationalOmissionStatement, OUTCOME_KEYWORDS } from '../factual-extraction-helpers'
import { pushUnique } from '../utils'

function normalizeCategory(value: string): SeraVNextEngineOutput['factualExtraction']['facts'][number]['category'] {
  if (value === 'actor') return 'actor'
  if (value === 'action') return 'action'
  if (value === 'condition') return 'condition'
  if (value === 'environment') return 'environment'
  if (value === 'timeline') return 'timeline'
  if (value === 'outcome') return 'outcome'
  return 'other'
}

export function runStep01FactualExtraction(input: SeraVNextEngineInput): SeraVNextEngineOutput['factualExtraction'] {
  const { facts, sentences } = extractCandidateFacts(input.narrative)
  const timeline = buildCandidateTimeline(sentences, input.narrative)
  const semanticBySentence = new Map<number, NonNullable<SeraVNextEngineInput['semanticEvidence']>>()
  for (const annotation of input.semanticEvidence ?? []) {
    if (annotation.assertionStatus !== 'AFFIRMED' || annotation.confidence === 'LOW') continue
    const items = semanticBySentence.get(annotation.sourceSentenceIndex) ?? []
    items.push(annotation)
    semanticBySentence.set(annotation.sourceSentenceIndex, items)
  }

  const normalizedFacts = facts.map((fact: (typeof facts)[number], index: number) => {
    const statement = fact.statement
    const lower = statement.toLowerCase()
    let category = normalizeCategory(fact.category)
    if (isExplicitOperationalDeviationStatement(statement)) {
      category = 'decision'
    } else if (isExplicitOperationalOmissionStatement(statement)) {
      category = 'action'
    } else if (/\b(decided|decision|chose|continue(?:d)?|abort(?:ed)?|go-around|decidiu|decidi|decisão|julgou|julguei|preferiu|preferi|escolheu|escolhi|optou|optei|tomou a decisão|tomei a decisão)\b/i.test(statement)) {
      category = 'decision'
    } else if (/\b(input|control|throttle|pitch|bank|configured|flap|gear|controle|comandos?|manche|c[ií]clico|coletivo|collective|cyclic|potência)\b/i.test(statement)) {
      category = 'control_input'
    } else if (/\b(cue|warning|alert|awareness|sinal|alerta)\b/i.test(statement)) {
      category = /\b(warning|alert|alerta)\b/i.test(statement) ? 'warning' : 'cue'
    } else if (OUTCOME_KEYWORDS.some((keyword: string) => lower.includes(keyword))) {
      category = 'outcome'
    }

    return {
      id: `FACT-${index + 1}`,
      statement,
      category,
      sourceSentenceIndex: fact.sourceSentenceIndex,
      sourceSection: fact.sourceSection,
      assertionStatus: fact.assertionStatus,
      occurrenceScope: fact.occurrenceScope,
    }
  })

  const explicitlyUnsupportedClaims: string[] = []
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase()
    if (
      /\b(probable cause|conclusion|recommendation|hfacs|risk\/erc|arms\/erc|causa provável|recomendação)\b/i.test(
        sentence
      )
    ) {
      pushUnique(explicitlyUnsupportedClaims, sentence)
    }
    if (/\b(selectedcode|releasedcode|finalconclusion|classified)\b/i.test(lower)) {
      pushUnique(explicitlyUnsupportedClaims, sentence)
    }
  }

  const semanticSpanMode = input.semanticEnrichmentMeta?.schemaVersion === 'SERA_SEMANTIC_AI_V2'
  const landmarkRoles = new Set(['FIRST_DEPARTURE', 'CRITICAL_UNSAFE_ACT'] as const)
  const normalizedTimelineBase = timeline.map((item: (typeof timeline)[number]) => {
    const semantic = semanticBySentence.get(item.sourceSentenceIndex) ?? []
    const strongest = semantic.find((annotation) => annotation.confidence === 'HIGH') ?? semantic[0]
    const roles = semanticSpanMode
      ? semantic.flatMap((annotation) => annotation.roles.filter((role) => !landmarkRoles.has(role as 'FIRST_DEPARTURE' | 'CRITICAL_UNSAFE_ACT')))
      : semantic.flatMap((annotation) => annotation.roles)
    return {
      id: `TIME-${item.order}`,
      order: item.order,
      statement: item.statement,
      temporalCue: item.temporalCue,
      sourceSentenceIndex: item.sourceSentenceIndex,
      sourceSection: item.sourceSection,
      // Source polarity is authoritative. Semantic extraction may refine an UNKNOWN
      // occurrence scope, but it can never turn a source-level rejection/uncertainty
      // into an affirmed event fact.
      assertionStatus: item.assertionStatus,
      occurrenceScope: item.occurrenceScope !== 'UNKNOWN'
        ? item.occurrenceScope
        : strongest?.occurrenceScope ?? item.occurrenceScope,
      semanticRoles: [...new Set(roles)],
      semanticActor: semantic.find((annotation) => annotation.actor)?.actor ?? null,
      semanticConfidence: strongest?.confidence,
    }
  })

  const semanticLandmarkTimeline = semanticSpanMode
    ? (input.semanticEvidence ?? [])
        .filter((annotation) => annotation.assertionStatus === 'AFFIRMED' && annotation.confidence !== 'LOW')
        .filter((annotation) => annotation.roles.some((role) => landmarkRoles.has(role as 'FIRST_DEPARTURE' | 'CRITICAL_UNSAFE_ACT')))
        .flatMap((annotation, index) => {
          const source = timeline.find((item) => item.sourceSentenceIndex === annotation.sourceSentenceIndex)
          if (!source) return []
          const exactOffset = source.statement.indexOf(annotation.sourceQuote)
          const normalizedOffset = exactOffset >= 0 ? exactOffset : Math.max(0, source.statement.toLowerCase().indexOf(annotation.sourceQuote.toLowerCase()))
          const fractionalOrder = (normalizedOffset + 1) / Math.max(1000, source.statement.length * 10)
          return [{
            id: `TIME-SEM-${source.order}-${index + 1}`,
            order: source.order + fractionalOrder,
            statement: annotation.sourceQuote,
            temporalCue: source.temporalCue,
            sourceSentenceIndex: source.sourceSentenceIndex,
            sourceSection: source.sourceSection,
            assertionStatus: source.assertionStatus,
            occurrenceScope: source.occurrenceScope !== 'UNKNOWN' ? source.occurrenceScope : annotation.occurrenceScope,
            semanticRoles: annotation.roles,
            semanticActor: annotation.actor,
            semanticPreconditionCategory: annotation.preconditionCategory ?? null,
            semanticConfidence: annotation.confidence,
          }]
        })
    : []
  const normalizedTimeline = [...normalizedTimelineBase, ...semanticLandmarkTimeline]
    .sort((a, b) => a.order - b.order || a.sourceSentenceIndex - b.sourceSentenceIndex)

  const evidence = applySemanticAnnotationsToEvidence({
    items: extractEvidenceItems({ facts: normalizedFacts, timeline: normalizedTimeline }),
    annotations: input.semanticEvidence,
    semanticSchemaVersion: input.semanticEnrichmentMeta?.schemaVersion ?? null,
  })

  return {
    facts: normalizedFacts,
    timeline: normalizedTimeline,
    evidence,
    explicitlyUnsupportedClaims,
  }
}
