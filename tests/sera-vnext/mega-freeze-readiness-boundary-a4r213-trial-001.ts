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
  componentType: "positive_candidate" | "synthetic_candidate" | "control_candidate";
  expectedBehaviorStatus: string;
  requiredLocks: string[];
  boundaryWarnings: string[];
  controlWarnings: string[];
};

const root = path.resolve(__dirname, "..", "..");
const docsDir = path.join(
  root,
  "docs/sera-vnext/benchmark-a4r213/mega-freeze-readiness-boundary",
);
const candidateDir = path.join(root, "tests/sera-vnext/fixture-candidates");

const docs = {
  report: path.join(docsDir, "SERA_VNEXT_MEGA_FREEZE_READINESS_BOUNDARY_A4R213_v0.2.0.md"),
  review: path.join(docsDir, "SERA_VNEXT_FIXTURE_CANDIDATE_REVIEW_MATRIX_A4R213.csv"),
  promotion: path.join(docsDir, "SERA_VNEXT_OFFICIAL_FIXTURE_PROMOTION_READINESS_A4R213.csv"),
  baseline: path.join(docsDir, "SERA_VNEXT_BASELINE_READINESS_ASSESSMENT_A4R213.md"),
  runtime: path.join(docsDir, "SERA_VNEXT_RUNTIME_PRODUCT_BOUNDARY_ASSESSMENT_A4R213.md"),
  rules: path.join(docsDir, "SERA_VNEXT_POST_FREEZE_RULES_A4R213.md"),
  template: path.join(docsDir, "SERA_VNEXT_FUTURE_PROMOTION_REQUEST_TEMPLATE_A4R213.md"),
  next: path.join(docsDir, "SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R213.md"),
  log: path.join(docsDir, "SERA_A4R213_MEGA_LOG_v0.2.0.md"),
};

const candidateFiles = {
  comair: path.join(candidateDir, "positive/comair-5191.fixture-candidate.json"),
  asiana: path.join(candidateDir, "positive/asiana-214.fixture-candidate.json"),
  ups: path.join(candidateDir, "positive/ups-1354.fixture-candidate.json"),
  gap004: path.join(candidateDir, "synthetic/gap004-consequence-as-cause.fixture-candidate.json"),
  delta: path.join(candidateDir, "controls/delta-191-control.fixture-candidate.json"),
  usair: path.join(candidateDir, "controls/usair-427-control.fixture-candidate.json"),
  n5bqj: path.join(candidateDir, "controls/5nbqj-control.fixture-candidate.json"),
};

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function readJson(filePath: string): Candidate {
  return JSON.parse(read(filePath)) as Candidate;
}

function collectJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(entryPath);
    return entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

for (const file of Object.values(docs)) {
  assert.ok(existsSync(file), `A4R213-MEGA file missing: ${file}`);
}

const jsonFiles = collectJsonFiles(candidateDir).sort();
assert.deepEqual(
  jsonFiles,
  Object.values(candidateFiles).sort(),
  "exactly seven JSON fixture candidates must exist",
);

for (const file of jsonFiles) {
  assert.ok(
    file.startsWith(candidateDir + path.sep),
    `candidate outside isolated directory: ${file}`,
  );
}

const officialFixtureDir = path.join(root, "tests/sera/fixtures");
for (const file of Object.values(candidateFiles)) {
  assert.ok(!existsSync(path.join(officialFixtureDir, path.basename(file))));
}

const candidates = Object.fromEntries(
  Object.entries(candidateFiles).map(([key, file]) => [key, readJson(file)]),
) as Record<keyof typeof candidateFiles, Candidate>;

for (const [key, candidate] of Object.entries(candidates)) {
  assert.equal(candidate.status, "FIXTURE_CANDIDATE_ONLY", `${key} status mismatch`);
  assert.equal(candidate.officialFixture, false, `${key} officialFixture mismatch`);
  assert.equal(candidate.baselineEligibleNow, false, `${key} baselineEligibleNow mismatch`);
  assert.equal(candidate.productEligibleNow, false, `${key} productEligibleNow mismatch`);
  assert.equal(candidate.readyPromotion, false, `${key} readyPromotion mismatch`);
  assert.equal(candidate.selectedCode, null, `${key} selectedCode mismatch`);
  assert.equal(candidate.releasedCode, null, `${key} releasedCode mismatch`);
  assert.equal(candidate.finalConclusion, null, `${key} finalConclusion mismatch`);
  assert.equal(candidate.classifiedOutput, false, `${key} classifiedOutput mismatch`);
  assert.equal(candidate.downstreamAllowed, false, `${key} downstreamAllowed mismatch`);
  assert.equal(candidate.expectedBehaviorStatus, "EXPECTED_BEHAVIOR_NON_FINAL");
}

for (const key of ["asiana", "ups"] as const) {
  assert.ok(candidates[key].requiredLocks.includes("BOUNDARY_WARNING_REQUIRED"));
}

