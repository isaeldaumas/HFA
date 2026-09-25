import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function readRel(rootDir: string, relPath: string): string {
  return readFileSync(path.join(rootDir, relPath), "utf8");
}

function hasAll(source: string, tokens: string[]): boolean {
  return tokens.every((token) => source.includes(token));
}

export function assertAnalyzeRouteSanitizationContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/analyze/route.ts";
  const source = readRel(rootDir, routePath);
  const requiredCodes = [
    "ANALYZE_INVALID_INPUT",
    "ANALYZE_UNAUTHORIZED",
    "ANALYZE_FORBIDDEN",
    "ANALYZE_ENGINE_UNAVAILABLE",
    "ANALYZE_PERSISTENCE_ERROR",
    "ANALYZE_INTERNAL_ERROR",
  ];

  assert.ok(source.includes("buildErrorResponse"), `${routePath}: must use structured error builder`);
  assert.ok(hasAll(source, requiredCodes), `${routePath}: missing stable ANALYZE_* error code`);
  assert.equal(source.includes("String(e)"), false, `${routePath}: must not stringify raw final errors`);
  assert.equal(source.includes("String(err)"), false, `${routePath}: must not stringify raw nested errors`);
  assert.equal(source.includes("error.message"), false, `${routePath}: must not expose raw error.message`);
  assert.equal(source.includes("stack"), false, `${routePath}: must not expose stack data`);
  assert.ok(source.includes("createCanonicalEventAnalysis"), `${routePath}: primary SERA engine must be canonical 0.3`);
  assert.equal(source.includes("completeSeraAnalysisAfterEventCreated"), false, `${routePath}: legacy engine must not be reachable from /api/analyze`);
  assert.equal(source.includes("isSeraVNextCanonicalAnalyzeEnabled"), false, `${routePath}: primary engine must not be selected by rollout flag`);
  assert.equal(source.includes("String(user.role ?? '').toLowerCase() === 'admin'"), false, `${routePath}: primary engine must not be admin-only`);
  assert.equal(source.includes("applyUserAiSettingsToEnv"), false, `${routePath}: deterministic SERA engine must not require an AI provider setting`);
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera-vnext/product-unification/error-sanitization-trial-001.ts")),
    "error sanitization trial must exist for /api/analyze protected path changes",
  );
}

export function assertEventsPrimarySeraContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("createCanonicalEventAnalysis"), `${routePath}: event creation must use primary SERA 0.3 engine`);
  assert.equal(source.includes("completeSeraAnalysisAfterEventCreated"), false, `${routePath}: event creation must not call legacy engine`);
  assert.equal(source.includes("applyUserAiSettingsToEnv"), false, `${routePath}: deterministic primary engine must not require AI provider settings`);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: event listing must read current SERA codes`);
  assert.ok(source.includes("analysis_engine: current ? 'SERA_ENGINE_0_3'"), `${routePath}: event listing must identify current engine provenance`);
}

export function assertEventDetailVNextReadContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/[eventId]/route.ts";
  const source = readRel(rootDir, routePath);

  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: GET must require authenticated bearer user`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: current SERA lookup must be tenant-scoped`);
  assert.ok(source.includes(".is('deleted_at', null)"), `${routePath}: current SERA lookup must exclude archived analyses`);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: expected current SERA analysis source`);
  assert.equal(source.includes("isSeraVNextCanonicalAnalyzeUiEnabled()"), false, `${routePath}: current SERA analysis must not be hidden behind a UI flag`);
  assert.equal(source.includes("String(user.role ?? '').toLowerCase() === 'admin'"), false, `${routePath}: current SERA analysis must be visible to authenticated tenant users, not only admins`);
  assert.equal(source.includes(".from('sera_vnext_analyses').insert"), false, `${routePath}: GET integration must not insert vNext analysis rows`);
  assert.equal(source.includes(".from('sera_vnext_analyses').update"), false, `${routePath}: GET integration must not update vNext analysis rows`);
  assert.equal(source.includes(".from('sera_vnext_analyses').delete"), false, `${routePath}: GET integration must not delete vNext analysis rows`);
}

export function assertEventVNextReanalyzeContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts";
  const source = readRel(rootDir, routePath);

  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: must require authenticated bearer user`);
  assert.equal(source.includes("String(user.role ?? '').toLowerCase() !== 'admin'"), false, `${routePath}: primary reanalysis must be available to authenticated tenant users, not only admins`);
  assert.equal(source.includes("isSeraVNextCanonicalAnalyzeEnabled()"), false, `${routePath}: primary SERA reanalysis must not depend on a legacy rollout flag`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: event lookup/update must remain tenant-scoped`);
  assert.ok(source.includes(".is('deleted_at', null)"), `${routePath}: deleted events must not be reanalyzed`);
  assert.ok(source.includes("userId: user.publicUserId"), `${routePath}: persistence FK must use public.users identity`);
  assert.ok(source.includes("mode: 'REANALYSIS'"), `${routePath}: must use canonical reanalysis mode`);
  assert.ok(source.includes("engine_role: 'PRIMARY'"), `${routePath}: audit must identify the current engine as primary`);
  assert.ok(source.includes("human_review_required: true"), `${routePath}: human review requirement must remain explicit`);
  assert.equal(source.includes("completeSeraAnalysisAfterEventCreated"), false, `${routePath}: must not invoke legacy SERA pipeline`);
  assert.equal(source.includes("debitCreditForEvent"), false, `${routePath}: reanalysis must not consume a new credit`);
}

export function assertCorrectiveActionsPrimarySeraContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/actions/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: actions must require authenticated user`);
  assert.ok(source.includes("sera_vnext_analysis_id"), `${routePath}: actions must support current SERA analysis foreign key`);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: action creation must resolve current SERA analysis first`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: analysis lookup must remain tenant-scoped`);
}

export function assertCurrentSeraPdfContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/sera/analyses/[analysisId]/pdf/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: PDF must require authenticated tenant user`);
  assert.ok(source.includes("ensurePublicUserRow"), `${routePath}: PDF audit actor must resolve public user identity`);
  assert.ok(source.includes("exportSeraVNextAnalysisPdf"), `${routePath}: PDF must use current detailed SERA exporter`);
  assert.equal(source.includes("requireAdmin"), false, `${routePath}: current SERA PDF must not be admin-only`);
}

export function assertEventClarificationContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/[eventId]/clarifications/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: clarifications must require authenticated user`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: event and analysis lookups must remain tenant-scoped`);
  assert.ok(source.includes("validateClarificationResponses"), `${routePath}: clarification payload must be validated`);
  assert.ok(source.includes("reanalyzeSeraVNextAnalysis"), `${routePath}: clarification must rerun current SERA engine`);
  assert.equal(source.includes("requireAdmin"), false, `${routePath}: evidence collection must be available to normal tenant users`);
  assert.equal(source.includes("completeSeraAnalysisAfterEventCreated"), false, `${routePath}: clarification must never invoke legacy engine`);
}

export function assertAdminStatsCurrentSeraContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/admin/stats/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: current SERA analyses must drive active analysis stats`);
  assert.ok(source.includes("legacy_analyses: legacy.length"), `${routePath}: legacy must remain audit-only count`);
  assert.ok(source.includes("total_analyses: activeVNext.length"), `${routePath}: total analysis metric must use current SERA`);
}

export function assertAdminTenantsCurrentSeraContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/admin/tenants/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: tenant analysis counts must use current SERA source`);
  assert.equal(source.includes("admin.from('analyses').select('tenant_id')"), false, `${routePath}: active tenant counts must not be legacy-only`);
}

export function assertTrialUsageCurrentSeraContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/trial/status/route.ts";
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("from('events')"), `${routePath}: trial usage must count consumed events`);
  assert.ok(source.includes(".gt('credits_used', 0)"), `${routePath}: trial usage must reflect actual consumed analyses`);
  assert.equal(source.includes("from('analyses')"), false, `${routePath}: trial usage must not depend on legacy analysis table`);
}

