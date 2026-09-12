import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getSeraVNextRuntimeReadOnlySummary } from "../../frontend/src/lib/sera-vnext-runtime";
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

const rootDir = path.resolve(__dirname, "..", "..");

function rel(relativePath: string) {
  return path.join(rootDir, relativePath);
}

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full));
    else files.push(full);
  }
  return files;
}

const protectedBefore = {
  baseline: statSync(rel("tests/sera-vnext/baselines/sera-vnext-baseline-v0.json")).mtimeMs,
  fixtureSet: statSync(rel("tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json")).mtimeMs,
  expectedOutputs: statSync(rel("tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json")).mtimeMs,
};

const summary = getSeraVNextRuntimeReadOnlySummary();

assert.equal(summary.mode, "READ_ONLY_RUNTIME_MODULE");
assert.equal(summary.baselineId, "SERA_VNEXT_BASELINE_V0");
assert.equal(summary.namespace, "sera-vnext");
assert.equal(summary.status, "VNEXT_BASELINE_V0_OFFICIAL");
assert.equal(summary.fixtureCount, 7);
assert.equal(summary.expectedOutputCount, 7);
assert.equal(summary.productIntegrated, false);
assert.equal(summary.apiIntegrated, false);
assert.equal(summary.uiIntegrated, false);
assert.equal(summary.runtimeIntegrated, false);
assert.equal(summary.downstreamAllowed, false);
assert.equal(summary.selectedCode, null);
assert.equal(summary.releasedCode, null);
assert.equal(summary.finalConclusion, null);
assert.equal(summary.classifiedOutput, false);
assert.equal(summary.readyPromotion, false);
assert.ok(summary.warnings.includes("BOUNDARY_WARNING_REQUIRED"));
assert.ok(summary.warnings.includes("SYNTHETIC_ONLY"));
assert.ok(summary.warnings.includes("NO_SYNTHETIC_REAL_BLENDING"));
assert.ok(summary.warnings.includes("CONTROL_ONLY"));

const protectedAfter = {
  baseline: statSync(rel("tests/sera-vnext/baselines/sera-vnext-baseline-v0.json")).mtimeMs,
  fixtureSet: statSync(rel("tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json")).mtimeMs,
  expectedOutputs: statSync(rel("tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json")).mtimeMs,
};
assert.deepEqual(protectedAfter, protectedBefore, "runtime module must not alter baseline artifacts");

for (const file of collectFiles(rel("frontend/src/lib/sera-vnext-runtime"))) {
  const source = readFileSync(file, "utf8");
  assert.equal(source.includes("frontend/src/lib/sera/"), false, `${file}: must not import legacy product engine`);
  assert.equal(source.includes("frontend/src/app/api/"), false, `${file}: must not import API/UI`);
  assert.equal(source.includes("writeFile"), false, `${file}: must not write files`);
  assert.equal(source.includes("appendFile"), false, `${file}: must not append files`);
}

const runtimeImportPattern =
  /(^import .*sera-vnext-runtime(?:\/|["'])| from ["'].*sera-vnext-runtime(?:\/|["']))/

const importSearchDirs = [
  path.join(rootDir, "frontend", "src"),
  path.join(rootDir, "tests", "sera-vnext"),
]

const importHits: string[] = []
for (const searchDir of importSearchDirs) {
  for (const file of collectFiles(searchDir)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue
    const lines = readFileSync(file, "utf8").split("\n")
    const relPath = path.relative(rootDir, file).split(path.sep).join("/")
    for (let i = 0; i < lines.length; i++) {
      if (runtimeImportPattern.test(lines[i])) {
        importHits.push(`${relPath}:${i + 1}:${lines[i]}`)
      }
    }
  }
}