assert.ok(candidates.gap004.requiredLocks.includes("SYNTHETIC_ONLY"));
assert.ok(candidates.gap004.requiredLocks.includes("NOT_REAL_EVENT"));

for (const key of ["delta", "usair", "n5bqj"] as const) {
  assert.ok(candidates[key].requiredLocks.includes("CONTROL_ONLY"));
  assert.ok(candidates[key].requiredLocks.includes("NOT_POSITIVE_FIXTURE"));
}

const report = read(docs.report);
const promotion = read(docs.promotion);
const baseline = read(docs.baseline);
const runtime = read(docs.runtime);
const rules = read(docs.rules);
const template = read(docs.template);
const next = read(docs.next);
const combined = [
  ...Object.values(docs).map(read),
  ...Object.values(candidateFiles).map(read),
  read(__filename),
].join("\n");

assert.ok(report.includes("FIXTURE_CANDIDATE_SET_FROZEN_NON_OFFICIAL"));
assert.ok(report.includes("MEGA_FREEZE_COMPLETE_STOP_BEFORE_OFFICIAL_FIXTURE"));
assert.ok(combined.includes("OFFICIAL_FIXTURE_PROMOTION_NOT_EXECUTED"));
assert.ok(combined.includes("OFFICIAL_FIXTURE_PROMOTION_REQUIRES_SEPARATE_HUMAN_AUTHORIZATION"));
assert.ok(promotion.includes("PROMOTION_READINESS_FUTURE_ONLY"));
assert.ok(promotion.includes("CONTROL_PROMOTION_READINESS_FUTURE_ONLY"));
assert.ok(baseline.includes("BASELINE_NOT_AUTHORIZED"));
assert.ok(baseline.includes("BASELINE_REQUIRES_OFFICIAL_FIXTURE_FIRST"));
assert.ok(runtime.includes("RUNTIME_PRODUCT_BOUNDARY_DOCUMENTED_ONLY"));
assert.ok(rules.includes("do not move candidates to `tests/sera/fixtures/`"));
assert.ok(template.includes("explicit human authorization:"));
assert.ok(next.includes("STOP_AND_HOLD_BEFORE_OFFICIAL_FIXTURE_PROMOTION"));

for (const requiredLock of [
  "baseline created: NO",
  "P/O/A final classification created: NO",
  "final escape point approved: NO",
  "READY automatic promotion: NO",
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
  assert.ok(!changedPath.startsWith("tests/sera/fixtures/"), `official fixture path changed: ${changedPath}`);
  assert.ok(isAllowedA4R190LegacyMethodologyPath(root, changedPath) || !changedPath.startsWith("frontend/src/lib/sera/"), `engine lib path changed: ${changedPath}`);
  if (changedPath.startsWith("frontend/src/app/api/")) {
    assert.ok(
      isAllowedSeraVNextAdminApiPath(changedPath) ||
        isAllowedRiskProfileProductApiPath(changedPath) ||
        isAllowedSeraVNextProtectedApiPath(root, changedPath),
      `unexpected API path changed: ${changedPath}`,
    );
  }
  assert.ok(!changedPath.startsWith("supabase/migrations/"), `migration path changed: ${changedPath}`);
  assert.ok(!changedPath.startsWith("tests/reports/baseline/"), `baseline path changed: ${changedPath}`);
  assert.ok(!changedPath.startsWith("docs/sera-vnext/source-corpus/"), `source corpus path changed: ${changedPath}`);
}

for (const token of ["CE" + "RA", "DA" + "L", "Dal" + "mos", "Dal" + "mais"]) {
  assert.ok(!combined.includes(token), `forbidden token present: ${token}`);
}

const forbiddenPatterns = [
  /"selectedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"releasedCode"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"finalConclusion"[ \t]*:(?![ \t]*null[ \t]*[,}])[^,\r\n}]+/,
  /"classifiedOutput"[ \t]*:[ \t]*true\b/,
  /"readyPromotion"[ \t]*:[ \t]*true\b/,
  /"officialFixture"[ \t]*:[ \t]*true\b/,
  /"baselineEligibleNow"[ \t]*:[ \t]*true\b/,
  /"productEligibleNow"[ \t]*:[ \t]*true\b/,
  /\bREADY automatic promotion:\s*YES\b/i,
  /\bP\/O\/A final classification created:\s*YES\b/i,
  /\bfinal escape point approved:\s*YES\b/i,
  /\bsynthetic-real blending:\s*YES\b/i,
];

for (const pattern of forbiddenPatterns) {
  assert.ok(!pattern.test(combined), `forbidden pattern matched: ${pattern}`);
}

for (const token of ["HFA" + "CS", "Ri" + "sk/ERC", "AR" + "MS/ERC", "recommend" + "ations"]) {
  assert.ok(!combined.includes(token), `forbidden scope token present: ${token}`);
}
