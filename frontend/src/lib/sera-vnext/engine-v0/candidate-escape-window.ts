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

function hasOutcomeSignal(sentence: string): boolean {
  const lower = sentence.toLowerCase()
  return OUTCOME_KEYWORDS.some((keyword) => lower.includes(keyword))
}

function hasControlWindowSignal(sentence: string): boolean {
  if (isPostEscapeStatement(sentence)) return false
  return /\b(crew|pilot|operator|decided|continued|failed to|did not|executed|turned|descended|climbed|approach|landing|crew|tripula|decidiu|continuou|falhou|executou|desceu|subiu|aproxima[cç][aã]o|pouso)\b/i.test(
    sentence
  )
}

export function buildCandidateEscapeWindow(timeline: SeraTimelineItem[]): CandidateEscapeWindow {
  const outcomeIndex = timeline.findIndex((item) => hasOutcomeSignal(item.statement))
  const candidateItems = timeline.filter((item) => hasControlWindowSignal(item.statement))
  const preOutcomeItems =
    outcomeIndex >= 0 ? candidateItems.filter((item) => item.sourceSentenceIndex < outcomeIndex) : candidateItems
  const effectiveItems = preOutcomeItems.length > 0 ? preOutcomeItems : candidateItems
  const earliest = effectiveItems[0] ?? null
  const latest = effectiveItems[effectiveItems.length - 1] ?? null

  const counterEvidence: string[] = []
  if (!effectiveItems.length) {
    counterEvidence.push('No explicit pre-outcome control-window statement was found in the submitted text.')
  }
  if (outcomeIndex < 0) {
    counterEvidence.push('No explicit consequence boundary was detected, so the latest candidate remains approximate.')
  }

  return {
    statement:
      earliest && latest
        ? `Non-final candidate window spans from "${earliest.statement}" to "${latest.statement}".`
        : null,
    earliestCandidate: earliest?.statement ?? null,
    latestCandidate: latest?.statement ?? null,
    supportingEvidence: effectiveItems.map((item) => item.statement),
    counterEvidence,
  }
}
