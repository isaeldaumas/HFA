import assert from "node:assert/strict";
import { handleSeraVNextCandidateRequest } from "../../../frontend/src/app/api/admin/sera-vnext/candidate/handler";
import { analyzeSeraVNext } from "../../../frontend/src/lib/sera-vnext";
import type { SeraVNextResult } from "../../../frontend/src/lib/sera-vnext/types";
import {
  analyzeSeraVNextCandidateOnly,
  getSeraVNextRuntimeReadOnlySummary,
} from "../../../frontend/src/lib/sera-vnext-runtime";
import type { ApiUserContext } from "../../../frontend/src/lib/server/api-auth";
import type {
  SeraVNextEngineValidationCaseResult,
  SeraVNextEngineValidationFinding,
  SeraVNextEngineValidationRunResult,
  SeraVNextEngineValidationScope,
} from "./engine-validation-types";
import { engineValidationCases, productAlphaCandidateNarrative } from "./validation-cases";

const betaBlockingIssue =
  "Complete executable SERA vNext engine is not implemented for Product Beta: current product runtime is read-only/candidate-only, canonical tree traversal is non-final, and the base vNext engine keeps preconditions stubbed/non-final.";

const commonFindings: SeraVNextEngineValidationFinding[] = [
  {
    id: "EV-FINDING-001",
    severity: "blocking",
    component: "frontend/src/lib/sera-vnext-runtime/candidate-only/candidate-service.ts",
    detail: "Product Alpha exposed runtime returns CANDIDATE_ONLY, REAL_TREE_MISSING, no selectedCode, no releasedCode, no finalConclusion, and no persistence.",
  },
  {
    id: "EV-FINDING-002",
    severity: "blocking",
    component: "frontend/src/lib/sera-vnext/steps/07-preconditions.ts",
    detail: "Protected causal chain requires preconditions, but the base engine precondition step is a TODO stub returning an empty list.",
  },
  {
    id: "EV-FINDING-003",
    severity: "blocking",
    component: "frontend/src/lib/sera-vnext/engine.ts",
    detail: "Base vNext engine is a non-final dry-run/eligibility engine. It explicitly blocks finalConclusion, HFACS, Risk/ERC, DB writes, UI integration, and legacy import.",
  },
  {
    id: "EV-FINDING-004",
    severity: "blocking",
    component: "frontend/src/lib/sera-vnext-runtime/readonly-summary.ts",
    detail: "Runtime summary reports productIntegrated/apiIntegrated/uiIntegrated/runtimeIntegrated as false and keeps selectedCode/releasedCode/finalConclusion null.",
  },
  {
    id: "EV-FINDING-005",
    severity: "confirmation",
    component: "tests/sera-vnext/engine-validation",
    detail: "Validation confirms the safe blocking state and therefore blocks Product Beta persistence/review/UI work.",
  },
];

function assertBaseEngineNonFinal(result: SeraVNextResult, label: string): string[] {
  const record = result as unknown as Record<string, unknown>;
  const observations: string[] = [];

  assert.equal(record.finalConclusion, undefined, `${label}: finalConclusion must not be emitted`);
  assert.equal(record.hfacs, undefined, `${label}: HFACS must not be emitted`);
  assert.equal(record.risk, undefined, `${label}: risk must not be emitted`);
  assert.equal(record.erc_level, undefined, `${label}: erc_level must not be emitted`);
  assert.equal(record.arms, undefined, `${label}: arms must not be emitted`);
  assert.equal(record.codeReleaseGate, undefined, `${label}: codeReleaseGate must not be emitted from base engine`);
  assert.equal(result.humanReviewRequired, true, `${label}: human review must remain required`);
  assert.notEqual(result.causalAssurance.status, "PASSED", `${label}: causal assurance must not pass`);
  assert.equal(result.trace.stepStatus["07-preconditions"], "stub", `${label}: precondition step must expose stub status`);
  assert.equal(result.preconditions.items.length, 0, `${label}: base preconditions must remain empty until complete engine exists`);

  for (const axis of [
    result.poaClassification.perception,
    result.poaClassification.objective,
    result.poaClassification.action,
  ]) {
    assert.equal(axis.selectedCode, "UNRESOLVED", `${label}/${axis.axis}: selectedCode must remain unresolved`);
    assert.notEqual(axis.status, "CLASSIFIED", `${label}/${axis.axis}: axis must not be CLASSIFIED`);
  }

  observations.push("base engine executed without final output");
  observations.push("selectedCode remains UNRESOLVED for all axes");
  observations.push("preconditions step is stub and empty");
  observations.push(`causalAssurance=${result.causalAssurance.status}`);
  return observations;
}

