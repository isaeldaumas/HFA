import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

type DataAccess = "NONE" | "READ_ONLY" | "MUTATING_SYNTHETIC";
type IntegratedRegressionLevel = "READ_ONLY" | "MUTATING_SYNTHETIC";

type ManifestEntry = {
  path: string;
  type: "UNIT" | "CONTRACT" | "STATIC" | "INTEGRATION" | "REAL_DB" | "REAL_API" | "REAL_UI" | "GATE";
  requiredForRegression: boolean;
  requiredEnvironment: string[];
  expectedExit: number;
  expectedStatus: "PASS" | "NOT_READY";
  dataAccess?: DataAccess;
};

type ResultStatus = "PASS" | "FAIL" | "SKIP" | "NOT_READY" | "ENVIRONMENT_MISSING" | "ACCESS_LEVEL_SKIP";

type Result = {
  path: string;
  type: ManifestEntry["type"];
  status: ResultStatus;
  exitCode: number | null;
  durationMs: number;
  requiredForRegression: boolean;
  failureSignature: string | null;
  dataAccess?: DataAccess;
};

const REAL_TYPES = new Set<ManifestEntry["type"]>(["REAL_DB", "REAL_API", "REAL_UI"]);
const VALID_LEVELS = new Set<string>(["READ_ONLY", "MUTATING_SYNTHETIC"]);

const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "tests/sera-vnext/test-manifest.json");
const baseUrl = process.env.SERA_VNEXT_TEST_BASE_URL?.trim() || "http://127.0.0.1:3100";

