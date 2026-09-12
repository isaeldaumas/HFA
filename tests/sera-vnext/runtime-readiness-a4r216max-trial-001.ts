import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

const rootDir = path.resolve(__dirname, "..", "..");

function rel(...parts: string[]) {
  return path.join(rootDir, ...parts);
}

function readRel(...parts: string[]) {
  return readFileSync(rel(...parts), "utf8");
}

function readJson<T = any>(...parts: string[]): T {
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
  "docs/sera-vnext/runtime-readiness-a4r216/typecheck/SERA_VNEXT_TYPECHECK_REPAIR_A4R216_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_RUNTIME_PRODUCT_BOUNDARY_AUDIT_A4R216_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_BASELINE_CONSUMPTION_CONTRACT_A4R216_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_RUNTIME_INTEGRATION_PREFLIGHT_PLAN_A4R216_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_IMPLEMENTATION_GATE_MATRIX_A4R216_MAX.csv",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_FUTURE_IMPLEMENTATION_BLUEPRINT_A4R216_MAX.md",
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_FINAL_READINESS_DECISION_A4R216_MAX.md",
];

for (const doc of docs) {
  assert.ok(existsSync(rel(doc)), `missing A4R216 artifact: ${doc}`);
}

const typecheckDoc = readRel(
  "docs/sera-vnext/runtime-readiness-a4r216/typecheck/SERA_VNEXT_TYPECHECK_REPAIR_A4R216_MAX.md",
);
assert.match(typecheckDoc, /TYPECHECK_ENVIRONMENT_REPAIRED_CODE_ERRORS_REMAIN/);
assert.match(typecheckDoc, /TYPECHECK_GATE_BLOCKED/);

const boundaryDoc = readRel(
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_RUNTIME_PRODUCT_BOUNDARY_AUDIT_A4R216_MAX.md",
);
assert.match(boundaryDoc, /RUNTIME_PRODUCT_BOUNDARY_AUDIT_COMPLETE_NOT_INTEGRATED/);
assert.match(boundaryDoc, /NOT_RUNTIME_INTEGRATED/);
assert.match(boundaryDoc, /NOT_PRODUCT_INTEGRATED/);

const contractDoc = readRel(
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_BASELINE_CONSUMPTION_CONTRACT_A4R216_MAX.md",
);
assert.match(contractDoc, /RUNTIME_CONSUMPTION_CONTRACT_DESIGN_ONLY/);
assert.match(contractDoc, /NOT_RUNTIME_INTEGRATED/);
assert.match(contractDoc, /NOT_PRODUCT_INTEGRATED/);

const blueprintDoc = readRel(
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_FUTURE_IMPLEMENTATION_BLUEPRINT_A4R216_MAX.md",
);
assert.match(blueprintDoc, /IMPLEMENTATION_BLUEPRINT_ONLY_NOT_EXECUTED/);

const finalDecisionDoc = readRel(
  "docs/sera-vnext/runtime-readiness-a4r216/SERA_VNEXT_FINAL_READINESS_DECISION_A4R216_MAX.md",
);
assert.match(finalDecisionDoc, /NOT_READY_TYPECHECK_BLOCKED/);

const baseline = readJson<Record<string, any>>(
  "tests/sera-vnext/baselines/sera-vnext-baseline-v0.json",
);
assert.equal(baseline.status, "VNEXT_BASELINE_V0_OFFICIAL");
assert.equal(baseline.namespace, "sera-vnext");
assert.equal(baseline.legacyBaseline, false);
assert.equal(baseline.productEligibleNow, false);
assert.equal(baseline.runtimeIntegrationAllowed, false);
assert.equal(baseline.downstreamAllowed, false);
assert.equal(baseline.fixtureCount, 7);
assert.equal(baseline.expectedOutputCount, 7);

const fixtureSet = readJson<Record<string, any>>(
  "tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json",
);
const fixtures = fixtureSet.fixtures as Array<Record<string, any>>;
assert.equal(fixtureSet.fixture_set_id, "SERA_VNEXT_FIXTURE_SET_V0");
assert.equal(fixtureSet.status, "VNEXT_FIXTURE_SET_OFFICIAL_NON_BASELINE");
assert.equal(fixtureSet.baselineStatus, "NOT_BASELINE");
assert.equal(fixtureSet.productStatus, "NOT_PRODUCT");
assert.equal(fixtureSet.runtimeIntegrationAllowed, false);
assert.equal(fixtures.length, 7);