async function runBaseEngineCases(scope: SeraVNextEngineValidationScope): Promise<SeraVNextEngineValidationCaseResult[]> {
  const cases = engineValidationCases.filter((item) => item.scope === scope);
  const results: SeraVNextEngineValidationCaseResult[] = [];

  for (const validationCase of cases) {
    const output = await analyzeSeraVNext({
      inputId: validationCase.inputId,
      sourceType: "neutral_trial",
      locale: "en",
      narrative: validationCase.narrative,
      options: {
        allowLlm: false,
        requireHumanReview: true,
        includeDebugTrace: true,
      },
    });

    const observations = assertBaseEngineNonFinal(output, validationCase.caseId);
    results.push({
      caseId: validationCase.caseId,
      scope,
      passed: true,
      observations,
    });
  }

  return results;
}

async function runDeterminismCases(): Promise<SeraVNextEngineValidationCaseResult[]> {
  const validationCase = engineValidationCases.find((item) => item.caseId === "EV-REG-001-THEBAUD-NONFINAL");
  assert.ok(validationCase, "determinism source case missing");

  const first = await analyzeSeraVNext({
    inputId: validationCase.inputId,
    sourceType: "neutral_trial",
    locale: "en",
    narrative: validationCase.narrative,
    options: {
      allowLlm: false,
      requireHumanReview: true,
      includeDebugTrace: true,
    },
  });
  const second = await analyzeSeraVNext({
    inputId: validationCase.inputId,
    sourceType: "neutral_trial",
    locale: "en",
    narrative: validationCase.narrative,
    options: {
      allowLlm: false,
      requireHumanReview: true,
      includeDebugTrace: true,
    },
  });

  assert.deepEqual(second, first, "base vNext dry-run engine must be deterministic for identical input");
  const direct = analyzeSeraVNextCandidateOnly({
    input: { eventText: productAlphaCandidateNarrative, clientRequestId: "determinism" },
    requestId: "engine-validation-candidate-determinism",
  });
  const repeat = analyzeSeraVNextCandidateOnly({
    input: { eventText: productAlphaCandidateNarrative, clientRequestId: "determinism" },
    requestId: "engine-validation-candidate-determinism",
  });
  assert.deepEqual(repeat, direct, "candidate-only runtime must be deterministic for identical input/requestId");

  return [
    {
      caseId: "EV-DET-001-PARTIAL-ENGINE-DETERMINISTIC",
      scope: "determinism",
      passed: true,
      observations: [
        "base vNext dry-run output is deterministic for identical input",
        "candidate-only runtime output is deterministic for identical input/requestId",
        "determinism does not remove the Product Beta blocking issue",
      ],
    },
  ];
}