if (!existsSync(manifestPath)) {
  throw new Error(`Missing SERA vNext manifest: ${manifestPath}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

// ── Execution level ────────────────────────────────────────────────────────
// When HFA_INTEGRATED_REGRESSION_LEVEL is NOT set, preserve historical behavior:
// all tests run (no dataAccess filtering). This keeps local/CI deterministic
// regression unchanged.
//
// When set, ONLY valid values are accepted. Invalid value = immediate fatal error.
const rawLevel = process.env.HFA_INTEGRATED_REGRESSION_LEVEL?.trim();

let integratedLevel: IntegratedRegressionLevel | null = null;
if (rawLevel !== undefined && rawLevel !== "") {
  if (!VALID_LEVELS.has(rawLevel)) {
    console.error(
      `FATAL: HFA_INTEGRATED_REGRESSION_LEVEL="${rawLevel}" is invalid. ` +
        `Valid values: READ_ONLY, MUTATING_SYNTHETIC. Refusing to run any tests.`
    );
    process.exit(2);
  }
  integratedLevel = rawLevel as IntegratedRegressionLevel;
}

// ── List-only mode ─────────────────────────────────────────────────────────
// HFA_REGRESSION_LIST_ONLY=true: calculate selection, print paths and counts, exit 0.
// No tests are executed. No network connections. Used for dry-run verification.
const listOnly = process.env.HFA_REGRESSION_LIST_ONLY?.trim().toLowerCase() === "true";

function loadFrontendEnv() {
  const envPath = path.join(rootDir, "frontend/.env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    if (!process.env[key]) process.env[key] = match[2].trim();
  }
}

if (!listOnly) {
  // Only load env when actually running tests
  loadFrontendEnv();
}

async function canReachLocalFrontend(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(baseUrl, { method: "GET", signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function requiredEnvironmentAvailable(name: string, localFrontendReachable: boolean): boolean {
  if (name === "LOCAL_FRONTEND_SERVER") return localFrontendReachable;
  return Boolean(process.env[name]?.trim());
}

function firstFailureLine(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /AssertionError|Error:|Fatal:|FAIL|✗|not ready|NOT_READY/i.test(line)) ??
    null
  );
}

function isExpectedNotReady(entry: ManifestEntry, exitCode: number, output: string): boolean {
  return (
    entry.type === "GATE" &&
    entry.expectedStatus === "NOT_READY" &&
    exitCode === entry.expectedExit &&
    output.includes("ENGINE_NATURALISTIC_VALIDATION_NOT_READY")
  );
}

function timeoutFor(entry: ManifestEntry): number {
  if (entry.type === "REAL_UI" || entry.type === "REAL_API") return 480_000;
  if (entry.type === "REAL_DB") return 240_000;
  return 180_000;
}

/**
 * Determines whether a REAL_* entry should be skipped based on the execution level.
 * Non-REAL_* entries are never filtered by access level.
 *
 * Level READ_ONLY  → only NONE and READ_ONLY entries run; MUTATING_SYNTHETIC = ACCESS_LEVEL_SKIP
 * Level MUTATING_SYNTHETIC → all entries run (assuming environment is available)
 * Level null (unset) → historical behavior, no dataAccess filtering
 */
function accessLevelSkip(entry: ManifestEntry): boolean {
  if (integratedLevel === null) return false; // no filtering when level not set
  if (!REAL_TYPES.has(entry.type)) return false; // non-REAL entries never filtered
  if (integratedLevel === "MUTATING_SYNTHETIC") return false; // all allowed
  // READ_ONLY: skip MUTATING_SYNTHETIC entries
  return entry.dataAccess === "MUTATING_SYNTHETIC";
}

function runEntry(entry: ManifestEntry): Result {
  const started = performance.now();
  const result = spawnSync(npxBin, ["tsx", entry.path], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
    timeout: timeoutFor(entry),
  });
  const durationMs = Math.round(performance.now() - started);
  const exitCode = typeof result.status === "number" ? result.status : 124;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (isExpectedNotReady(entry, exitCode, output)) {
    return {
      path: entry.path,
      type: entry.type,
      status: "NOT_READY",
      exitCode,
      durationMs,
      requiredForRegression: entry.requiredForRegression,
      failureSignature: firstFailureLine(output),
      dataAccess: entry.dataAccess,
    };
  }

  const pass = exitCode === entry.expectedExit && entry.expectedStatus === "PASS";
  return {
    path: entry.path,
    type: entry.type,
    status: pass ? "PASS" : "FAIL",
    exitCode,
    durationMs,
    requiredForRegression: entry.requiredForRegression,
    failureSignature: pass ? null : firstFailureLine(output),
    dataAccess: entry.dataAccess,
  };
}

// ── List-only mode: compute selection and exit without running ─────────────
if (listOnly) {
  const allReal = manifest.filter((e) => REAL_TYPES.has(e.type));
  const wouldSkip = allReal.filter((e) => accessLevelSkip(e));
  const wouldRun = allReal.filter((e) => !accessLevelSkip(e));
  const mutatingSelected = wouldRun.filter((e) => e.dataAccess === "MUTATING_SYNTHETIC");
  const readOnlySelected = wouldRun.filter(
    (e) => e.dataAccess === "READ_ONLY" || e.dataAccess === "NONE" || !e.dataAccess
  );
  const nonReal = manifest.filter((e) => !REAL_TYPES.has(e.type));

  console.log(`HFA_REGRESSION_LIST_ONLY: selection report`);
  console.log(`  HFA_INTEGRATED_REGRESSION_LEVEL = ${rawLevel ?? "(not set — historical behavior)"}`);
  console.log(`  Total manifest entries: ${manifest.length}`);
  console.log(`  Non-REAL_* (always selected): ${nonReal.length}`);
  console.log(`  Total REAL_* entries: ${allReal.length}`);
  console.log(`  REAL_* ACCESS_LEVEL_SKIP (would not run): ${wouldSkip.length}`);
  console.log(`  REAL_* selected to run: ${wouldRun.length}`);
  console.log(`    READ_ONLY/NONE selected: ${readOnlySelected.length}`);
  console.log(`    MUTATING_SYNTHETIC selected: ${mutatingSelected.length}`);
  if (integratedLevel === "READ_ONLY") {
    if (mutatingSelected.length !== 0) {
      console.error(`SELECTION_BUG: READ_ONLY level has ${mutatingSelected.length} MUTATING_SYNTHETIC selected — expected 0`);
      process.exit(3);
    }
    console.log(`  READ_ONLY enforcement: PASS — MUTATING_SYNTHETIC selected = 0`);
  }
  process.exit(0);
}

async function main() {
  const localFrontendReachable = await canReachLocalFrontend();
  const results: Result[] = [];

  let accessLevelSkipped = 0;
  let readOnlyExecuted = 0;
  let mutatingSyntheticExecuted = 0;

  for (const entry of manifest) {
    // ── Access level filter ──────────────────────────────────────────────
    if (accessLevelSkip(entry)) {
      accessLevelSkipped++;
      results.push({
        path: entry.path,
        type: entry.type,
        status: "ACCESS_LEVEL_SKIP",
        exitCode: null,
        durationMs: 0,
        requiredForRegression: entry.requiredForRegression,
        failureSignature: `access_level=${integratedLevel} skips dataAccess=${entry.dataAccess}`,
        dataAccess: entry.dataAccess,
      });
      console.log(`ACCESS_LEVEL_SKIP ${entry.path} (level=${integratedLevel} dataAccess=${entry.dataAccess})`);
      continue;
    }

    // ── Environment filter ───────────────────────────────────────────────
    const missingEnv = entry.requiredEnvironment.filter(
      (name) => !requiredEnvironmentAvailable(name, localFrontendReachable),
    );

    if (missingEnv.length > 0) {
      const status: ResultStatus = entry.requiredForRegression ? "ENVIRONMENT_MISSING" : "SKIP";
      results.push({
        path: entry.path,
        type: entry.type,
        status,
        exitCode: null,
        durationMs: 0,
        requiredForRegression: entry.requiredForRegression,
        failureSignature: `missing environment: ${missingEnv.join(",")}`,
        dataAccess: entry.dataAccess,
      });
      console.log(`${status} ${entry.path} (${missingEnv.join(",")})`);
      continue;
    }

    // ── Execute ──────────────────────────────────────────────────────────
    const result = runEntry(entry);
    results.push(result);
    console.log(`${result.status} ${entry.path} exit=${result.exitCode} durationMs=${result.durationMs}`);
    if (result.status === "FAIL" && result.failureSignature) {
      console.log(`  ${result.failureSignature}`);
    }

    // Track execution counts by data-access level
    if (REAL_TYPES.has(entry.type)) {
      if (entry.dataAccess === "MUTATING_SYNTHETIC") {
        mutatingSyntheticExecuted++;
      } else {
        readOnlyExecuted++;
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────
  const testsDiscovered = manifest.length;
  const testsExecuted = results.filter(
    (item) => !["SKIP", "ENVIRONMENT_MISSING", "ACCESS_LEVEL_SKIP"].includes(item.status)
  ).length;
  const requiredResults = results.filter((item) => item.requiredForRegression && item.type !== "GATE");
  const regressionFailures = results.filter((item) => item.requiredForRegression && item.status === "FAIL");
  const unexpectedSkips = results.filter((item) => item.requiredForRegression && item.status === "SKIP");
  const environmentMissing = results.filter(
    (item) => item.requiredForRegression && item.status === "ENVIRONMENT_MISSING"
  );
  const timeoutFailures = results.filter(
    (item) =>
      item.exitCode === 124 ||
      item.exitCode === 143 ||
      (item.failureSignature ? /timeout|timed out|TIMEOUT/i.test(item.failureSignature) : false),
  );
  const gatesPassed = results.filter((item) => item.type === "GATE" && item.status === "PASS").length;
  const gatesNotReady = results.filter((item) => item.type === "GATE" && item.status === "NOT_READY").length;

  const summary = {
    tests_discovered: testsDiscovered,
    tests_executed: testsExecuted,
    tests_passed: requiredResults.filter((item) => item.status === "PASS").length,
    tests_failed: regressionFailures.length,
    tests_skipped: results.filter((item) => item.status === "SKIP").length,
    gates_passed: gatesPassed,
    gates_not_ready: gatesNotReady,
    environment_missing: environmentMissing.length,
    race_timeouts: timeoutFailures.length,
    unexpected_skips: unexpectedSkips.length,
    // Data-access level tracking (populated only when level is set)
    integrated_regression_level: integratedLevel ?? "NOT_SET (historical behavior)",
    access_level_skipped: accessLevelSkipped,
    read_only_executed: readOnlyExecuted,
    mutating_synthetic_executed: mutatingSyntheticExecuted,
  };

  console.log(JSON.stringify(summary, null, 2));

  // In READ_ONLY mode, mutating_synthetic_executed must be exactly 0
  if (integratedLevel === "READ_ONLY" && mutatingSyntheticExecuted !== 0) {
    console.error(
      `FATAL: READ_ONLY enforcement violated — ${mutatingSyntheticExecuted} MUTATING_SYNTHETIC tests executed. ` +
        `This is a runner bug. Failing the run.`
    );
    process.exitCode = 3;
    return;
  }

  if (
    regressionFailures.length > 0 ||
    unexpectedSkips.length > 0 ||
    environmentMissing.length > 0 ||
    timeoutFailures.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
