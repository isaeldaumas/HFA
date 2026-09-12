import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

type Candidate = {
  id: string;
  status: string;
  officialFixture: boolean;
  baselineEligibleNow: boolean;
  productEligibleNow: boolean;
  readyPromotion: boolean;
  selectedCode: null;
  releasedCode: null;
  finalConclusion: null;
  classifiedOutput: boolean;
  downstreamAllowed: boolean;
  expectedBehaviorStatus: string;
};

type Fixture = {
  id: string;
  phase: string;
  status: string;
  fixtureNamespace: string;
  legacyFixture: boolean;
  baselineEligibleNow: boolean;
  baselineCandidateEligible: boolean;
  productEligibleNow: boolean;
  runtimeIntegrationAllowed: boolean;
  selectedCode: null;
  releasedCode: null;
  finalConclusion: null;
  classifiedOutput: boolean;
  readyPromotion: boolean;
  downstreamAllowed: boolean;
  componentType: "positive_fixture" | "synthetic_fixture" | "control_fixture";
  sourceType: "real_event" | "synthetic" | "control";
  sourceCandidateId: string;
  expectedOutputStatus: string;
  boundaryWarnings: string[];
  controlWarnings: string[];
  limitations: string[];
};

type FixtureSet = {
  fixture_set_id: string;
  phase: string;
  status: string;
  baselineStatus: string;
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
  phase: string;
  status: string;
  baselineStatus: string;
  productStatus: string;
  runtimeIntegrationAllowed: boolean;
  expectedOutputs: Array<{
    fixtureId: string;
    expectedOutputStatus: string;
    expectedMethodologicalBehavior: string[];
    forbiddenBehavior: string[];
    boundaryWarnings: string[];
    controlWarnings: string[];
    limitations: string[];
    nonFinalConfirmations: string[];
  }>;
};

type BaselineCandidate = {
  baseline_candidate_id: string;
  phase: string;
  status: string;
  officialBaseline: boolean;
  baselinePromotionAllowedNow: boolean;
  baselineStatus: string;
  productEligibleNow: boolean;
  runtimeIntegrationAllowed: boolean;
  requiresHumanAuthorizationForBaseline: boolean;
  fixtureSetId: string;
  expectedOutputsId: string;
};

const root = path.resolve(__dirname, "..", "..");
const fixtureDir = path.join(root, "tests/sera-vnext/fixtures");
const fixtureSetPath = path.join(root, "tests/sera-vnext/fixture-sets/sera-vnext-fixture-set-v0.json");
const expectedOutputsPath = path.join(
  root,
  "tests/sera-vnext/baseline-candidates/sera-vnext-fixture-set-v0-expected-outputs.json",
);
const baselineCandidatePath = path.join(
  root,
  "tests/sera-vnext/baseline-candidates/sera-vnext-baseline-candidate-v0.json",
);
const candidateFiles = [
  path.join(root, "tests/sera-vnext/fixture-candidates/positive/comair-5191.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/positive/asiana-214.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/positive/ups-1354.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/synthetic/gap004-consequence-as-cause.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/controls/delta-191-control.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/controls/usair-427-control.fixture-candidate.json"),
  path.join(root, "tests/sera-vnext/fixture-candidates/controls/5nbqj-control.fixture-candidate.json"),
];

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

for (const candidatePath of candidateFiles) {
  const candidate = readJson<Candidate>(candidatePath);
  assert.equal(candidate.status, "FIXTURE_CANDIDATE_ONLY");
  assert.equal(candidate.officialFixture, false);
  assert.equal(candidate.baselineEligibleNow, false);
  assert.equal(candidate.productEligibleNow, false);
  assert.equal(candidate.readyPromotion, false);
  assert.equal(candidate.selectedCode, null);
  assert.equal(candidate.releasedCode, null);
  assert.equal(candidate.finalConclusion, null);
  assert.equal(candidate.classifiedOutput, false);
  assert.equal(candidate.downstreamAllowed, false);
  assert.equal(candidate.expectedBehaviorStatus, "EXPECTED_BEHAVIOR_NON_FINAL");
}