for (const hit of importHits) {
  const a4r221IntegrationAuthorized = rel("tests/sera-vnext/runtime-service-a4r221max-trial-001.ts");
  const a4r221FailClosedAuthorized = rel("tests/sera-vnext/runtime-fail-closed-a4r221max-trial-001.ts");
  const a4r221EndpointPageAuthorized = rel("tests/sera-vnext/runtime-endpoint-page-a4r221max-trial-001.ts");
  const a4r222AuthFlagsAuthorized = rel("tests/sera-vnext/auth-feature-flags-a4r222max-trial-001.ts");
  const a4r222InternalPilotAuthorized = rel("tests/sera-vnext/internal-pilot-a4r222max-trial-001.ts");
  const a4r222IntegrityAuthorized = rel("tests/sera-vnext/runtime-integrity-a4r222max-trial-001.ts");
  const a4r222PerformanceAuthorized = rel("tests/sera-vnext/runtime-performance-a4r222max-trial-001.ts");
  const a4r223ControlledActivationAuthorized = rel("tests/sera-vnext/controlled-internal-activation-a4r223max-trial-001.ts");
  const a4r223AuthenticatedSmokeAuthorized = rel("tests/sera-vnext/authenticated-smoke-a4r223max-trial-001.ts");
  const a4r223RollbackAuthorized = rel("tests/sera-vnext/rollback-flags-a4r223max-trial-001.ts");
  const a4r223IntegrityHashAuthorized = rel("tests/sera-vnext/integrity-hash-a4r223max-trial-001.ts");
  const a4r224RealAdminAuthorized = rel("tests/sera-vnext/real-admin-session-a4r224max-trial-001.ts");
  const a4r224ManagedStagingAuthorized = rel("tests/sera-vnext/managed-staging-activation-a4r224max-trial-001.ts");
  const a4r224TenantIsolationAuthorized = rel("tests/sera-vnext/staging-tenant-isolation-a4r224max-trial-001.ts");
  const a4r224RollbackAuthorized = rel("tests/sera-vnext/staging-rollback-a4r224max-trial-001.ts");
  const a4r224IntegrityAuthorized = rel("tests/sera-vnext/staging-integrity-a4r224max-trial-001.ts");
  const a4r225CandidateAuthorized = rel("tests/sera-vnext/product-alpha-candidate-only-trial-001.ts");
  const a4r225SecurityAuthorized = rel("tests/sera-vnext/product-alpha-security-trial-001.ts");
  const a4r225IntegrityAuthorized = rel("tests/sera-vnext/product-alpha-integrity-trial-001.ts");
  const engineValidationHarnessAuthorized = rel("tests/sera-vnext/engine-validation/run-engine-validation.ts");
  const engineValidationV0ProductAlphaParityAuthorized = rel("tests/sera-vnext/engine-v0-product-alpha-parity-trial-001.ts");
  const productUnificationFeatureFlagsAuthorized = rel("tests/sera-vnext/product-unification/feature-flags-trial-001.ts");

  assert.ok(
    hit.startsWith("tests/sera-vnext/runtime-module-a4r220max-trial-001.ts:") ||
      hit.startsWith("tests/sera-vnext/runtime-service-a4r221max-trial-001.ts:") ||
      hit.startsWith("tests/sera-vnext/runtime-fail-closed-a4r221max-trial-001.ts:") ||
      hit.startsWith("tests/sera-vnext/runtime-endpoint-page-a4r221max-trial-001.ts:") ||
      (hit.startsWith("tests/sera-vnext/auth-feature-flags-a4r222max-trial-001.ts:") && existsSync(a4r222AuthFlagsAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/internal-pilot-a4r222max-trial-001.ts:") && existsSync(a4r222InternalPilotAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/runtime-integrity-a4r222max-trial-001.ts:") && existsSync(a4r222IntegrityAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/runtime-performance-a4r222max-trial-001.ts:") && existsSync(a4r222PerformanceAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/controlled-internal-activation-a4r223max-trial-001.ts:") && existsSync(a4r223ControlledActivationAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/authenticated-smoke-a4r223max-trial-001.ts:") && existsSync(a4r223AuthenticatedSmokeAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/rollback-flags-a4r223max-trial-001.ts:") && existsSync(a4r223RollbackAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/integrity-hash-a4r223max-trial-001.ts:") && existsSync(a4r223IntegrityHashAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/real-admin-session-a4r224max-trial-001.ts:") && existsSync(a4r224RealAdminAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/managed-staging-activation-a4r224max-trial-001.ts:") && existsSync(a4r224ManagedStagingAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/staging-tenant-isolation-a4r224max-trial-001.ts:") && existsSync(a4r224TenantIsolationAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/staging-rollback-a4r224max-trial-001.ts:") && existsSync(a4r224RollbackAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/staging-integrity-a4r224max-trial-001.ts:") && existsSync(a4r224IntegrityAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/product-alpha-candidate-only-trial-001.ts:") && existsSync(a4r225CandidateAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/product-alpha-security-trial-001.ts:") && existsSync(a4r225SecurityAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/product-alpha-integrity-trial-001.ts:") && existsSync(a4r225IntegrityAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/engine-validation/run-engine-validation.ts:") && existsSync(engineValidationHarnessAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/engine-validation-v0/product-alpha-parity.ts:") &&
        existsSync(engineValidationV0ProductAlphaParityAuthorized)) ||
      (hit.startsWith("tests/sera-vnext/product-unification/feature-flags-trial-001.ts:") &&
        hit.includes("/feature-flags") &&
        existsSync(productUnificationFeatureFlagsAuthorized)) ||
      (hit.startsWith("frontend/src/app/api/analyze/route.ts:") &&
        hit.includes("/feature-flags") &&
        isAllowedSeraVNextProtectedApiPath(rootDir, "frontend/src/app/api/analyze/route.ts")) ||
      (hit.startsWith("frontend/src/app/api/admin/sera-vnext/status/route.ts:") && existsSync(a4r221IntegrationAuthorized)) ||
      (hit.startsWith("frontend/src/app/api/admin/sera-vnext/candidate/route.ts:") && existsSync(a4r225CandidateAuthorized)) ||
      (hit.startsWith("frontend/src/app/(dashboard)/admin/sera-vnext/page.tsx:") && existsSync(a4r221IntegrationAuthorized)) ||
      hit.startsWith("frontend/src/lib/sera-vnext-runtime/"),
    `runtime module imported outside allowed scope: ${hit}`,
  );

  assert.ok(existsSync(a4r221FailClosedAuthorized), "A4R221 fail-closed authorization trial must exist");
  assert.ok(existsSync(a4r221EndpointPageAuthorized), "A4R221 endpoint/page authorization trial must exist");
  assert.ok(existsSync(a4r222AuthFlagsAuthorized), "A4R222 auth/flags authorization trial must exist");
  assert.ok(existsSync(a4r222InternalPilotAuthorized), "A4R222 internal pilot authorization trial must exist");
  assert.ok(existsSync(a4r222IntegrityAuthorized), "A4R222 integrity authorization trial must exist");
  assert.ok(existsSync(a4r222PerformanceAuthorized), "A4R222 performance authorization trial must exist");
  assert.ok(existsSync(a4r223ControlledActivationAuthorized), "A4R223 controlled activation authorization trial must exist");
  assert.ok(existsSync(a4r223AuthenticatedSmokeAuthorized), "A4R223 authenticated smoke authorization trial must exist");
  assert.ok(existsSync(a4r223RollbackAuthorized), "A4R223 rollback authorization trial must exist");
  assert.ok(existsSync(a4r223IntegrityHashAuthorized), "A4R223 integrity hash authorization trial must exist");
  assert.ok(existsSync(a4r224RealAdminAuthorized), "A4R224 real-admin authorization trial must exist");
  assert.ok(existsSync(a4r224ManagedStagingAuthorized), "A4R224 managed-staging authorization trial must exist");
  assert.ok(existsSync(a4r224TenantIsolationAuthorized), "A4R224 tenant-isolation authorization trial must exist");
  assert.ok(existsSync(a4r224RollbackAuthorized), "A4R224 rollback authorization trial must exist");
  assert.ok(existsSync(a4r224IntegrityAuthorized), "A4R224 integrity authorization trial must exist");
  assert.ok(existsSync(a4r225CandidateAuthorized), "A4R225 candidate authorization trial must exist");
  assert.ok(existsSync(a4r225SecurityAuthorized), "A4R225 security authorization trial must exist");
  assert.ok(existsSync(a4r225IntegrityAuthorized), "A4R225 integrity authorization trial must exist");
  assert.ok(existsSync(engineValidationHarnessAuthorized), "engine validation harness authorization trial must exist");
  assert.ok(
    existsSync(engineValidationV0ProductAlphaParityAuthorized),
    "engine validation v0 Product Alpha parity authorization trial must exist",
  );
}

const changed = execSync("git diff --name-only && git diff --cached --name-only", {
  cwd: rootDir,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
for (const file of changed) {
  if (file.startsWith("frontend/src/app/api/")) {
    assert.ok(
      file === "frontend/src/app/api/admin/sera-vnext/status/route.ts" ||
        file === "frontend/src/app/api/admin/sera-vnext/candidate/route.ts" ||
        isAllowedSeraVNextProtectedApiPath(rootDir, file),
      `unexpected API protected path changed: ${file}`,
    );
    if (file === "frontend/src/app/api/admin/sera-vnext/status/route.ts") {
      assert.ok(existsSync(rel("tests/sera-vnext/runtime-service-a4r221max-trial-001.ts")), "A4R221 runtime service trial must authorize status API change");
    }
    if (file === "frontend/src/app/api/admin/sera-vnext/candidate/route.ts") {
      assert.ok(existsSync(rel("tests/sera-vnext/product-alpha-candidate-only-trial-001.ts")), "A4R225 candidate trial must authorize candidate API change");
      assert.ok(existsSync(rel("tests/sera-vnext/product-alpha-security-trial-001.ts")), "A4R225 security trial must authorize candidate API change");
    }
    continue;
  }

  for (const prefix of ["frontend/src/lib/sera/", "supabase/migrations/", "tests/sera/fixtures/"]) {
    assert.equal(
      isAllowedA4R190LegacyMethodologyPath(rootDir, file) || !file.startsWith(prefix),
      true,
      `protected path changed: ${file}`,
    );
  }
}

console.log("A4R220 isolated runtime module trial passed.");
