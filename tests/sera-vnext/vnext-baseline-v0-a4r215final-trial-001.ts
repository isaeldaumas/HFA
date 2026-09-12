import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

type Fixture = {
  id: string;
  status: string;
  fixtureNamespace: string;
  legacyFixture: boolean;
  productEligibleNow: boolean;
  runtimeIntegrationAllowed: boolean;
  selectedCode: null;
  releasedCode: null;
  finalConclusion: null;
  classifiedOutput: boolean;
  readyPromotion: boolean;
  downstreamAllowed: boolean;
  boundaryWarnings: string[];
  controlWarnings: string[];
};

type FixtureSet = {
  fixture_set_id: string;
  status: string;
  productStatus: string;
  runtimeIntegrationAllowed: boolean;
  fixtures: Array<{
    fixtureId: string;
    fixtureType: string;
    path: string;
  }>;
};

type ExpectedOutputs = {
  expected_outputs_id: string;
  status: string;
  expectedOutputs: Array<{
    fixtureId: string;
    expectedOutputStatus: string;
    boundaryWarnings: string[];
    controlWarnings: string[];
    expectedMethodologicalBehavior: string[];
  }>;
};

type Baseline = {
  baseline_id: string;
  phase: string;
  status: string;
  namespace: string;
  legacyBaseline: boolean;
  productEligibleNow: boolean;
  runtimeIntegrationAllowed: boolean;
  downstreamAllowed: boolean;
  sourceFixtureSet: string;
  sourceExpectedOutputs: string;
  baselineScope: string;
  fixtureCount: number;
  expectedOutputCount: number;
  positiveFixtures: string[];
  syntheticFixtures: string[];
  controlFixtures: string[];
};

const root = path.resolve(__dirname, "..", "..");
const fixtureDir = path.join(root, "tests/sera-vnext/fixtures");
const fixtureSetPath = path.join(root, "tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json");
const expectedOutputsPath = path.join(
  root,
  "tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json",
);
const baselinePath = path.join(root, "tests/sera-vnext/baselines/sera-vnext-baseline-v0.json");
const supersededPath = path.join(
  root,
  "tests/sera-vnext/baseline-candidates/SERA_VNEXT_BASELINE_CANDIDATE_V0_SUPERSEDED_BY_BASELINE_V0.md",
);

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(read(filePath)) as T;
}

function collectFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath, suffix);
    return entry.name.endsWith(suffix) ? [entryPath] : [];
  });
}

const fixtureFiles = collectFiles(fixtureDir, ".json").sort();
assert.equal(fixtureFiles.length, 7, "exactly seven vNext fixtures must exist");

for (const fixtureFile of fixtureFiles) {
  const fixture = readJson<Fixture>(fixtureFile);
  assert.equal(fixture.status, "VNEXT_OFFICIAL_FIXTURE");
  assert.equal(fixture.fixtureNamespace, "sera-vnext");
  assert.equal(fixture.legacyFixture, false);
  assert.equal(fixture.productEligibleNow, false);
  assert.equal(fixture.runtimeIntegrationAllowed, false);
  assert.equal(fixture.selectedCode, null);
  assert.equal(fixture.releasedCode, null);
  assert.equal(fixture.finalConclusion, null);
  assert.equal(fixture.classifiedOutput, false);
  assert.equal(fixture.readyPromotion, false);
  assert.equal(fixture.downstreamAllowed, false);
}

const officialLegacyDir = path.join(root, "tests/sera/fixtures");
for (const legacyName of [
  "comair-5191.vnext-fixture.json",
  "asiana-214.vnext-fixture.json",
  "ups-1354.vnext-fixture.json",
  "gap004-consequence-as-cause.vnext-fixture.json",
  "delta-191-control.vnext-fixture.json",
  "usair-427-control.vnext-fixture.json",
  "5nbqj-control.vnext-fixture.json",
]) {
  assert.ok(!existsSync(path.join(officialLegacyDir, legacyName)), `legacy fixture must not exist: ${legacyName}`);
}