async function runProductAlphaE2ECase(): Promise<SeraVNextEngineValidationCaseResult[]> {
  const adminUser: ApiUserContext = {
    userId: "engine-validation-admin",
    email: "engine-validation@example.test",
    tenantId: "tenant-engine-validation",
    role: "admin",
    accessToken: "must-not-leak",
  };
  const events: Array<Record<string, unknown>> = [];
  const response = await handleSeraVNextCandidateRequest(
    new Request("http://localhost/api/admin/sera-vnext/candidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "engine-validation-product-alpha",
      },
      body: JSON.stringify({
        eventText: productAlphaCandidateNarrative,
        clientRequestId: "engine-validation-product-alpha",
      }),
    }),
    {
      requireAdminUser: async () => adminUser,
      isReadOnlyEnabled: () => true,
      isInternalPilotEnabled: () => true,
      isCandidateOnlyEnabled: () => true,
      logEvent: (event) => events.push(event),
      requestId: () => "engine-validation-product-alpha",
      now: (() => {
        let current = 0;
        return () => {
          current += 10;
          return current;
        };
      })(),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.analysisStatus, "CANDIDATE_ONLY");
  assert.equal(payload.canonicalTreeStatus, "REAL_TREE_MISSING");
  assert.equal(payload.selectedCode, null);
  assert.equal(payload.releasedCode, null);
  assert.equal(payload.finalConclusion, null);
  assert.equal(payload.persisted, false);
  assert.equal(payload.readyPromotion, false);
  assert.equal(payload.downstreamAllowed, false);

  const runtimeSummary = getSeraVNextRuntimeReadOnlySummary();
  assert.equal(runtimeSummary.mode, "READ_ONLY_RUNTIME_MODULE");
  assert.equal(runtimeSummary.productIntegrated, false);
  assert.equal(runtimeSummary.apiIntegrated, false);
  assert.equal(runtimeSummary.uiIntegrated, false);
  assert.equal(runtimeSummary.runtimeIntegrated, false);
  assert.equal(runtimeSummary.selectedCode, null);
  assert.equal(runtimeSummary.releasedCode, null);
  assert.equal(runtimeSummary.finalConclusion, null);

  const eventText = JSON.stringify(events);
  assert.equal(eventText.includes("must-not-leak"), false, "admin token must not be logged");
  assert.equal(eventText.includes(productAlphaCandidateNarrative), false, "full event text must not be logged");

  return [
    {
      caseId: "EV-PA-E2E-001-CANDIDATE-ONLY-NONFINAL",
      scope: "product_alpha_e2e",
      passed: true,
      observations: [
        "Product Alpha route returns CANDIDATE_ONLY",
        "canonicalTreeStatus=REAL_TREE_MISSING",
        "selectedCode/releasedCode/finalConclusion remain null",
        "runtime summary is read-only and not product-integrated",
      ],
    },
  ];
}

export async function runSeraVNextEngineValidation(
  scope: SeraVNextEngineValidationScope,
): Promise<SeraVNextEngineValidationRunResult> {
  let caseResults: SeraVNextEngineValidationCaseResult[];
  if (scope === "determinism") {
    caseResults = await runDeterminismCases();
  } else if (scope === "product_alpha_e2e") {
    caseResults = await runProductAlphaE2ECase();
  } else {
    caseResults = await runBaseEngineCases(scope);
  }

  return {
    scope,
    passed: caseResults.every((item) => item.passed),
    finalDecision: "SERA_VNEXT_ENGINE_NOT_IMPLEMENTED",
    productBetaGateStatus: "PRODUCT_BETA_FOUNDATION_BLOCKED",
    blockingIssues: [betaBlockingIssue],
    findings: commonFindings,
    caseResults,
  };
}

export function assertProductBetaBlocked(result: SeraVNextEngineValidationRunResult): void {
  assert.equal(result.passed, true);
  assert.equal(result.finalDecision, "SERA_VNEXT_ENGINE_NOT_IMPLEMENTED");
  assert.equal(result.productBetaGateStatus, "PRODUCT_BETA_FOUNDATION_BLOCKED");
  assert.ok(result.blockingIssues.includes(betaBlockingIssue));
  assert.ok(result.findings.some((item) => item.id === "EV-FINDING-001" && item.severity === "blocking"));
  assert.ok(result.findings.some((item) => item.id === "EV-FINDING-002" && item.severity === "blocking"));
}
