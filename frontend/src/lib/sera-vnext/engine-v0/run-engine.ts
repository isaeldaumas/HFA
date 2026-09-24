import {
  SERA_VNEXT_BASELINE_ID,
  SERA_VNEXT_ENGINE_VERSION,
  SERA_VNEXT_FIXTURE_SET_ID,
  SERA_VNEXT_METHODOLOGY_VERSION,
} from '../ENGINE_VERSION'
import { extractEvidenceItems } from '../evidence'
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

export function runSeraVNextEngineV0(input: SeraVNextEngineInput): SeraVNextEngineOutput {
  const factualExtraction = runStep01FactualExtraction(input)
  const safeOperationModel = runStep02SafeOperationModel({ engineInput: input, factualExtraction })
  const escapePoint = runStep03EscapePoint({ factualExtraction })
  const unsafeState = runStep04UnsafeState({ engineInput: input, factualExtraction })
  const unsafeActOrCondition = runStep05UnsafeActCondition({ engineInput: input, unsafeState, escapePoint })
  const directActor = runStep06DirectActor({ engineInput: input, unsafeActOrCondition, escapePoint })
  const latestEscapeSentenceIndex =
    factualExtraction.timeline.find((item) => item.statement === escapePoint.latestCandidate)?.sourceSentenceIndex ?? null
  const factualExtractionWithEvidence = {
    ...factualExtraction,
    evidence: extractEvidenceItems({
      facts: factualExtraction.facts,
      timeline: factualExtraction.timeline,
      directActor: directActor.actor,
      latestEscapeSentenceIndex,
    }),
  }
  const axisStatements = runStep07AxisStatements({
    engineInput: input,
    directActor,
    unsafeActOrCondition,
    factualExtraction: factualExtractionWithEvidence,
    escapePoint,
  })
  const { axes, canonicalTraversal } = runStep08CanonicalTraversal({
    factualExtraction: factualExtractionWithEvidence,
    axisStatements,
    directActor,
    escapePoint,
  })
  const preconditions = runStep09Preconditions({ factualExtraction: factualExtractionWithEvidence, escapePoint, directActor, axes })
  const assurance = runStep10Assurance({
    factualExtraction: factualExtractionWithEvidence,
    escapePoint,
    directActor,
    axes,
    preconditions,
    canonicalTraversal,
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
      ...escapePoint,
      directActor: directActor.actor,
    },
    unsafeState,
    unsafeActOrCondition,
    directActor,
    axes,
    preconditions,
    canonicalTraversal,
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