const fixtureSet = readJson<FixtureSet>(fixtureSetPath);
assert.equal(fixtureSet.fixture_set_id, "SERA_VNEXT_FIXTURE_SET_V0");
assert.ok(
  fixtureSet.status === "VNEXT_FIXTURE_SET_OFFICIAL_NON_BASELINE" ||
    fixtureSet.status === "VNEXT_FIXTURE_SET_OFFICIAL",
);
assert.equal(fixtureSet.runtimeIntegrationAllowed, false);
assert.equal(fixtureSet.productStatus, "NOT_PRODUCT");
assert.equal(fixtureSet.fixtures.length, 7);

const expectedOutputs = readJson<ExpectedOutputs>(expectedOutputsPath);
assert.equal(expectedOutputs.expected_outputs_id, "SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS");
assert.ok(
  expectedOutputs.status === "EXPECTED_OUTPUTS_OFFICIAL_VNEXT_NON_BASELINE" ||
    expectedOutputs.status === "OFFICIAL_VNEXT_EXPECTED_OUTPUTS",
);
assert.equal(expectedOutputs.expectedOutputs.length, 7);

const asianaExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-POS-ASIANA-214",
);
assert.ok(asianaExpected);
assert.ok(asianaExpected.boundaryWarnings.includes("BOUNDARY_WARNING_REQUIRED"));

const upsExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-POS-UPS-1354",
);
assert.ok(upsExpected);
assert.ok(upsExpected.boundaryWarnings.includes("BOUNDARY_WARNING_REQUIRED"));

const gapExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-SYN-GAP004-CONSEQUENCE-AS-CAUSE",
);
assert.ok(gapExpected);
assert.ok(gapExpected.boundaryWarnings.includes("SYNTHETIC_ONLY"));
assert.match(gapExpected.expectedMethodologicalBehavior.join("\n"), /no real-event blending/i);

for (const fixtureId of [
  "A4R214-FIX-CTRL-DELTA-191",
  "A4R214-FIX-CTRL-USAIR-427",
  "A4R214-FIX-CTRL-5NBQJ",
]) {
  const record = expectedOutputs.expectedOutputs.find((item) => item.fixtureId === fixtureId);
  assert.ok(record);
  assert.ok(record.controlWarnings.includes("CONTROL_ONLY"));
  assert.ok(record.controlWarnings.includes("NOT_POSITIVE_FIXTURE"));
}

const baseline = readJson<Baseline>(baselinePath);
assert.equal(baseline.baseline_id, "SERA_VNEXT_BASELINE_V0");
assert.equal(baseline.phase, "A4R215-FINAL");
assert.equal(baseline.status, "VNEXT_BASELINE_V0_OFFICIAL");
assert.equal(baseline.namespace, "sera-vnext");
assert.equal(baseline.legacyBaseline, false);
assert.equal(baseline.productEligibleNow, false);
assert.equal(baseline.runtimeIntegrationAllowed, false);
assert.equal(baseline.downstreamAllowed, false);
assert.equal(baseline.sourceFixtureSet, "SERA_VNEXT_FIXTURE_SET_V0");
assert.equal(baseline.sourceExpectedOutputs, "SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS");
assert.equal(baseline.baselineScope, "method_validation_only");
assert.equal(baseline.fixtureCount, 7);
assert.equal(baseline.expectedOutputCount, 7);
assert.equal(baseline.positiveFixtures.length, 3);
assert.equal(baseline.syntheticFixtures.length, 1);
assert.equal(baseline.controlFixtures.length, 3);

assert.ok(existsSync(supersededPath), "supersession note must exist");

const combined = [
  read(__filename),
  ...fixtureFiles.map(read),
  read(fixtureSetPath),
  read(expectedOutputsPath),
  read(baselinePath),
  read(supersededPath),
  read(path.join(root, "tests/sera-vnext/baselines/SERA_VNEXT_BASELINE_V0_INDEX.md")),
  read(path.join(root, "tests/sera-vnext/baselines/SERA_VNEXT_BASELINE_V0_CONTRACT.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_FINAL_BASELINE_FREEZE_A4R215_FINAL_v0.2.0.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_RUNTIME_PRODUCT_BOUNDARY_A4R215_FINAL.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_TYPECHECK_ENVIRONMENT_STATUS_A4R215_FINAL.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_ROLLBACK_PLAN_A4R215_FINAL.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_FINAL_METHODOLOGY_FREEZE_STATE_A4R215_FINAL.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R215_FINAL.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r215/final-baseline-freeze/SERA_A4R215_FINAL_LOG_v0.2.0.md")),
].join("\n");

