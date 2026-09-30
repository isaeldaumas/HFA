import {
  SERA_VNEXT_BASELINE_ID,
  SERA_VNEXT_ENGINE_VERSION,
  SERA_VNEXT_FIXTURE_SET_ID,
  SERA_VNEXT_METHODOLOGY_VERSION,
} from '../ENGINE_VERSION'
import { applySemanticAnnotationsToEvidence, excludedPostEscapeEvidenceFromTimeline, extractEvidenceItems, extractSupplementalEvidenceItems } from '../evidence'
import { enforceSemanticEvidenceIntegrity } from '../evidence/semantic-integrity'
import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../engine-contract'
import { runStep01FactualExtraction } from './steps/01-factual-extraction'
import { runStep02SafeOperationModel } from './steps/02-safe-operation-model'
import { runStep03EscapePoint } from './steps/03-escape-point'
import { runStep04UnsafeState } from './steps/04-unsafe-state'
import { runStep05UnsafeActCondition } from './steps/05-unsafe-act-condition'
import { runStep06DirectActor } from './steps/06-direct-actor'
import { runStep07AxisStatements } from './steps/07-axis-statements'
import { runStep08CanonicalTraversal } from './steps/08-canonical-traversal'
import { runStep09Preconditions } from './steps/09-preconditions'
import { runStep10Assurance } from './steps/10-assurance'
import { runStep10EvidenceSufficiency } from './steps/10-evidence-sufficiency'

function normalizeLandmarkText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function semanticActorForLandmark(
  input: SeraVNextEngineInput,
  candidate: string | null | undefined,
  role: 'FIRST_DEPARTURE' | 'CRITICAL_UNSAFE_ACT',
): string | null {
  if (!candidate) return null
  const target = normalizeLandmarkText(candidate)
  const actors = (input.semanticEvidence ?? [])
    .filter((item) => item.actor && item.roles.includes(role))
    .filter((item) => {
      const quote = normalizeLandmarkText(item.sourceQuote)
      return quote === target || quote.includes(target) || target.includes(quote)
    })
    .map((item) => item.actor!)
  return [...new Set(actors)].length === 1 ? actors[0] : null
}

