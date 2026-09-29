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

  const normalizedTimeline = timeline.map((item: (typeof timeline)[number]) => {
    const semantic = semanticBySentence.get(item.sourceSentenceIndex) ?? []
    const strongest = semantic.find((annotation) => annotation.confidence === 'HIGH') ?? semantic[0]
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
      semanticRoles: [...new Set(semantic.flatMap((annotation) => annotation.roles))],
      semanticActor: semantic.find((annotation) => annotation.actor)?.actor ?? null,
      semanticConfidence: strongest?.confidence,
    }
  })

  const evidence = applySemanticAnnotationsToEvidence({
    items: extractEvidenceItems({ facts: normalizedFacts, timeline: normalizedTimeline }),
    annotations: input.semanticEvidence,
  })

  return {
    facts: normalizedFacts,
    timeline: normalizedTimeline,
    evidence,
    explicitlyUnsupportedClaims,
  }
}