for (const requiredLock of [
  "baseline legacy changed: NO",
  "engine/runtime changed: NO",
  "API/UI changed: NO",
  "selectedCode active output: BLOCKED",
  "releasedCode active output: BLOCKED",
  "finalConclusion active output: BLOCKED",
  "CLASSIFIED active output: BLOCKED",
  "downstream release behavior: BLOCKED",
  "runtime/product integration created: NO",
]) {
  assert.ok(combined.includes(requiredLock), `missing lock: ${requiredLock}`);
}

const forbiddenPatterns = [
  /"selectedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"releasedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"finalConclusion"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"classifiedOutput"[ \t]*:[ \t]*true\b/,
  /"readyPromotion"[ \t]*:[ \t]*true\b/,
  /"legacyFixture"[ \t]*:[ \t]*true\b/,
  /"legacyBaseline"[ \t]*:[ \t]*true\b/,
  /"productEligibleNow"[ \t]*:[ \t]*true\b/,
  /"runtimeIntegrationAllowed"[ \t]*:[ \t]*true\b/,
  /"downstreamAllowed"[ \t]*:[ \t]*true\b/,
];

for (const pattern of forbiddenPatterns) {
  assert.ok(!pattern.test(combined), `forbidden pattern matched: ${pattern}`);
}

for (const token of [
  "Dau" + "mas as factual source",
  "HF" + "ACS",
  "Ri" + "sk/ERC",
  "AR" + "MS/ERC",
  "recomm" + "endations",
]) {
  assert.ok(!combined.includes(token), `forbidden token present: ${token}`);
}

const changedTracked = execSync("git diff --name-only && git diff --cached --name-only", {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

function isAllowedSeraVNextAdminApiPath(changedPath: string): boolean {
  if (
    changedPath === "frontend/src/app/api/admin/sera-vnext/candidate/route.ts" &&
    existsSync(path.join(root, "tests/sera-vnext/product-alpha-candidate-only-trial-001.ts")) &&
    existsSync(path.join(root, "tests/sera-vnext/engine-v0-product-alpha-parity-trial-001.ts"))
  ) {
    return true;
  }

  return (
    changedPath === "frontend/src/app/api/admin/sera-vnext/status/route.ts" &&
    existsSync(path.join(root, "tests/sera-vnext/runtime-endpoint-page-a4r221max-trial-001.ts")) &&
    existsSync(path.join(root, "tests/sera-vnext/auth-feature-flags-a4r222max-trial-001.ts"))
  );
}

function isAllowedRiskProfileProductApiPath(changedPath: string): boolean {
  if (
    !existsSync(path.join(root, "tests/sera-vnext/risk-profile-real-data-trial-001.ts")) ||
    !existsSync(path.join(root, "tests/sera-vnext/risk-profile-exclusion-trial-001.ts")) ||
    !existsSync(path.join(root, "tests/sera-vnext/risk-profile-api-trial-001.ts"))
  ) {
    return false;
  }

  return [
    "frontend/src/app/api/events/[eventId]/route.ts",
    "frontend/src/app/api/events/route.ts",
    "frontend/src/app/api/org/intelligence/route.ts",
    "frontend/src/app/api/risk-profile/route.ts",
  ].includes(changedPath);
}

for (const changedPath of changedTracked) {
  assert.ok(isAllowedA4R190LegacyMethodologyPath(root, changedPath) || !changedPath.startsWith("frontend/src/lib/sera/"), `engine path changed: ${changedPath}`);
  if (changedPath.startsWith("frontend/src/app/api/")) {
    assert.ok(
      isAllowedSeraVNextAdminApiPath(changedPath) ||
        isAllowedRiskProfileProductApiPath(changedPath) ||
        isAllowedSeraVNextProtectedApiPath(root, changedPath),
      `unexpected API path changed: ${changedPath}`,
    );
  }
  assert.ok(!changedPath.startsWith("supabase/migrations/"), `migration path changed: ${changedPath}`);
  assert.ok(!changedPath.startsWith("tests/sera/fixtures/"), `legacy fixture path changed: ${changedPath}`);
}

console.log("A4R215 vNext baseline trial passed.");
