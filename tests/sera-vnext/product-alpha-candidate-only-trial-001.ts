import assert from "node:assert/strict";
import { handleSeraVNextCandidateRequest } from "../../frontend/src/app/api/admin/sera-vnext/candidate/route";
import { analyzeSeraVNextCandidateOnly } from "../../frontend/src/lib/sera-vnext-runtime";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const adminUser: ApiUserContext = {
  userId: "a4r225-admin",
  email: "admin@example.test",
  tenantId: "tenant-enterprise-a4r225",
  role: "admin",
  accessToken: "must-not-be-logged",
};

const candidateNarrative =
  "During the night approach, the crew noticed unstable indications and descended below the intended glide path. The captain decided to continue the approach despite the warning. Seconds later the aircraft struck runway lights and sustained damage.";

async function main() {
  const direct = analyzeSeraVNextCandidateOnly({
    input: { eventText: candidateNarrative, clientRequestId: "direct-run" },
    requestId: "candidate-direct",
  });
  const directRepeat = analyzeSeraVNextCandidateOnly({
    input: { eventText: candidateNarrative, clientRequestId: "direct-run-repeat" },
    requestId: "candidate-direct",
  });

  assert.deepEqual(directRepeat, direct, "direct candidate service must be deterministic for equal input and requestId");
  assert.equal(direct.mode, "CANDIDATE_ONLY");
  assert.equal(direct.analysisStatus, "CANDIDATE_ONLY");
  assert.equal(direct.canonicalTreeStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(direct.selectedCode, null);
  assert.equal(direct.releasedCode, null);
  assert.equal(direct.finalConclusion, null);
  assert.equal(direct.classifiedOutput, false);
  assert.equal(direct.readyPromotion, false);
  assert.equal(direct.downstreamAllowed, false);
  assert.equal(direct.persisted, false);
  assert.ok(direct.factualExtraction.facts.length >= 3, "factual extraction expected");
  assert.ok(direct.factualExtraction.timeline.length >= 3, "timeline expected");
  assert.equal(direct.axes.perception.status, "INSUFFICIENT_EVIDENCE", "perception must remain blocked while actor is unresolved");
  assert.equal(direct.axes.objective.status, "INSUFFICIENT_EVIDENCE", "objective must remain blocked while actor is unresolved");
  assert.equal(direct.axes.action.status, "INSUFFICIENT_EVIDENCE", "action must remain blocked while actor is unresolved");
  assert.equal(direct.canonicalTraversal.paths.length, 0, "canonical traversal must not start with unresolved direct actor");
  assert.ok(direct.escapePoint.supportingEvidence.length >= 1, "escape window evidence expected");
  assert.equal(
    direct.escapePoint.latestCandidate?.includes("struck runway lights") ?? false,
    false,
    "escape window must not use consequence as causal window boundary",
  );
  assert.ok(direct.preconditions.length >= 1, "candidate-only preconditions expected");
  assert.ok(direct.evidenceSufficiency.blockingReasons.includes("DIRECT_ACTOR_UNRESOLVED"), "direct actor must block P/O/A");

  const events: Array<Record<string, unknown>> = [];
  const request = new Request("http://localhost/api/admin/sera-vnext/candidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-request-id": "candidate-route-ok",
    },
    body: JSON.stringify({
      eventText: candidateNarrative,
      clientRequestId: "client-ok",
    }),
  });

  const response = await handleSeraVNextCandidateRequest(request, {
    requireAdminUser: async () => adminUser,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    isCandidateOnlyEnabled: () => true,
    logEvent: (event) => events.push(event),
    requestId: () => "candidate-route-ok",
    now: (() => {
      let current = 1000;
      return () => {
        current += 5;
        return current;
      };
    })(),
  });

  assert.equal(response.status, 200);
  const payload = (await response.json()) as Awaited<ReturnType<typeof analyzeSeraVNextCandidateOnly>>;
  assert.equal(payload.requestId, "candidate-route-ok");
  assert.equal(payload.analysisStatus, "CANDIDATE_ONLY");
  assert.equal(payload.canonicalTreeStatus, "INSUFFICIENT_EVIDENCE");
  assert.equal(payload.persisted, false);
  assert.equal(payload.readyPromotion, false);
  assert.equal(payload.downstreamAllowed, false);
  assert.equal(payload.selectedCode, null);
  assert.equal(payload.releasedCode, null);
  assert.equal(payload.finalConclusion, null);
  assert.ok(payload.warnings.includes("NON_FINAL_OUTPUT_ONLY"));
  assert.ok(payload.warnings.includes("HUMAN_REVIEW_REQUIRED"));
  assert.equal(payload.canonicalTraversal.status, "INSUFFICIENT_EVIDENCE");
  assert.ok(
    payload.canonicalTraversal.unansweredQuestions.some((question) => /direct actor|ator direto/i.test(question)),
    "direct-actor ambiguity should be the blocking question before P/O/A traversal",
  );
  assert.ok(payload.warnings.includes("DIRECT_ACTOR_REVIEW_REQUIRED"));
  assert.ok(payload.humanReviewPackage.reviewerDecisionsRequired.length >= 1);

  const eventsText = JSON.stringify(events);
  assert.ok(events.some((event) => event.event === "sera_vnext_candidate_assessment_requested"));
  assert.ok(events.some((event) => event.event === "sera_vnext_candidate_assessment_completed"));
  for (const forbidden of ["must-not-be-logged", candidateNarrative, "Bearer", "cookie", "selectedCode"]) {
    assert.equal(eventsText.includes(forbidden), false, `forbidden content must not be logged: ${forbidden}`);
  }

  console.log("PRODUCT_ALPHA_CANDIDATE_ONLY_OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
