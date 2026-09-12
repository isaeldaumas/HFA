import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextProtectedApiPath } from "./protected-path-contract";

type Candidate = {
  id: string;
  phase: string;
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
  sourceType: "real_event" | "synthetic" | "control";
  title: string;
  sourceComponent: string;
  expectedBehaviorStatus: string;
  requiredLocks: string[];
  expectedMethodologicalBehavior: string[];
  forbiddenBehavior: string[];
  boundaryWarnings: string[];
  controlWarnings: string[];
  limitations: string[];
  requiredFutureGates: string[];
  prohibitedUses: string[];
  traceabilityInputs: string[];
  notes: string[];
};

const root = path.resolve(__dirname, "..", "..");
const candidateDir = path.join(root, "tests/sera-vnext/fixture-candidates");
const docsDir = path.join(
  root,
  "docs/sera-vnext/benchmark-a4r212/isolated-fixture-candidates-big",
);

const candidateFiles = {
  comair: path.join(candidateDir, "positive/comair-5191.fixture-candidate.json"),
  asiana: path.join(candidateDir, "positive/asiana-214.fixture-candidate.json"),
  ups: path.join(candidateDir, "positive/ups-1354.fixture-candidate.json"),
  gap004: path.join(
    candidateDir,
    "synthetic/gap004-consequence-as-cause.fixture-candidate.json",
  ),
  delta: path.join(candidateDir, "controls/delta-191-control.fixture-candidate.json"),
  usair: path.join(candidateDir, "controls/usair-427-control.fixture-candidate.json"),
  n5bqj: path.join(candidateDir, "controls/5nbqj-control.fixture-candidate.json"),
};

const supportFiles = {
  index: path.join(candidateDir, "FIXTURE_CANDIDATE_INDEX_A4R212_BIG.md"),
  contract: path.join(candidateDir, "FIXTURE_CANDIDATE_CONTRACT_A4R212_BIG.md"),
};

const docs = {
  report: path.join(
    docsDir,
    "SERA_VNEXT_ISOLATED_FIXTURE_CANDIDATES_A4R212_BIG_v0.2.0.md",
  ),
  creation: path.join(
    docsDir,
    "SERA_VNEXT_FIXTURE_CANDIDATE_CREATION_MATRIX_A4R212_BIG.csv",
  ),
  limitations: path.join(
    docsDir,
    "SERA_VNEXT_FIXTURE_CANDIDATE_LIMITATION_MATRIX_A4R212_BIG.csv",
  ),
  controls: path.join(
    docsDir,
    "SERA_VNEXT_CONTROL_CANDIDATE_MATRIX_A4R212_BIG.csv",
  ),
  guardrails: path.join(
    docsDir,
    "SERA_VNEXT_CANDIDATE_ISOLATION_GUARDRAILS_A4R212_BIG.md",
  ),
  closure: path.join(
    docsDir,
    "SERA_VNEXT_POST_CREATION_VALIDATION_CLOSURE_A4R212_BIG.md",
  ),
  next: path.join(docsDir, "SERA_VNEXT_NEXT_MACROPHASE_DECISION_A4R212_BIG.md"),
  log: path.join(docsDir, "SERA_A4R212_BIG_LOG_v0.2.0.md"),
};

function read(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function readJson(filePath: string): Candidate {
  return JSON.parse(read(filePath)) as Candidate;
}

function collectJsonFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(entryPath);
    return entry.name.endsWith(".json") ? [entryPath] : [];
  });
}

for (const dir of [
  candidateDir,
  path.join(candidateDir, "positive"),
  path.join(candidateDir, "synthetic"),
  path.join(candidateDir, "controls"),
]) {
  assert.ok(existsSync(dir), `required candidate directory must exist: ${dir}`);
}

for (const file of [
  ...Object.values(candidateFiles),
  ...Object.values(supportFiles),
  ...Object.values(docs),
]) {
  assert.ok(existsSync(file), `required A4R212-BIG file must exist: ${file}`);
}