export function assertLegacyRecalculationDisabledContract(rootDir: string, routePath: string): void {
  const source = readRel(rootDir, routePath);
  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: historical endpoint must still require authentication`);
  assert.ok(source.includes("status: 410"), `${routePath}: historical recalculation must be gone`);
  assert.equal(source.includes("@/lib/sera/recalculate"), false, `${routePath}: legacy recalculation engine must not be imported`);
  assert.equal(source.includes("recalculate("), false, `${routePath}: legacy recalculation must not execute`);
}

export function isAllowedSeraVNextProtectedApiPath(rootDir: string, changedPath: string): boolean {
  if (changedPath === "frontend/src/app/api/analyze/route.ts") {
    assertAnalyzeRouteSanitizationContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/recalculate/route.ts" ||
      changedPath === "frontend/src/app/api/analyses/[analysisId]/recalculate/route.ts" ||
      changedPath === "frontend/src/app/api/analyses/[analysisId]/edits/[editId]/route.ts") {
    assertLegacyRecalculationDisabledContract(rootDir, changedPath);
    return true;
  }
  if (changedPath === "frontend/src/app/api/admin/stats/route.ts") {
    assertAdminStatsCurrentSeraContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/admin/tenants/route.ts") {
    assertAdminTenantsCurrentSeraContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/trial/status/route.ts") {
    assertTrialUsageCurrentSeraContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/actions/route.ts") {
    assertCorrectiveActionsPrimarySeraContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/sera/analyses/[analysisId]/pdf/route.ts") {
    assertCurrentSeraPdfContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/events/[eventId]/clarifications/route.ts") {
    assertEventClarificationContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/events/route.ts") {
    assertEventsPrimarySeraContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/events/[eventId]/route.ts") {
    assertEventDetailVNextReadContract(rootDir);
    return true;
  }
  if (changedPath === "frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts") {
    assertEventVNextReanalyzeContract(rootDir);
    return true;
  }
  return false;
}

export function assertCanonicalTreeEngineContract(rootDir: string): void {
  const relPath = "frontend/src/lib/sera-vnext/canonical-tree/evaluate-node.ts";
  const source = readRel(rootDir, relPath);

  assert.ok(
    source.includes("known-rule anchor"),
    `${relPath}: O_RULES must keep the conservative known-rule anchor`,
  );
  assert.ok(
    source.includes("hasKnownRule && hasAwareness"),
    `${relPath}: O_RULES violation branch must require known-rule and awareness evidence`,
  );
  for (const forbidden of ["selectedCode", "releasedCode", "finalConclusion", "classifiedOutput", "downstreamAllowed"]) {
    assert.equal(source.includes(forbidden), false, `${relPath}: must not activate final output field ${forbidden}`);
  }
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera-vnext/product-alpha-candidate-only-trial-001.ts")),
    "Product Alpha candidate-only trial must cover canonical-tree changes",
  );
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera-vnext/semantic-consistency-released-codes-trial-001.ts")),
    "semantic consistency trial must cover canonical-tree changes",
  );
}

export function isAllowedSeraVNextEngineV03CalibrationPath(rootDir: string, changedPath: string): boolean {
  const allowed = new Set([
    "frontend/src/lib/sera-vnext/engine-v0/run-engine.ts",
    "frontend/src/lib/sera-vnext/engine-v0/candidate-escape-window.ts",
    "frontend/src/lib/sera-vnext/engine-v0/steps/03-escape-point.ts",
    "frontend/src/lib/sera-vnext/engine-v0/steps/06-direct-actor.ts",
    "frontend/src/lib/sera-vnext/engine-v0/steps/10-evidence-sufficiency.ts",
  ]);
  if (!allowed.has(changedPath)) return false;

  const requiredGates = [
    "tests/sera-vnext/ps-cdq-golden-case-trial-001.ts",
    "tests/sera-vnext/ps-cdq-family-generalization-trial-001.ts",
    "tests/sera-vnext/evidence-sufficiency-clarification-trial-001.ts",
    "tests/sera-vnext/evidence-clarification-product-trial-001.ts",
    "tests/sera-vnext/engine-validation-v04-method-aligned-trial-001.ts",
    "tests/sera-vnext/engine-validation-v04-holdout-method-aligned-trial-001.ts",
    "tests/sera-vnext/historical-runtime-baselines-preserved-trial-001.ts",
  ];
  for (const gate of requiredGates) {
    assert.ok(existsSync(path.join(rootDir, gate)), `0.3.0 calibration requires gate: ${gate}`);
  }
  const versionSource = readRel(rootDir, "frontend/src/lib/sera-vnext/ENGINE_VERSION.ts");
  assert.ok(versionSource.includes("SERA_VNEXT_ENGINE_VERSION = '0.3.0'"), "engine-v0 calibration changes require runtime 0.3.0");
  return true;
}

export function isAllowedSeraVNextCanonicalTreePath(rootDir: string, changedPath: string): boolean {
  if (changedPath !== "frontend/src/lib/sera-vnext/canonical-tree/evaluate-node.ts") return false;
  assertCanonicalTreeEngineContract(rootDir);
  return true;
}

export function isAllowedA4R190LegacyMethodologyPath(rootDir: string, changedPath: string): boolean {
  if (![
    "frontend/src/lib/sera/all-steps.ts",
    "frontend/src/lib/sera/rules/objective/select.ts",
  ].includes(changedPath)) return false;

  assert.ok(
    existsSync(path.join(rootDir, "docs/sera-vnext/runtime-alignment-a4r190/SERA_A4R190_A_CANONICAL_SEMANTIC_REMEDIATION_v0.2.1.md")),
    "A4R190 legacy methodology changes require the semantic-remediation record",
  );
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera/objective-generalization-static.ts")),
    "A4R190 legacy methodology changes require objective boundary coverage",
  );
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera-vnext/canonical-tree-semantic-trial-002.ts")),
    "A4R190 legacy methodology changes require canonical semantic coverage",
  );
  return true;
}
