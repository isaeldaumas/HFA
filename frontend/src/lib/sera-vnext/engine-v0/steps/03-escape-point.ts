import type { SeraSupplementalEvidenceInput, SeraTimelineItem, SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { buildCandidateEscapeWindow } from '../candidate-escape-window'
import { confidenceFromCount, excludedPostEscapeEvidence } from '../utils'

function formatEscapeStatement(candidate: string | null, locale: SeraVNextEngineInput['locale']): string | null {
  if (!candidate) return null
  const clean = candidate
    .replace(/^\s*(?:ponto de fuga\s*[:\-–—]?\s*)?/i, '')
    .replace(/^\s*\d+(?:\.\d+)*\s*/, '')
    .replace(/^[\s“"']*(por[eé]m|contudo|entretanto|todavia)[,;:]?\s*/i, '')
    .replace(/\b(?:numa|em uma) vis[aã]o de t[uú]nel,?\s*/i, '')
    .replace(/[\s”"']+$/g, '')
    .trim()

  if (/^(quando|when)\b/i.test(clean)) return clean.charAt(0).toUpperCase() + clean.slice(1)

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

  const neutral = clean
    .replace(/\s+(?:devido a|devido ao|por ser|porque)\b.*$/i, '')
    .replace(/[.;,\s]+$/g, '')
    .trim()
  return `${locale === 'pt-BR' ? 'Quando' : 'When'} ${neutral.replace(/^[A-ZÁÉÍÓÚÃÕÇ]/, (m: string) => m.toLowerCase())}`
}

function usableDirectEscapeClarification(statement: string): boolean {
  const text = statement.trim()
  if (!text) return false
  if (/^(n[aã]o sei|desconhecido|n[aã]o informado|n[aã]o foi poss[ií]vel|indeterminado|unknown|not known|not determined)\b/i.test(text)) return false
  return /^\s*(?:(?:ponto de fuga|escape point)\s*[:\-–—]?\s*)?(?:quando|when)\b/i.test(text)
    || /\b(decidiu|iniciou|concluiu|liberou|considerou|executou|omitiu|deixou de|prosseguiu|selecionou|acionou|inspe[cç][aã]o|pre[- ]?voo|decided|initiated|completed|released|considered|executed|omitted|failed to|continued|selected|preflight)\b/i.test(text)
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
        supportingEvidence: [directClarification.statement],
        counterEvidence: [],
      }
    : null
  const selectedWindow = clarificationWindow.statement
    ? clarificationWindow
    : directClarificationWindow
      ? directClarificationWindow
      : legacyWindow
  const selectedFromNarrative = selectedWindow === legacyWindow && Boolean(legacyWindow.statement)

  const latestSentenceIndex = selectedFromNarrative
    ? input.factualExtraction.timeline.find((item) => item.statement === selectedWindow.latestCandidate)?.sourceSentenceIndex ?? null
    : null

  const status = selectedWindow.statement
    ? selectedWindow.counterEvidence.length > 0
      ? 'PROGRESSIVE_ZONE'
      : 'CANDIDATE'
    : 'INSUFFICIENT_EVIDENCE'

  return {
    status,
    statement: formatEscapeStatement(selectedWindow.earliestCandidate, input.locale),
    earliestCandidate: selectedWindow.earliestCandidate,
    latestCandidate: selectedWindow.latestCandidate,
    directActor: null,
    supportingEvidence: selectedWindow.supportingEvidence,
    counterEvidence: selectedWindow.counterEvidence,
    excludedPostEscapeEvidence: excludedPostEscapeEvidence(input.factualExtraction.timeline, latestSentenceIndex),
    confidence: confidenceFromCount(selectedWindow.supportingEvidence.length),
  }
}
