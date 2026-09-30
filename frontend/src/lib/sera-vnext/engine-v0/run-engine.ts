import {
  SERA_VNEXT_BASELINE_ID,
  SERA_VNEXT_ENGINE_VERSION,
  SERA_VNEXT_FIXTURE_SET_ID,
  SERA_VNEXT_METHODOLOGY_VERSION,
} from "../ENGINE_VERSION";
import {
  applySemanticAnnotationsToEvidence,
  excludedPostEscapeEvidenceFromTimeline,
  extractEvidenceItems,
  extractSupplementalEvidenceItems,
} from "../evidence";
import { enforceSemanticEvidenceIntegrity } from "../evidence/semantic-integrity";
import type {
  SeraAxisCandidate,
  SeraTrajectoryAnalysis,
  SeraVNextEngineInput,
  SeraVNextEngineOutput,
} from "../engine-contract";
import {
  buildCausalEvidenceGraph,
  discoverTrajectorySeeds,
} from "./analysis-synthesis";
import { runStep01FactualExtraction } from "./steps/01-factual-extraction";
import { runStep02SafeOperationModel } from "./steps/02-safe-operation-model";
import { runStep03EscapePoint } from "./steps/03-escape-point";
import { runStep04UnsafeState } from "./steps/04-unsafe-state";
import { runStep05UnsafeActCondition } from "./steps/05-unsafe-act-condition";
import { runStep06DirectActor } from "./steps/06-direct-actor";
import { runStep07AxisStatements } from "./steps/07-axis-statements";
import { runStep08CanonicalTraversal } from "./steps/08-canonical-traversal";
import { runStep09Preconditions } from "./steps/09-preconditions";
import { runStep10Assurance } from "./steps/10-assurance";
import { runStep10EvidenceSufficiency } from "./steps/10-evidence-sufficiency";

function normalizeLandmarkText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function semanticActorForLandmark(
  input: SeraVNextEngineInput,
  candidate: string | null | undefined,
  role: "FIRST_DEPARTURE" | "CRITICAL_UNSAFE_ACT",
): string | null {
  if (!candidate) return null;
  const target = normalizeLandmarkText(candidate);
  const actors = (input.semanticEvidence ?? [])
    .filter((item) => item.actor && item.roles.includes(role))
    .filter((item) => {
      const quote = normalizeLandmarkText(item.sourceQuote);
      return (
        quote === target || quote.includes(target) || target.includes(quote)
      );
    })
    .map((item) => item.actor!);
  return [...new Set(actors)].length === 1 ? actors[0] : null;
}

function decorateAxisSupport(
  axis: SeraAxisCandidate,
  role: "PERCEPTION_STATE" | "OBJECTIVE_INTENT" | "ACTION_STRATEGY",
  evidence: SeraVNextEngineOutput["factualExtraction"]["evidence"],
): SeraAxisCandidate {
  const explicit = evidence.some(
    (item) =>
      item.collectionSource === "AI_SEMANTIC_EXTRACTION" &&
      item.semanticConfidence !== "LOW" &&
      item.semanticRoles?.includes(role) &&
      axis.supportingEvidence.includes(item.statement),
  );
  const supportLevel =
    axis.status === "INSUFFICIENT_EVIDENCE" && !axis.proposedCode
      ? ("INSUFFICIENT" as const)
      : explicit
        ? ("EXPLICIT" as const)
        : axis.supportingEvidence.length > 0
          ? ("RECONSTRUCTED_STRONG" as const)
          : ("INSUFFICIENT" as const);
  const mechanismAlternatives = [...(axis.mechanismAlternatives ?? [])];
  if (axis.axis === "A" && axis.proposedCode === "A-F") {
    const joined = axis.supportingEvidence.join(" ");
    const knownAgainst =
      /\b(nunca (?:fiz|havia feito).{0,180}sempre (?:instrui|instru[ií]|ensinei) contra)\b/i.test(
        joined,
      );
    const unexplained =
      /\b(n[aã]o sei (?:por que|o que passou)|n[aã]o consigo explicar|don't know why|do not know why)\b/i.test(
        joined,
      );
    if (knownAgainst && unexplained) {
      mechanismAlternatives.push({
        code: "A-B",
        rationale:
          "A seleção inadequada está sustentada, mas o relato também contém execução não habitual, explicitamente contrária ao padrão conhecido e sem explicação consciente; deslize/lapso deve permanecer como mecanismo concorrente para revisão humana.",
        evidence: axis.supportingEvidence
          .filter((text) => /nunca|instrui|n[aã]o sei/i.test(text))
          .slice(0, 2),
      });
    }
  }
  return {
    ...axis,
    supportLevel,
    supportRationale:
      supportLevel === "EXPLICIT"
        ? "Há evidência semântica explícita, ancorada no relato e vinculada ao ator/episódio analisado."
        : supportLevel === "RECONSTRUCTED_STRONG"
          ? "A resposta foi reconstruída a partir de evidências convergentes do mesmo ator/episódio; não é tratada como citação literal de estado mental."
          : "A evidência disponível não sustenta uma reconstrução segura deste eixo.",
    mechanismAlternatives,
  };
}