const jsonFiles = collectJsonFiles(candidateDir).sort();
assert.deepEqual(
  jsonFiles,
  Object.values(candidateFiles).sort(),
  "exactly the seven expected candidate JSON files must exist",
);

const candidates = Object.fromEntries(
  Object.entries(candidateFiles).map(([key, file]) => [key, readJson(file)]),
) as Record<keyof typeof candidateFiles, Candidate>;

const requiredCommonLocks = [
  "FIXTURE_CANDIDATE_ONLY",
  "NOT_OFFICIAL_FIXTURE",
  "NOT_BASELINE",
  "NOT_PRODUCT",
  "NOT_READY",
  "NO_SELECTED_CODE",
  "NO_RELEASED_CODE",
  "NO_FINAL_CONCLUSION",
  "NO_CLASSIFIED_OUTPUT",
  "NO_DOWNSTREAM",
  "EXPECTED_BEHAVIOR_NON_FINAL",
];

for (const [key, candidate] of Object.entries(candidates)) {
  assert.equal(candidate.phase, "A4R212-BIG", `${key} phase mismatch`);
  assert.equal(candidate.status, "FIXTURE_CANDIDATE_ONLY", `${key} status mismatch`);
  assert.equal(candidate.officialFixture, false, `${key} officialFixture must be false`);
  assert.equal(candidate.baselineEligibleNow, false, `${key} baselineEligibleNow must be false`);
  assert.equal(candidate.productEligibleNow, false, `${key} productEligibleNow must be false`);
  assert.equal(candidate.readyPromotion, false, `${key} readyPromotion must be false`);
  assert.equal(candidate.selectedCode, null, `${key} selectedCode must be null`);
  assert.equal(candidate.releasedCode, null, `${key} releasedCode must be null`);
  assert.equal(candidate.finalConclusion, null, `${key} finalConclusion must be null`);
  assert.equal(candidate.classifiedOutput, false, `${key} classifiedOutput must be false`);
  assert.equal(candidate.downstreamAllowed, false, `${key} downstreamAllowed must be false`);
  assert.equal(
    candidate.expectedBehaviorStatus,
    "EXPECTED_BEHAVIOR_NON_FINAL",
    `${key} expected behavior status mismatch`,
  );
  for (const lock of requiredCommonLocks) {
    assert.ok(candidate.requiredLocks.includes(lock), `${key} missing lock: ${lock}`);
  }
}

assert.equal(candidates.comair.id, "A4R212-CAND-POS-COMAIR-5191");
assert.equal(candidates.comair.componentType, "positive_candidate");
assert.equal(candidates.comair.sourceType, "real_event");
assert.match(candidates.comair.expectedMethodologicalBehavior.join("\n"), /wrong-runway lineup/i);

assert.equal(candidates.asiana.id, "A4R212-CAND-POS-ASIANA-214");
assert.equal(candidates.asiana.componentType, "positive_candidate");
assert.ok(candidates.asiana.requiredLocks.includes("BOUNDARY_WARNING_REQUIRED"));
assert.match(candidates.asiana.boundaryWarnings.join("\n"), /500 ft/i);
assert.match(candidates.asiana.boundaryWarnings.join("\n"), /no automation-as-human-actor/i);

assert.equal(candidates.ups.id, "A4R212-CAND-POS-UPS-1354");
assert.equal(candidates.ups.componentType, "positive_candidate");
assert.ok(candidates.ups.requiredLocks.includes("BOUNDARY_WARNING_REQUIRED"));
assert.match(candidates.ups.boundaryWarnings.join("\n"), /MDA/i);
assert.match(candidates.ups.boundaryWarnings.join("\n"), /no CFIT-as-cause/i);

