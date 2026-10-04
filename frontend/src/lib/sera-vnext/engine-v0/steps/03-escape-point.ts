import type { SeraSupplementalEvidenceInput, SeraTimelineItem, SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { buildCandidateEscapeWindow, classifyHumanFactorEscapeStatement } from '../candidate-escape-window'
import { isOperationalEventStatement } from '../factual-extraction-helpers'
import { excludedPostEscapeEvidence } from '../utils'
import { trimSemanticLandmarkToEventMoment } from '../../evidence/semantic-integrity'

function normalizeLandmarkText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function formatEscapeStatement(candidate: string | null, locale: SeraVNextEngineInput['locale']): string | null {
  if (!candidate) return null
  const clean = candidate
    .replace(/^\s*(?:ponto de fuga\s*[:\-–—]?\s*)?/i, '')
    .replace(/^\s*\d+(?:\.\d+)*\s*/, '')
    .replace(/^\s*(?:[a-z]\)|[-•▪])\s*/i, '')
    .replace(/^[\s“"']*(por[eé]m|contudo|entretanto|todavia)[,;:]?\s*/i, '')
    .replace(/\b(?:numa|em uma) vis[aã]o de t[uú]nel,?\s*/i, '')
    .replace(/[\s”"']+$/g, '')
    .trim()

  if (/^(quando|when)\b/i.test(clean)) return clean.charAt(0).toUpperCase() + clean.slice(1)

  const dispatchDespite = clean.replace(/[.;,\s]+$/g, '').match(/^a despeito d[aeo] (.+?),\s*(a aeronave foi despachada .+)$/i)
  if (dispatchDespite?.[1] && dispatchDespite?.[2]) {
    return locale === 'pt-BR'
      ? `Quando ${dispatchDespite[2]}, apesar de ${dispatchDespite[1]}.`
      : `When ${dispatchDespite[2]}, despite ${dispatchDespite[1]}.`
  }

  if (
    /\b(inspe[cç][aã]o (?:de )?pr[eé][ -]?voo|pr[eé][ -]?voo|preflight inspection)\b/i.test(clean) &&
    /\b(nada de anormal (?:foi|fora) detectado|nenhuma anormalidade (?:foi )?detectada|no abnormality (?:was )?detected)\b/i.test(clean)
  ) {
    return locale === 'pt-BR'
      ? 'Quando a inspeção pré-voo foi concluída sem detectar anormalidade.'
      : 'When the preflight inspection was completed without detecting an abnormality.'
  }

  const target = clean.match(/(?:identificou|confundiu|associou|entendeu|acreditou)\s+(?:a|o)?\s*([A-Z0-9-]{2,})\s+(?:como|com)\s+(?:o|a)?\s*(?:primeiro pouso|destino|unidade|plataforma|pista|helideck)/i)
  if (target?.[1]) {
    return locale === 'pt-BR'
      ? `Quando a operação passou a tratar ${target[1].toUpperCase()} como o destino previsto para o primeiro pouso e a comprometer o planejamento/aproximação para esse alvo.`
      : `When the operation began treating ${target[1].toUpperCase()} as the planned first-landing destination and committed the planning/approach to that target.`
  }

  const temporalLead = /^(?:during|durante|after|ap[oó]s|depois de)\b/i.test(clean)
  const neutral = clean
    .replace(/\s+(?:devido a|devido ao|por ser|porque)\b.*$/i, '')
    .replace(/[.;,\s]+$/g, '')
    .trim()
  const prefix = locale === 'pt-BR' ? 'Quando' : 'When'
  return `${prefix}${temporalLead ? ',' : ''} ${neutral.replace(/^[A-ZÁÉÍÓÚÃÕÇ]/, (m: string) => m.toLowerCase())}`
}


function splitCompoundEscapeLandmark(value: string): { first: string; later: string } | null {
  const candidates = [
    /\s*(?:,\s*)?(?:e\s*,?\s*)?(?:logo depois|em seguida|depois disso|posteriormente)\s*,?\s*/i,
    /\s*,?\s*(?:and\s+)?(?:shortly after|then|next|after that)\s*,?\s*/i,
  ]
  for (const pattern of candidates) {
    const match = pattern.exec(value)
    if (!match?.index || match.index < 20) continue
    const first = value.slice(0, match.index).trim().replace(/[;,]+$/g, '')
    const later = value.slice(match.index + match[0].length).trim().replace(/^[,;]+/g, '')
    if (first && later && classifyHumanFactorEscapeStatement(first)) return { first, later }
  }

  // A procedural omission followed in the same sentence by an aircraft-state consequence
  // is still two methodological landmarks. Keep the omission as the first departure and the
  // aircraft state as downstream evolution; do not make consequence part of the P/O/A anchor.
  const consequence = /\s*,?\s+e\s+(?=(?:a|o)\s+(?:aeronave|aircraft)\b)/i.exec(value)
  if (consequence?.index && consequence.index >= 20) {
    const first = value.slice(0, consequence.index).trim().replace(/[;,]+$/g, '')
    const later = value.slice(consequence.index + consequence[0].length).trim().replace(/^[,;]+/g, '')
    if (first && later && classifyHumanFactorEscapeStatement(first)) return { first, later }
  }
  return null
}

function usableDirectEscapeClarification(statement: string): boolean {
  const text = statement.trim()
  if (!text) return false
  if (/^(n[aã]o sei|desconhecido|n[aã]o informado|n[aã]o foi poss[ií]vel|indeterminado|unknown|not known|not determined)\b/i.test(text)) return false
  return classifyHumanFactorEscapeStatement(text) !== null
}

function escapeConfidence(args: {
  candidate: string | null
  supportCount: number
  counterCount: number
  fromDirectClarification: boolean
  semanticVerified?: boolean
}): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (!args.candidate) return 'LOW'
  // A source-anchored semantic landmark is allowed to establish the event boundary even
  // when the wording is colloquial and falls outside the deterministic verb lexicon.
  // This is exactly the layer the AI is responsible for; the quote itself was already
  // verified against the narrative before entering the engine.
  if (!isOperationalEventStatement(args.candidate) && !args.semanticVerified) return 'LOW'
  if (args.fromDirectClarification && args.counterCount === 0) return 'HIGH'
  if (args.counterCount > 0) return 'MEDIUM'
  return args.supportCount >= 2 ? 'HIGH' : 'MEDIUM'
}

export function runStep03EscapePoint(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  supplementalEvidence?: SeraSupplementalEvidenceInput[]
  locale: SeraVNextEngineInput['locale']
}): SeraVNextEngineOutput['escapePoint'] {
  const legacyWindow = buildCandidateEscapeWindow(input.factualExtraction.timeline)
  const clarificationSentences = (input.supplementalEvidence ?? [])
    .filter((item) => item.stage === 'ESCAPE_POINT')
    .flatMap((item) => item.statement.split(/(?<=[.!?])\s+/).map((statement) => statement.trim()).filter(Boolean))
  const clarificationTimeline: SeraTimelineItem[] = clarificationSentences.map((statement, index) => ({
    id: `SUP-ESCAPE-${index + 1}`,
    order: index + 1,
    statement,
    temporalCue: 'clarification_response',
    sourceSentenceIndex: -(index + 1),
    sourceSection: 'FACTUAL',
    assertionStatus: 'AFFIRMED',
  }))
  const clarificationWindow = buildCandidateEscapeWindow(clarificationTimeline)
  const directClarification = clarificationTimeline.find((item) => usableDirectEscapeClarification(item.statement)) ?? null
  const directClarificationWindow = directClarification
    ? {
        statement: directClarification.statement,
        earliestCandidate: directClarification.statement,
        latestCandidate: directClarification.statement,
        firstDepartureCandidate: directClarification.statement,
        criticalUnsafeActCandidate: directClarification.statement,
        criticalCandidateAlternatives: [],
        irreversibilityBoundaryCandidate: null,
        anchorBasis: 'FIRST_DEPARTURE_AND_CRITICAL_ACT' as const,
        firstDepartureSupportingEvidence: [directClarification.statement],
        criticalUnsafeActSupportingEvidence: [directClarification.statement],
        poaAnchorCandidate: directClarification.statement,
        poaAnchorSupportingEvidence: [directClarification.statement],
        poaAnchorBasis: 'FIRST_DEPARTURE' as const,
        supportingEvidence: [directClarification.statement],
        counterEvidence: [],
        progressiveBoundary: false,
        episodeCandidates: [{ phase: 'GENERIC' as const, anchorStatement: directClarification.statement, supportingEvidence: [directClarification.statement], occurrenceScope: 'CURRENT_EVENT' as const, seraRole: 'HUMAN_FACTOR_CANDIDATE' as const, humanFactorEligible: true, selected: true }],
        humanFactorGate: { status: 'PASSED' as const, anchorType: classifyHumanFactorEscapeStatement(directClarification.statement), rationale: ['Human clarification identifies an observable unsafe act/inaction or operator-controlled unsafe condition.'] },
      }
    : null
  const selectedWindow = clarificationWindow.statement
    ? clarificationWindow
    : directClarificationWindow
      ? directClarificationWindow
      : legacyWindow
  const selectedFromNarrative = selectedWindow === legacyWindow && Boolean(legacyWindow.statement)
  const rawFirstDepartureCandidate = selectedWindow.firstDepartureCandidate ?? selectedWindow.earliestCandidate ?? ''
  const rawCriticalUnsafeActCandidate = selectedWindow.criticalUnsafeActCandidate ?? selectedWindow.latestCandidate ?? ''
  const semanticFirstDeparture = Boolean(rawFirstDepartureCandidate && input.factualExtraction.timeline.some((item) =>
    item.id.startsWith('TIME-SEM-')
    && item.statement === rawFirstDepartureCandidate
    && item.semanticConfidence !== 'LOW'
    && item.semanticRoles?.includes('FIRST_DEPARTURE'),
  ))
  const semanticCriticalAct = Boolean(rawCriticalUnsafeActCandidate && input.factualExtraction.timeline.some((item) =>
    item.id.startsWith('TIME-SEM-')
    && item.statement === rawCriticalUnsafeActCandidate
    && item.semanticConfidence !== 'LOW'
    && item.semanticRoles?.includes('CRITICAL_UNSAFE_ACT'),
  ))
  // Canonical AI path already supplies semantically isolated verbatim spans. Compound
  // sentence splitting and event-moment trimming remain only as deterministic fallback
  // for analyses without semantic landmark extraction.
  const compoundLandmark = semanticFirstDeparture ? null : splitCompoundEscapeLandmark(rawFirstDepartureCandidate)
  const firstDepartureCandidate = semanticFirstDeparture
    ? rawFirstDepartureCandidate || null
    : trimSemanticLandmarkToEventMoment(compoundLandmark?.first ?? rawFirstDepartureCandidate) || null
  const sameRawLandmark = Boolean(rawFirstDepartureCandidate && rawCriticalUnsafeActCandidate &&
    rawFirstDepartureCandidate.trim() === rawCriticalUnsafeActCandidate.trim())
  const criticalUnsafeActCandidate = semanticCriticalAct
    ? rawCriticalUnsafeActCandidate || null
    : trimSemanticLandmarkToEventMoment(
        sameRawLandmark && compoundLandmark
          ? compoundLandmark.later
          : rawCriticalUnsafeActCandidate,
      ) || null
  const poaAnchorCandidate = firstDepartureCandidate
  const effectiveAnchorBasis = firstDepartureCandidate && criticalUnsafeActCandidate
    ? normalizeLandmarkText(firstDepartureCandidate) === normalizeLandmarkText(criticalUnsafeActCandidate)
      ? 'FIRST_DEPARTURE_AND_CRITICAL_ACT' as const
      : 'FIRST_DEPARTURE_PRIMARY' as const
    : selectedWindow.anchorBasis

  const latestSentenceIndex = selectedFromNarrative
    ? input.factualExtraction.timeline.find((item) => firstDepartureCandidate && (item.statement === firstDepartureCandidate || item.statement.includes(firstDepartureCandidate) || firstDepartureCandidate.includes(item.statement)))?.sourceSentenceIndex ?? null
    : null

  const status = selectedWindow.statement
    ? selectedWindow.progressiveBoundary
      ? 'PROGRESSIVE_ZONE'
      : 'CANDIDATE'
    : 'INSUFFICIENT_EVIDENCE'
  const confidenceCandidate = selectedWindow.firstDepartureCandidate
    ?? selectedWindow.earliestCandidate
    ?? selectedWindow.criticalUnsafeActCandidate
    ?? selectedWindow.latestCandidate
  const semanticVerified = Boolean(confidenceCandidate && input.factualExtraction.timeline.some((item) =>
    item.statement === confidenceCandidate
    && item.semanticConfidence !== 'LOW'
    && item.semanticRoles?.some((role) => role === 'FIRST_DEPARTURE' || role === 'CRITICAL_UNSAFE_ACT'),
  ))

  return {
    status,
    statement: formatEscapeStatement(firstDepartureCandidate ?? criticalUnsafeActCandidate, input.locale),
    earliestCandidate: selectedWindow.earliestCandidate,
    latestCandidate: selectedWindow.latestCandidate,
    firstDepartureCandidate,
    criticalUnsafeActCandidate,
    criticalCandidateAlternatives: selectedWindow.criticalCandidateAlternatives ?? [],
    irreversibilityBoundaryCandidate: selectedWindow.irreversibilityBoundaryCandidate ?? null,
    anchorBasis: effectiveAnchorBasis,
    firstDepartureSupportingEvidence: firstDepartureCandidate
      ? [firstDepartureCandidate, ...selectedWindow.firstDepartureSupportingEvidence.filter((item) => item !== rawFirstDepartureCandidate)]
      : selectedWindow.firstDepartureSupportingEvidence,
    criticalUnsafeActSupportingEvidence: criticalUnsafeActCandidate
      ? [criticalUnsafeActCandidate, ...selectedWindow.criticalUnsafeActSupportingEvidence.filter((item) => item !== rawCriticalUnsafeActCandidate)]
      : selectedWindow.criticalUnsafeActSupportingEvidence,
    poaAnchorCandidate,
    poaAnchorSupportingEvidence: firstDepartureCandidate ? [firstDepartureCandidate] : [],
    poaAnchorBasis: firstDepartureCandidate ? 'FIRST_DEPARTURE' : 'UNRESOLVED',
    directActor: null,
    supportingEvidence: selectedWindow.supportingEvidence,
    counterEvidence: selectedWindow.counterEvidence,
    excludedPostEscapeEvidence: excludedPostEscapeEvidence(input.factualExtraction.timeline, latestSentenceIndex, selectedWindow.firstDepartureCandidate ?? selectedWindow.earliestCandidate ?? selectedWindow.criticalUnsafeActCandidate ?? selectedWindow.latestCandidate),
    episodeCandidates: selectedWindow.episodeCandidates,
    confidence: escapeConfidence({
      candidate: confidenceCandidate,
      supportCount: selectedWindow.supportingEvidence.length,
      counterCount: selectedWindow.counterEvidence.length,
      fromDirectClarification: selectedWindow === directClarificationWindow || selectedWindow === clarificationWindow,
      semanticVerified,
    }),
    humanFactorGate: selectedWindow.humanFactorGate,
  }
}
