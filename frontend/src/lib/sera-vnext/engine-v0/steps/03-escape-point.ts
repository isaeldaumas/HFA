import type { SeraVNextEngineOutput } from '../../engine-contract'
import { buildCandidateEscapeWindow } from '../candidate-escape-window'
import { confidenceFromCount, excludedPostEscapeEvidence } from '../utils'

function formatEscapeStatement(candidate: string | null): string | null {
  if (!candidate) return null
  const clean = candidate
    .replace(/^[\s“"']*(por[eé]m|contudo|entretanto|todavia)[,;:]?\s*/i, '')
    .replace(/\b(?:numa|em uma) vis[aã]o de t[uú]nel,?\s*/i, '')
    .replace(/[\s”"']+$/g, '')
    .trim()

  const target = clean.match(/(?:identificou|confundiu|associou|entendeu|acreditou)\s+(?:a|o)?\s*([A-Z0-9-]{2,})\s+(?:como|com)\s+(?:o|a)?\s*(?:primeiro pouso|destino|unidade|plataforma|pista|helideck)/i)
  if (target?.[1]) {
    return `Quando a operação passou a tratar ${target[1].toUpperCase()} como o destino previsto para o primeiro pouso e a comprometer o planejamento/aproximação para esse alvo.`
  }

  const neutral = clean
    .replace(/\s+(?:devido a|devido ao|por ser|porque)\b.*$/i, '')
    .replace(/[.;,\s]+$/g, '')
    .trim()
  return `Quando ${neutral.replace(/^[A-ZÁÉÍÓÚÃÕÇ]/, (m: string) => m.toLowerCase())}`
}

export function runStep03EscapePoint(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
}): SeraVNextEngineOutput['escapePoint'] {
  const legacyWindow = buildCandidateEscapeWindow(input.factualExtraction.timeline)

  const latestSentenceIndex =
    input.factualExtraction.timeline.find((item) => item.statement === legacyWindow.latestCandidate)?.sourceSentenceIndex ?? null

  const status = legacyWindow.statement
    ? legacyWindow.counterEvidence.length > 0
      ? 'PROGRESSIVE_ZONE'
      : 'CANDIDATE'
    : 'INSUFFICIENT_EVIDENCE'

  return {
    status,
    statement: formatEscapeStatement(legacyWindow.earliestCandidate),
    earliestCandidate: legacyWindow.earliestCandidate,
    latestCandidate: legacyWindow.latestCandidate,
    directActor: null,
    supportingEvidence: legacyWindow.supportingEvidence,
    counterEvidence: legacyWindow.counterEvidence,
    excludedPostEscapeEvidence: excludedPostEscapeEvidence(input.factualExtraction.timeline, latestSentenceIndex),
    confidence: confidenceFromCount(legacyWindow.supportingEvidence.length),
  }
}