assert.equal(candidates.gap004.id, "A4R212-CAND-SYN-GAP004-CONSEQUENCE-AS-CAUSE");
assert.equal(candidates.gap004.componentType, "synthetic_candidate");
assert.equal(candidates.gap004.sourceType, "synthetic");
for (const lock of ["SYNTHETIC_ONLY", "NOT_REAL_EVENT", "NO_SYNTHETIC_REAL_BLENDING"]) {
  assert.ok(candidates.gap004.requiredLocks.includes(lock), `GAP-004 missing lock: ${lock}`);
}

for (const key of ["delta", "usair", "n5bqj"] as const) {
  const candidate = candidates[key];
  assert.equal(candidate.componentType, "control_candidate", `${key} must be control`);
  assert.equal(candidate.sourceType, "control", `${key} sourceType must be control`);
  assert.ok(candidate.requiredLocks.includes("CONTROL_ONLY"), `${key} missing CONTROL_ONLY`);
  assert.ok(
    candidate.requiredLocks.includes("NOT_POSITIVE_FIXTURE"),
    `${key} missing NOT_POSITIVE_FIXTURE`,
  );
  assert.match(candidate.controlWarnings.join("\n"), /CONTROL_ONLY/);
  assert.match(candidate.controlWarnings.join("\n"), /NOT_POSITIVE_FIXTURE/);
}

const officialFixtureDir = path.join(root, "tests/sera/fixtures");
for (const filePath of Object.values(candidateFiles)) {
  const officialPath = path.join(officialFixtureDir, path.basename(filePath));
  assert.ok(!existsSync(officialPath), `candidate must not exist in official fixtures: ${officialPath}`);
}

const changedTracked = execSync("git diff --name-only && git diff --cached --name-only", {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

const protectedPrefixes = [
  "tests/sera/fixtures/",
  "frontend/src/lib/sera/",
  "supabase/migrations/",
  "tests/reports/baseline/",
  "docs/sera-vnext/source-corpus/",
];

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
  if (changedPath.startsWith("frontend/src/app/api/")) {
    assert.ok(
      isAllowedSeraVNextAdminApiPath(changedPath) ||
        isAllowedRiskProfileProductApiPath(changedPath) ||
        isAllowedSeraVNextProtectedApiPath(root, changedPath),
      `unexpected API path changed: ${changedPath}`,
    );
    continue;
  }
  assert.ok(
    isAllowedA4R190LegacyMethodologyPath(root, changedPath) || !protectedPrefixes.some((prefix) => changedPath.startsWith(prefix)),
    `protected path changed: ${changedPath}`,
  );
}

const allA4R212Text = [
  ...Object.values(candidateFiles).map(read),
  ...Object.values(supportFiles).map(read),
  ...Object.values(docs).map(read),
  read(__filename),
].join("\n");

const forbiddenFragments = [
  "CE" + "RA",
  "DA" + "L",
  "Dal" + "mos",
  "Dal" + "mais",
];

for (const fragment of forbiddenFragments) {
  assert.ok(!allA4R212Text.includes(fragment), `forbidden fragment present: ${fragment}`);
}

const forbiddenPatterns = [
  /\bREADY automatic promotion:\s*YES\b/i,
  /\bP\/O\/A final classification created:\s*YES\b/i,
  /\bfinal escape point approved:\s*YES\b/i,
  /\bsynthetic-real blending:\s*YES\b/i,
];

for (const pattern of forbiddenPatterns) {
  assert.ok(!pattern.test(allA4R212Text), `forbidden pattern matched: ${pattern}`);
}

const dynamicForbidden = [
  "HFA" + "CS",
  "Ri" + "sk/ERC",
  "AR" + "MS/ERC",
  "recommend" + "ations",
];

for (const token of dynamicForbidden) {
  assert.ok(!allA4R212Text.includes(token), `forbidden scope token present: ${token}`);
}

assert.ok(
  read(docs.next).includes("A4R213-BIG - Fixture Candidate Review and Freeze Decision"),
  "next macrophase must be A4R213-BIG review and freeze decision",
);