function decorateAxes(
  axes: SeraVNextEngineOutput["axes"],
  evidence: SeraVNextEngineOutput["factualExtraction"]["evidence"],
): SeraVNextEngineOutput["axes"] {
  return {
    perception: decorateAxisSupport(
      axes.perception,
      "PERCEPTION_STATE",
      evidence,
    ),
    objective: decorateAxisSupport(
      axes.objective,
      "OBJECTIVE_INTENT",
      evidence,
    ),
    action: decorateAxisSupport(axes.action, "ACTION_STRATEGY", evidence),
  };
}

export function runSeraVNextEngineV0(
  input: SeraVNextEngineInput,
): SeraVNextEngineOutput {
  const effectiveInput: SeraVNextEngineInput = {
    ...input,
    semanticEvidence: enforceSemanticEvidenceIntegrity({
      annotations: input.semanticEvidence,
      narrative: input.narrative,
    }),
  };
  const factualExtraction = runStep01FactualExtraction(effectiveInput);
  const initialEvidence = extractEvidenceItems({
    facts: factualExtraction.facts,
    timeline: factualExtraction.timeline,
  });
  const factualExtractionWithInitialEvidence = {
    ...factualExtraction,
    evidence: initialEvidence,
  };
  const escapePoint = runStep03EscapePoint({
    factualExtraction: factualExtractionWithInitialEvidence,
    supplementalEvidence: effectiveInput.supplementalEvidence,
    locale: effectiveInput.locale,
  });
  const safeOperationModel = runStep02SafeOperationModel({
    engineInput: effectiveInput,
    factualExtraction: factualExtractionWithInitialEvidence,
    escapePoint,
  });
  const unsafeState = runStep04UnsafeState({
    engineInput: effectiveInput,
    factualExtraction,
  });
  const poaAnchor =
    escapePoint.poaAnchorCandidate ??
    escapePoint.criticalUnsafeActCandidate ??
    escapePoint.firstDepartureCandidate ??
    escapePoint.statement ??
    escapePoint.earliestCandidate ??
    escapePoint.latestCandidate;
  const poaAnchorSentenceIndex =
    factualExtraction.timeline.find(
      (item) =>
        poaAnchor &&
        (item.statement === poaAnchor ||
          item.statement.includes(poaAnchor) ||
          poaAnchor.includes(item.statement)),
    )?.sourceSentenceIndex ?? null;
  const poaEscapePoint = {
    ...escapePoint,
    excludedPostEscapeEvidence: excludedPostEscapeEvidenceFromTimeline(
      factualExtraction.timeline,
      poaAnchorSentenceIndex,
      poaAnchor,
    ),
  };
  const unsafeActOrCondition = runStep05UnsafeActCondition({
    engineInput: effectiveInput,
    unsafeState,
    escapePoint: poaEscapePoint,
  });
  const directActor = runStep06DirectActor({
    engineInput: effectiveInput,
    unsafeActOrCondition,
    escapePoint: poaEscapePoint,
  });
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
  });
  const supplementalEvidence = extractSupplementalEvidenceItems({
    items: effectiveInput.supplementalEvidence ?? [],
    directActor: directActor.actor,
    sourceSentenceIndex: poaAnchorSentenceIndex ?? 0,
  });
  const factualExtractionWithEvidence = {
    ...factualExtraction,
    evidence: [...narrativeEvidence, ...supplementalEvidence],
  };
  const axisStatements = runStep07AxisStatements({
    engineInput: effectiveInput,
    directActor,
    unsafeActOrCondition,
    factualExtraction: factualExtractionWithEvidence,
    escapePoint: poaEscapePoint,
  });
  const primaryTraversal = runStep08CanonicalTraversal({
    factualExtraction: factualExtractionWithEvidence,
    axisStatements,
    directActor,
    escapePoint: poaEscapePoint,
    locale: effectiveInput.locale,
  });
  const axes = decorateAxes(
    primaryTraversal.axes,
    factualExtractionWithEvidence.evidence,
  );
  const canonicalTraversal = primaryTraversal.canonicalTraversal;
  const preconditions = runStep09Preconditions({
    factualExtraction: factualExtractionWithEvidence,
    escapePoint: poaEscapePoint,
    directActor,
    axes,
    locale: effectiveInput.locale,
  });
  const assurance = runStep10Assurance({
    factualExtraction: factualExtractionWithEvidence,
    escapePoint: poaEscapePoint,
    directActor,
    axes,
    preconditions,
    canonicalTraversal,
    locale: effectiveInput.locale,
  });
  const evidenceSufficiency = runStep10EvidenceSufficiency({
    factualExtraction: factualExtractionWithEvidence,
    safeOperationModel,
    escapePoint: poaEscapePoint,
    directActor,
    canonicalTraversal,
    axes,
    guardrails: assurance.guardrails,
    locale: effectiveInput.locale,
  });

  const firstDepartureActor = semanticActorForLandmark(
    effectiveInput,
    poaEscapePoint.firstDepartureCandidate,
    "FIRST_DEPARTURE",
  );
  const enrichedEscapePoint: SeraVNextEngineOutput["escapePoint"] = {
    ...poaEscapePoint,
    firstDepartureActor,
    criticalUnsafeActActor: directActor.actor,
    directActor: directActor.actor,
  };
  const seeds = discoverTrajectorySeeds({
    annotations: effectiveInput.semanticEvidence,
    timeline: factualExtraction.timeline,
    escapePoint: enrichedEscapePoint,
    directActor,
  });
  const trajectories: SeraTrajectoryAnalysis[] = [];

  for (const [index, seed] of seeds.entries()) {
    if (seed.selectedForPrimaryPoa) {
      trajectories.push({
        id: `TRAJ-${index + 1}`,
        order: index + 1,
        phase: seed.phase,
        anchorStatement: seed.statement,
        sourceSentenceIndex: seed.sourceSentenceIndex,
        actor: seed.actor ?? directActor.actor,
        landmarkRoles: seed.roles,
        selectedForPrimaryPoa: true,
        relationToPrimary: "PRIMARY",
        axes,
        preconditions,
        canonicalTraversal,
        evidenceSufficiency,
        confidence: seed.confidence,
      });
      continue;
    }

    const trajectoryActor = seed.actor?.trim() || null;
    const trajectoryDirectActor: SeraVNextEngineOutput["directActor"] =
      trajectoryActor
        ? {
            actor: trajectoryActor,
            status: "IDENTIFIED",
            alternatives: [],
            actorMigrationWarnings: [],
          }
        : {
            actor: null,
            status: "AMBIGUOUS",
            alternatives: [],
            actorMigrationWarnings: [
              "Trajetória secundária sem ator individualizado.",
            ],
          };
    const trajectoryEscape: SeraVNextEngineOutput["escapePoint"] = {
      status: "CANDIDATE",
      statement: seed.statement,
      earliestCandidate: seed.statement,
      latestCandidate: seed.statement,
      firstDepartureCandidate: seed.roles.includes("FIRST_DEPARTURE")
        ? seed.statement
        : null,
      criticalUnsafeActCandidate: seed.statement,
      firstDepartureActor: seed.roles.includes("FIRST_DEPARTURE")
        ? trajectoryActor
        : null,
      criticalUnsafeActActor: trajectoryActor,
      criticalCandidateAlternatives: [],
      irreversibilityBoundaryCandidate: null,
      anchorBasis: seed.roles.includes("FIRST_DEPARTURE")
        ? "FIRST_DEPARTURE_AND_CRITICAL_ACT"
        : "UNRESOLVED",
      firstDepartureSupportingEvidence: seed.roles.includes("FIRST_DEPARTURE")
        ? [seed.statement]
        : [],
      criticalUnsafeActSupportingEvidence: [seed.statement],
      poaAnchorCandidate: seed.statement,
      poaAnchorSupportingEvidence: [seed.statement],
      poaAnchorBasis: "CRITICAL_UNSAFE_ACT",
      directActor: trajectoryActor,
      supportingEvidence: [seed.statement],
      counterEvidence: [],
      excludedPostEscapeEvidence: excludedPostEscapeEvidenceFromTimeline(
        factualExtraction.timeline,
        seed.sourceSentenceIndex,
        seed.statement,
      ),
      confidence: seed.confidence,
      humanFactorGate: {
        status: "PASSED",
        anchorType: "UNSAFE_ACT",
        rationale: [
          "Trajetória humana materialmente distinta preservada para análise P/O/A própria.",
        ],
      },
    };
    const trajectoryUnsafeAct: SeraVNextEngineOutput["unsafeActOrCondition"] = {
      type: "UNSAFE_ACT",
      statement: seed.statement,
      evidence: [seed.statement],
    };
    const trajectoryNarrativeEvidence = applySemanticAnnotationsToEvidence({
      items: extractEvidenceItems({
        facts: factualExtraction.facts,
        timeline: factualExtraction.timeline,
        directActor: trajectoryDirectActor.actor,
        latestEscapeSentenceIndex: seed.sourceSentenceIndex,
        escapePointStatement: seed.statement,
      }),
      annotations: effectiveInput.semanticEvidence,
      directActor: trajectoryDirectActor.actor,
    });
    const trajectoryFactual = {
      ...factualExtraction,
      evidence: trajectoryNarrativeEvidence,
    };
    const trajectoryAxisStatements = runStep07AxisStatements({
      engineInput: effectiveInput,
      directActor: trajectoryDirectActor,
      unsafeActOrCondition: trajectoryUnsafeAct,
      factualExtraction: trajectoryFactual,
      escapePoint: trajectoryEscape,
    });
    const trajectoryTraversalRaw = runStep08CanonicalTraversal({
      factualExtraction: trajectoryFactual,
      axisStatements: trajectoryAxisStatements,
      directActor: trajectoryDirectActor,
      escapePoint: trajectoryEscape,
      locale: effectiveInput.locale,
    });
    const trajectoryAxes = decorateAxes(
      trajectoryTraversalRaw.axes,
      trajectoryFactual.evidence,
    );
    const trajectoryPreconditions = runStep09Preconditions({
      factualExtraction: trajectoryFactual,
      escapePoint: trajectoryEscape,
      directActor: trajectoryDirectActor,
      axes: trajectoryAxes,
      locale: effectiveInput.locale,
    });
    const trajectoryAssurance = runStep10Assurance({
      factualExtraction: trajectoryFactual,
      escapePoint: trajectoryEscape,
      directActor: trajectoryDirectActor,
      axes: trajectoryAxes,
      preconditions: trajectoryPreconditions,
      canonicalTraversal: trajectoryTraversalRaw.canonicalTraversal,
      locale: effectiveInput.locale,
    });
    const trajectoryEvidenceSufficiency = runStep10EvidenceSufficiency({
      factualExtraction: trajectoryFactual,
      safeOperationModel,
      escapePoint: trajectoryEscape,
      directActor: trajectoryDirectActor,
      canonicalTraversal: trajectoryTraversalRaw.canonicalTraversal,
      axes: trajectoryAxes,
      guardrails: trajectoryAssurance.guardrails,
      locale: effectiveInput.locale,
    });
    trajectories.push({
      id: `TRAJ-${index + 1}`,
      order: index + 1,
      phase: seed.phase,
      anchorStatement: seed.statement,
      sourceSentenceIndex: seed.sourceSentenceIndex,
      actor: trajectoryDirectActor.actor,
      landmarkRoles: seed.roles,
      selectedForPrimaryPoa: false,
      relationToPrimary: seed.relationToPrimary,
      axes: trajectoryAxes,
      preconditions: trajectoryPreconditions,
      canonicalTraversal: trajectoryTraversalRaw.canonicalTraversal,
      evidenceSufficiency: trajectoryEvidenceSufficiency,
      confidence: seed.confidence,
    });
  }

  if (trajectories.length === 0 && poaAnchor) {
    trajectories.push({
      id: "TRAJ-1",
      order: 1,
      phase: "GENERIC",
      anchorStatement: poaAnchor,
      sourceSentenceIndex: poaAnchorSentenceIndex ?? 0,
      actor: directActor.actor,
      landmarkRoles: ["CRITICAL_UNSAFE_ACT"],
      selectedForPrimaryPoa: true,
      relationToPrimary: "PRIMARY",
      axes,
      preconditions,
      canonicalTraversal,
      evidenceSufficiency,
      confidence: poaEscapePoint.confidence,
    });
  }

  const evidenceGraph = buildCausalEvidenceGraph({
    evidence: factualExtractionWithEvidence.evidence,
    primaryAnchor: poaAnchor ?? null,
  });

  return {
    engineVersion: SERA_VNEXT_ENGINE_VERSION,
    methodologyVersion: SERA_VNEXT_METHODOLOGY_VERSION,
    baselineId: SERA_VNEXT_BASELINE_ID,
    fixtureSetId: SERA_VNEXT_FIXTURE_SET_ID,
    mode: input.mode,
    factualExtraction: factualExtractionWithEvidence,
    safeOperationModel,
    escapePoint: enrichedEscapePoint,
    unsafeState,
    unsafeActOrCondition,
    directActor,
    axes,
    preconditions,
    trajectories,
    evidenceGraph,
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
  };
}