const expectedOutputs = readJson<Record<string, any>>(
  "tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json",
);
const outputs = expectedOutputs.expectedOutputs as Array<Record<string, any>>;
assert.equal(expectedOutputs.expected_outputs_id, "SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS");
assert.equal(expectedOutputs.status, "EXPECTED_OUTPUTS_OFFICIAL_VNEXT_NON_BASELINE");
assert.equal(expectedOutputs.baselineStatus, "NOT_BASELINE");
assert.equal(expectedOutputs.productStatus, "NOT_PRODUCT");
assert.equal(expectedOutputs.runtimeIntegrationAllowed, false);
assert.equal(outputs.length, 7);

const fixtureTypeById = new Map(fixtures.map((fixture) => [fixture.fixtureId, fixture.fixtureType]));
assert.equal(fixtureTypeById.get("A4R214-FIX-SYN-GAP004-CONSEQUENCE-AS-CAUSE"), "synthetic_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-CTRL-DELTA-191"), "control_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-CTRL-USAIR-427"), "control_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-CTRL-5NBQJ"), "control_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-POS-ASIANA-214"), "positive_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-POS-UPS-1354"), "positive_fixture");
assert.equal(fixtureTypeById.get("A4R214-FIX-POS-COMAIR-5191"), "positive_fixture");

const gapOutput = outputs.find(
  (output) => output.fixtureId === "A4R214-FIX-SYN-GAP004-CONSEQUENCE-AS-CAUSE",
);
assert.ok(gapOutput, "missing GAP-004 expected output");
assert.equal(gapOutput.expectedOutputStatus, "OFFICIAL_VNEXT_EXPECTED_OUTPUT_NON_FINAL");
assert.ok(gapOutput.boundaryWarnings.includes("SYNTHETIC_ONLY"));
assert.ok(gapOutput.boundaryWarnings.includes("NOT_REAL_EVENT"));
assert.ok(gapOutput.boundaryWarnings.includes("NO_SYNTHETIC_REAL_BLENDING"));

for (const controlId of [
  "A4R214-FIX-CTRL-DELTA-191",
  "A4R214-FIX-CTRL-USAIR-427",
  "A4R214-FIX-CTRL-5NBQJ",
]) {
  const output = outputs.find((candidate) => candidate.fixtureId === controlId);
  assert.ok(output, `missing control output: ${controlId}`);
  assert.equal(output.expectedOutputStatus, "OFFICIAL_VNEXT_EXPECTED_OUTPUT_NON_FINAL");
  assert.ok(output.controlWarnings.includes("CONTROL_ONLY"));
  assert.ok(output.controlWarnings.includes("NOT_POSITIVE_FIXTURE"));
}

for (const positiveId of [
  "A4R214-FIX-POS-ASIANA-214",
  "A4R214-FIX-POS-UPS-1354",
  "A4R214-FIX-POS-COMAIR-5191",
]) {
  const output = outputs.find((candidate) => candidate.fixtureId === positiveId);
  assert.ok(output, `missing positive output: ${positiveId}`);
  assert.equal(output.expectedOutputStatus, "OFFICIAL_VNEXT_EXPECTED_OUTPUT_NON_FINAL");
}

const scannedPaths = [
  ...docs,
  "tests/sera-vnext/runtime-readiness-a4r216max-trial-001.ts",
  "tests/sera-vnext/baselines/SERA_VNEXT_BASELINE_V0_INDEX.md",
  "tests/sera-vnext/baselines/SERA_VNEXT_BASELINE_V0_CONTRACT.md",
  "tests/sera-vnext/baselines/sera-vnext-baseline-v0.json",
  "tests/sera-vnext/fixture-sets/SERA_VNEXT_FIXTURE_SET_V0_INDEX.md",
  "tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json",
  "tests/sera-vnext/baseline-candidates/SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS_INDEX.md",
  "tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json",
  ...collectFiles(rel("tests/sera-vnext/fixtures")).map((file) => path.relative(rootDir, file)),
];

const combined = scannedPaths.map((file) => readRel(file)).join("\n");

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
  assert.ok(!combined.includes(token), `forbidden external activation token found: ${token}`);
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

const protectedPrefixes = [
  "frontend/src/lib/sera/",
  "supabase/migrations/",
  "tests/sera/fixtures/",
  "tests/reports/baseline/",
];

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
      `unexpected API path changed in A4R216 trial: ${file}`,
    );
    continue;
  }
  assert.ok(
    isAllowedA4R190LegacyMethodologyPath(rootDir, file) || !protectedPrefixes.some((prefix) => file.startsWith(prefix)),
    `protected path changed in A4R216 trial: ${file}`,
  );
}

console.log("A4R216 runtime readiness trial passed.");
