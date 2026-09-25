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
  assert.ok(
    existsSync(path.join(rootDir, "tests/sera-vnext/product-unification/error-sanitization-trial-001.ts")),
    "error sanitization trial must exist for /api/analyze protected path changes",
  );
}

export function assertEventDetailVNextReadContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/[eventId]/route.ts";
  const source = readRel(rootDir, routePath);

  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: GET must require authenticated bearer user`);
  assert.ok(source.includes("String(user.role ?? '').toLowerCase() === 'admin'"), `${routePath}: vNext detail exposure must remain admin-only`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: vNext lookup must be tenant-scoped`);
  assert.ok(source.includes(".is('deleted_at', null)"), `${routePath}: vNext lookup must exclude archived analyses`);
  assert.ok(source.includes("from('sera_vnext_analyses')"), `${routePath}: expected explicit vNext read source`);
  assert.ok(source.includes("isSeraVNextCanonicalAnalyzeUiEnabled()"), `${routePath}: vNext detail read must remain behind UI feature flag`);
  assert.equal(source.includes(".from('sera_vnext_analyses').insert"), false, `${routePath}: GET integration must not insert vNext analysis rows`);
  assert.equal(source.includes(".from('sera_vnext_analyses').update"), false, `${routePath}: GET integration must not update vNext analysis rows`);
  assert.equal(source.includes(".from('sera_vnext_analyses').delete"), false, `${routePath}: GET integration must not delete vNext analysis rows`);
}

export function assertEventVNextReanalyzeContract(rootDir: string): void {
  const routePath = "frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts";
  const source = readRel(rootDir, routePath);

  assert.ok(source.includes("requireBearerUser(req)"), `${routePath}: must require authenticated bearer user`);
  assert.ok(source.includes("String(user.role ?? '').toLowerCase() !== 'admin'"), `${routePath}: must remain admin-only`);
  assert.ok(source.includes("isSeraVNextCanonicalAnalyzeEnabled()"), `${routePath}: must require canonical vNext feature flag`);
  assert.ok(source.includes(".eq('tenant_id', user.tenantId)"), `${routePath}: event lookup/update must remain tenant-scoped`);
  assert.ok(source.includes(".is('deleted_at', null)"), `${routePath}: deleted events must not be reanalyzed`);
  assert.ok(source.includes("userId: user.publicUserId"), `${routePath}: persistence FK must use public.users identity`);
  assert.ok(source.includes("mode: 'REANALYSIS'"), `${routePath}: must use canonical reanalysis mode`);
  assert.ok(source.includes("candidate_only: true"), `${routePath}: audit must preserve candidate-only status`);
  assert.equal(source.includes("completeSeraAnalysisAfterEventCreated"), false, `${routePath}: must not invoke legacy SERA pipeline`);
  assert.equal(source.includes("debitCreditForEvent"), false, `${routePath}: reanalysis must not consume a new credit`);
}

export function isAllowedSeraVNextProtectedApiPath(rootDir: string, changedPath: string): boolean {
  if (changedPath === "frontend/src/app/api/analyze/route.ts") {
    assertAnalyzeRouteSanitizationContract(rootDir);
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