export function runSeraVNextEngineV0(input: SeraVNextEngineInput): SeraVNextEngineOutput {
  const effectiveInput: SeraVNextEngineInput = {
    ...input,
    semanticEvidence: enforceSemanticEvidenceIntegrity({ annotations: input.semanticEvidence, narrative: input.narrative }),
  }
  const factualExtraction = runStep01FactualExtraction(effectiveInput)
  const initialEvidence = extractEvidenceItems({
    facts: factualExtraction.facts,
    timeline: factualExtraction.timeline,
  })
  const factualExtractionWithInitialEvidence = { ...factualExtraction, evidence: initialEvidence }
  const escapePoint = runStep03EscapePoint({ factualExtraction: factualExtractionWithInitialEvidence, supplementalEvidence: effectiveInput.supplementalEvidence, locale: effectiveInput.locale })
  const safeOperationModel = runStep02SafeOperationModel({ engineInput: effectiveInput, factualExtraction: factualExtractionWithInitialEvidence, escapePoint })
  const unsafeState = runStep04UnsafeState({ engineInput: effectiveInput, factualExtraction })
  const poaAnchor = escapePoint.poaAnchorCandidate
    ?? escapePoint.criticalUnsafeActCandidate
    ?? escapePoint.firstDepartureCandidate
    ?? escapePoint.statement
    ?? escapePoint.earliestCandidate
    ?? escapePoint.latestCandidate
  const poaAnchorSentenceIndex = factualExtraction.timeline
    .find((item) => poaAnchor && (item.statement === poaAnchor || item.statement.includes(poaAnchor) || poaAnchor.includes(item.statement)))?.sourceSentenceIndex ?? null
  const poaEscapePoint = {
    ...escapePoint,
    excludedPostEscapeEvidence: excludedPostEscapeEvidenceFromTimeline(
      factualExtraction.timeline,
      poaAnchorSentenceIndex,
      poaAnchor,
    ),
  }
  const unsafeActOrCondition = runStep05UnsafeActCondition({ engineInput: effectiveInput, unsafeState, escapePoint: poaEscapePoint })
  const directActor = runStep06DirectActor({ engineInput: effectiveInput, unsafeActOrCondition, escapePoint: poaEscapePoint })
  const narrativeEvidence = applySemanticAnnotationsToEvidence({
    items: extractEvidenceItems({
      facts: factualExtraction.facts,
      timeline: factualExtraction.timeline,
      directActor: directActor.actor,
      latestEscapeSentenceIndex: poaAnchorSentenceIndex,
      escapePointStatement: poaAnchor,
    }),
    annotations: effectiveInput.semanticEvidence,
    directActor: directActor.actor,
  })
  const supplementalEvidence = extractSupplementalEvidenceItems({
    items: effectiveInput.supplementalEvidence ?? [],
    directActor: directActor.actor,
    sourceSentenceIndex: poaAnchorSentenceIndex ?? 0,
  })
  const factualExtractionWithEvidence = {
    ...factualExtraction,
    evidence: [...narrativeEvidence, ...supplementalEvidence],
  }
  const axisStatements = runStep07AxisStatements({
    engineInput: effectiveInput,
    directActor,
    unsafeActOrCondition,
    factualExtraction: factualExtractionWithEvidence,
    escapePoint: poaEscapePoint,
  })
  const { axes, canonicalTraversal } = runStep08CanonicalTraversal({
    factualExtraction: factualExtractionWithEvidence,
    axisStatements,
    directActor,
    escapePoint: poaEscapePoint,
    locale: effectiveInput.locale,
  })
  const preconditions = runStep09Preconditions({ factualExtraction: factualExtractionWithEvidence, escapePoint: poaEscapePoint, directActor, axes, locale: effectiveInput.locale })
  const assurance = runStep10Assurance({
    factualExtraction: factualExtractionWithEvidence,
    escapePoint: poaEscapePoint,
    directActor,
    axes,
    preconditions,
    canonicalTraversal,
    locale: effectiveInput.locale,
  })
  const evidenceSufficiency = runStep10EvidenceSufficiency({
    factualExtraction: factualExtractionWithEvidence,
    safeOperationModel,
    escapePoint: poaEscapePoint,
    directActor,
    canonicalTraversal,
    axes,
    guardrails: assurance.guardrails,
    locale: effectiveInput.locale,
  })

  return {
    engineVersion: SERA_VNEXT_ENGINE_VERSION,
    methodologyVersion: SERA_VNEXT_METHODOLOGY_VERSION,
    baselineId: SERA_VNEXT_BASELINE_ID,
    fixtureSetId: SERA_VNEXT_FIXTURE_SET_ID,
    mode: input.mode,
    factualExtraction: factualExtractionWithEvidence,
    safeOperationModel,
    escapePoint: {
      ...poaEscapePoint,
      firstDepartureActor: semanticActorForLandmark(effectiveInput, poaEscapePoint.firstDepartureCandidate, 'FIRST_DEPARTURE'),
      criticalUnsafeActActor: directActor.actor,
      directActor: directActor.actor,
    },
    unsafeState,
    unsafeActOrCondition,
    directActor,
    axes,
    preconditions,
    canonicalTraversal,
    evidenceSufficiency,
    guardrails: assurance.guardrails,
    guardrailEvidence: assurance.guardrailEvidence,
    uncertainties: assurance.uncertainties,
    limitations: assurance.limitations,
    decisionTrace: assurance.decisionTrace,
    evidenceTrace: assurance.evidenceTrace,
    humanReviewPackage: assurance.humanReviewPackage,
    humanReviewRequired: true,
    selectedCode: null,
    releasedCode: null,
    finalConclusion: null,
    classifiedOutput: false,
    readyPromotion: false,
    downstreamAllowed: false,
  }
}
