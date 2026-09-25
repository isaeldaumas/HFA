import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isAllowedPrimarySeraMigrationPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

const rootDir = path.resolve(__dirname, "..", "..");

function rel(...parts: string[]) {
  return path.join(rootDir, ...parts);
}

function readRel(...parts: string[]) {
  return readFileSync(rel(...parts), "utf8");
}

function readJson<T = unknown>(...parts: string[]): T {
  return JSON.parse(readRel(...parts)) as T;
}

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out;
}

const docs = [
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_TYPESCRIPT_DIAGNOSTIC_CLOSURE_A4R217_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_TYPESCRIPT_DIAGNOSTIC_MATRIX_A4R217_MAX.csv",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_POST_TYPECHECK_BASELINE_REVALIDATION_A4R217_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_RUNTIME_INTEGRATION_GATE_REASSESSMENT_A4R217_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_NO_RUNTIME_PRODUCT_CHANGE_CONFIRMATION_A4R217_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R217_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_A4R217_MAX_LOG_v0.2.0.md",
];

for (const doc of docs) {
  assert.ok(existsSync(rel(doc)), `missing A4R217 artifact: ${doc}`);
}

assert.match(
  readRel("docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_TYPESCRIPT_DIAGNOSTIC_CLOSURE_A4R217_MAX.md"),
  /TYPECHECK_OK/,
);
assert.match(
  readRel("docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_RUNTIME_INTEGRATION_GATE_REASSESSMENT_A4R217_MAX.md"),
  /READY_FOR_SEPARATE_RUNTIME_INTEGRATION_AUTHORIZATION/,
);
assert.match(
  readRel("docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_NO_RUNTIME_PRODUCT_CHANGE_CONFIRMATION_A4R217_MAX.md"),
  /NO_RUNTIME_PRODUCT_CHANGE_CONFIRMED/,
);
assert.match(
  readRel("docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R217_MAX.md"),
  /A4R218-MAX/,
);

const matrixRows = readRel(
  "docs/sera-vnext/runtime-readiness-a4r217/typecheck-closure-runtime-gate/SERA_VNEXT_TYPESCRIPT_DIAGNOSTIC_MATRIX_A4R217_MAX.csv",
)
  .trim()
  .split("\n");
assert.equal(matrixRows.length - 1, 50, "diagnostic matrix must contain 50 data rows");

assert.ok(existsSync(rel("tmp/a4r217max-validation/01-typecheck-initial.log")), "initial typecheck log missing");
assert.ok(existsSync(rel("tmp/a4r217max-validation/03-typecheck-after-batch2.log")), "final typecheck log missing");

const baseline = readJson<Record<string, unknown>>("tests/sera-vnext/baselines/sera-vnext-baseline-v0.json");
assert.equal(baseline.status, "VNEXT_BASELINE_V0_OFFICIAL");
assert.equal(baseline.legacyBaseline, false);
assert.equal(baseline.productEligibleNow, false);
assert.equal(baseline.runtimeIntegrationAllowed, false);
assert.equal(baseline.downstreamAllowed, false);

assert.ok(existsSync(rel("tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json")));
assert.ok(existsSync(rel("tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json")));

const scanPaths = [
  ...docs,
  "tests/sera-vnext/typecheck-closure-runtime-gate-a4r217max-trial-001.ts",
  "tests/sera-vnext/baselines/sera-vnext-baseline-v0.json",
  "tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json",
  "tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json",
  ...collectFiles(rel("tests/sera-vnext/fixtures")).map((file) => path.relative(rootDir, file)),
];

const combined = scanPaths.map((file) => readRel(file)).join("\n");

for (const field of ["selectedCode", "releasedCode", "finalConclusion"]) {
  const assignments = combined.matchAll(new RegExp(`"${field}"\\s*:\\s*([^,}\\n]+)`, "g"));
  for (const assignment of assignments) {
    const value = assignment[1].trim();
    assert.ok(
      ["null", '"null"', '"absent"'].includes(value),
      `forbidden non-null ${field} value found: ${value}`,
    );
  }
}

for (const field of [
  "classifiedOutput",
  "readyPromotion",
  "legacyFixture",
  "legacyBaseline",
  "productEligibleNow",
  "runtimeIntegrationAllowed",
  "downstreamAllowed",
]) {
  assert.ok(
    !new RegExp(`"${field}"\\s*:\\s*true`).test(combined),
    `forbidden true value found for ${field}`,
  );
}

for (const token of ["H" + "FACS", "Risk" + "/ERC", "ARMS" + "/ERC", "recomm" + "endations"]) {
  assert.ok(!docs.map((file) => readRel(file)).join("\n").includes(token), `forbidden token in A4R217 docs: ${token}`);
}

for (const legacyName of [
  "asiana-214.json",
  "ups-1354.json",
  "comair-5191.json",
  "gap004-consequence-as-cause.json",
  "delta-191-control.json",
  "usair-427-control.json",
  "5nbqj-control.json",
]) {
  assert.ok(
    !existsSync(rel("tests/sera/fixtures", legacyName)),
    `vNext fixture copied into legacy fixture namespace: ${legacyName}`,
  );
}

const changed = execSync("git diff --name-only && git diff --cached --name-only", {
  cwd: rootDir,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);

for (const prefix of [
  "frontend/src/lib/sera/",
  "supabase/migrations/",
  "tests/sera/fixtures/",
  "tests/reports/baseline/",
]) {
  for (const file of changed) {
    assert.ok(!file.startsWith(prefix), `protected path changed in A4R217 trial: ${file}`);
  }
}

function isAllowedSeraVNextAdminApiPath(file: string): boolean {
  if (
    file === "frontend/src/app/api/admin/sera-vnext/candidate/route.ts" &&
    existsSync(rel("tests/sera-vnext/product-alpha-candidate-only-trial-001.ts")) &&
    existsSync(rel("tests/sera-vnext/engine-v0-product-alpha-parity-trial-001.ts"))
  ) {
    return true;
  }

  return (
    file === "frontend/src/app/api/admin/sera-vnext/status/route.ts" &&
    existsSync(rel("tests/sera-vnext/runtime-endpoint-page-a4r221max-trial-001.ts")) &&
    existsSync(rel("tests/sera-vnext/auth-feature-flags-a4r222max-trial-001.ts"))
  );
}

function isAllowedRiskProfileProductApiPath(file: string): boolean {
  if (
    !existsSync(rel("tests/sera-vnext/risk-profile-real-data-trial-001.ts")) ||
    !existsSync(rel("tests/sera-vnext/risk-profile-exclusion-trial-001.ts")) ||
    !existsSync(rel("tests/sera-vnext/risk-profile-api-trial-001.ts"))
  ) {
    return false;
  }

  return [
    "frontend/src/app/api/events/[eventId]/route.ts",
    "frontend/src/app/api/events/route.ts",
    "frontend/src/app/api/org/intelligence/route.ts",
    "frontend/src/app/api/risk-profile/route.ts",
  ].includes(file);
}

for (const file of changed) {
  if (file.startsWith("frontend/src/app/api/")) {
    assert.ok(
      isAllowedSeraVNextAdminApiPath(file) ||
        isAllowedRiskProfileProductApiPath(file) ||
        isAllowedSeraVNextProtectedApiPath(rootDir, file),
      `unexpected API path changed in A4R217 trial: ${file}`,
    );
  }
}

console.log("A4R217 typecheck closure runtime gate trial passed.");