const fixtureFiles = collectFiles(fixtureDir, ".json").sort();
assert.equal(fixtureFiles.length, 7, "exactly seven official vNext fixtures must exist");
assert.deepEqual(
  fixtureFiles.map((file) => path.relative(root, file)).sort(),
  [
    "tests/sera-vnext/fixtures/controls/5nbqj-control.vnext-fixture.json",
    "tests/sera-vnext/fixtures/controls/delta-191-control.vnext-fixture.json",
    "tests/sera-vnext/fixtures/controls/usair-427-control.vnext-fixture.json",
    "tests/sera-vnext/fixtures/positive/asiana-214.vnext-fixture.json",
    "tests/sera-vnext/fixtures/positive/comair-5191.vnext-fixture.json",
    "tests/sera-vnext/fixtures/positive/ups-1354.vnext-fixture.json",
    "tests/sera-vnext/fixtures/synthetic/gap004-consequence-as-cause.vnext-fixture.json",
  ],
);

const fixtures = fixtureFiles.map((file) => readJson<Fixture>(file));
for (const fixture of fixtures) {
  assert.equal(fixture.phase, "A4R214-MAX");
  assert.equal(fixture.status, "VNEXT_OFFICIAL_FIXTURE");
  assert.equal(fixture.fixtureNamespace, "sera-vnext");
  assert.equal(fixture.legacyFixture, false);
  assert.equal(fixture.baselineEligibleNow, false);
  assert.equal(fixture.baselineCandidateEligible, true);
  assert.equal(fixture.productEligibleNow, false);
  assert.equal(fixture.runtimeIntegrationAllowed, false);
  assert.equal(fixture.selectedCode, null);
  assert.equal(fixture.releasedCode, null);
  assert.equal(fixture.finalConclusion, null);
  assert.equal(fixture.classifiedOutput, false);
  assert.equal(fixture.readyPromotion, false);
  assert.equal(fixture.downstreamAllowed, false);
  assert.equal(fixture.expectedOutputStatus, "OFFICIAL_VNEXT_EXPECTED_OUTPUT_NON_FINAL");
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
  assert.ok(!existsSync(path.join(officialLegacyDir, legacyName)), `must not create legacy fixture: ${legacyName}`);
}

const fixtureSet = readJson<FixtureSet>(fixtureSetPath);
assert.equal(fixtureSet.fixture_set_id, "SERA_VNEXT_FIXTURE_SET_V0");
assert.equal(fixtureSet.phase, "A4R214-MAX");
assert.equal(fixtureSet.status, "VNEXT_FIXTURE_SET_OFFICIAL_NON_BASELINE");
assert.equal(fixtureSet.baselineStatus, "NOT_BASELINE");
assert.equal(fixtureSet.productStatus, "NOT_PRODUCT");
assert.equal(fixtureSet.runtimeIntegrationAllowed, false);
assert.equal(fixtureSet.fixtures.length, 7);

const expectedOutputs = readJson<ExpectedOutputs>(expectedOutputsPath);
assert.equal(expectedOutputs.expected_outputs_id, "SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS");
assert.equal(expectedOutputs.phase, "A4R214-MAX");
assert.equal(expectedOutputs.status, "EXPECTED_OUTPUTS_OFFICIAL_VNEXT_NON_BASELINE");
assert.equal(expectedOutputs.baselineStatus, "NOT_BASELINE");
assert.equal(expectedOutputs.productStatus, "NOT_PRODUCT");
assert.equal(expectedOutputs.runtimeIntegrationAllowed, false);
assert.equal(expectedOutputs.expectedOutputs.length, 7);

for (const record of expectedOutputs.expectedOutputs) {
  assert.equal(record.expectedOutputStatus, "OFFICIAL_VNEXT_EXPECTED_OUTPUT_NON_FINAL");
  assert.ok(record.nonFinalConfirmations.includes("selectedCode remains null"));
  assert.ok(record.nonFinalConfirmations.includes("releasedCode remains null"));
  assert.ok(record.nonFinalConfirmations.includes("finalConclusion remains null"));
  assert.ok(record.nonFinalConfirmations.includes("classifiedOutput remains false"));
}

const asianaExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-POS-ASIANA-214",
);
assert.ok(asianaExpected);
assert.ok(asianaExpected.boundaryWarnings.includes("BOUNDARY_WARNING_REQUIRED"));
assert.match(asianaExpected.expectedMethodologicalBehavior.join("\n"), /automation\/500 ft/i);

const upsExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-POS-UPS-1354",
);
assert.ok(upsExpected);
assert.ok(upsExpected.boundaryWarnings.includes("BOUNDARY_WARNING_REQUIRED"));
assert.match(upsExpected.expectedMethodologicalBehavior.join("\n"), /setup\/FMC\/V-S\/MDA/i);

const gapExpected = expectedOutputs.expectedOutputs.find(
  (record) => record.fixtureId === "A4R214-FIX-SYN-GAP004-CONSEQUENCE-AS-CAUSE",
);
assert.ok(gapExpected);
assert.ok(gapExpected.boundaryWarnings.includes("SYNTHETIC_ONLY"));
assert.match(gapExpected.expectedMethodologicalBehavior.join("\n"), /synthetic only/i);

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

const baselineCandidate = readJson<BaselineCandidate>(baselineCandidatePath);
assert.equal(baselineCandidate.baseline_candidate_id, "SERA_VNEXT_BASELINE_CANDIDATE_V0");
assert.equal(baselineCandidate.phase, "A4R214-MAX");
assert.equal(baselineCandidate.status, "BASELINE_CANDIDATE_DRY_RUN_ONLY");
assert.equal(baselineCandidate.officialBaseline, false);
assert.equal(baselineCandidate.baselinePromotionAllowedNow, false);
assert.equal(baselineCandidate.productEligibleNow, false);
assert.equal(baselineCandidate.runtimeIntegrationAllowed, false);
assert.equal(baselineCandidate.requiresHumanAuthorizationForBaseline, true);

const combined = [
  read(__filename),
  ...fixtureFiles.map(read),
  read(fixtureSetPath),
  read(expectedOutputsPath),
  read(baselineCandidatePath),
  read(path.join(root, "tests/sera-vnext/fixtures/VNEXT_FIXTURE_INDEX_A4R214_MAX.md")),
  read(path.join(root, "tests/sera-vnext/fixtures/VNEXT_FIXTURE_CONTRACT_A4R214_MAX.md")),
  read(path.join(root, "tests/sera-vnext/fixture-sets/SERA_VNEXT_FIXTURE_SET_V0_INDEX.md")),
  read(path.join(root, "tests/sera-vnext/baseline-candidates/SERA_VNEXT_FIXTURE_SET_V0_EXPECTED_OUTPUTS_INDEX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_OFFICIAL_FIXTURE_PROMOTION_A4R214_MAX_v0.2.0.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_BASELINE_READINESS_DRY_RUN_A4R214_MAX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_RUNTIME_PRODUCT_BOUNDARY_A4R214_MAX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_TYPECHECK_ENVIRONMENT_STATUS_A4R214_MAX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_ROLLBACK_PLAN_A4R214_MAX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R214_MAX.md")),
  read(path.join(root, "docs/sera-vnext/benchmark-a4r214/official-fixture-promotion-max/SERA_A4R214_MAX_LOG_v0.2.0.md")),
].join("\n");

const forbiddenPatterns = [
  /"selectedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"releasedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"finalConclusion"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"classifiedOutput"[ \t]*:[ \t]*true\b/,
  /"readyPromotion"[ \t]*:[ \t]*true\b/,
  /"legacyFixture"[ \t]*:[ \t]*true\b/,
  /"officialBaseline"[ \t]*:[ \t]*true\b/,
  /"baselinePromotionAllowedNow"[ \t]*:[ \t]*true\b/,
  /"productEligibleNow"[ \t]*:[ \t]*true\b/,
  /"runtimeIntegrationAllowed"[ \t]*:[ \t]*true\b/,
];

for (const pattern of forbiddenPatterns) {
  assert.ok(!pattern.test(combined), `forbidden pattern matched: ${pattern}`);
}

for (const token of [
  "Dau" + "mas as factual source",
  "Dau" + "mas automatic reentry",
  "synthetic-real blending: " + "YES",
  "invented-question " + "pattern",
  "HF" + "ACS",
  "Ri" + "sk/ERC",
  "AR" + "MS/ERC",
  "recomm" + "endations",
]) {
  assert.ok(!combined.includes(token), `forbidden token present: ${token}`);
}

for (const requiredLock of [
  "baseline created: NO",
  "engine/runtime changed: NO",
  "API/UI changed: NO",
  "selectedCode active output: BLOCKED",
  "releasedCode active output: BLOCKED",
  "finalConclusion active output: BLOCKED",
  "CLASSIFIED active output: BLOCKED",
  "downstream release behavior: BLOCKED",
]) {
  assert.ok(combined.includes(requiredLock), `missing lock: ${requiredLock}`);
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
  assert.ok(!changedPath.startsWith("tests/sera/fixtures/"), `legacy fixture path changed: ${changedPath}`);
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
}

console.log("A4R214 official vNext fixture set trial passed.");
