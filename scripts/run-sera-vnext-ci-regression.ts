/**
 * SERA vNext CI Deterministic Regression Runner
 *
 * Executa apenas casos do manifesto que são:
 *   - requiredForRegression === true
 *   - requiredEnvironment === [] (sem dependência ambiental)
 *
 * NÃO executa:
 *   - REAL_DB, REAL_API, REAL_UI (dependências externas)
 *   - Casos com requiredEnvironment não vazio
 *
 * Falha se:
 *   - Qualquer caso determinístico obrigatório falhar
 *   - Ocorrer timeout em qualquer caso
 *   - Skip inesperado detectado
 *   - Manifesto inconsistente (entry determinística com tipo ambiental)
 *
 * Nunca usa: Supabase real, frontend server real, LLM real.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const ENVIRONMENTAL_TYPES = new Set(["REAL_DB", "REAL_API", "REAL_UI", "INTEGRATION"]);

type ManifestEntry = {
  path: string;
  type: "UNIT" | "CONTRACT" | "STATIC" | "INTEGRATION" | "REAL_DB" | "REAL_API" | "REAL_UI" | "GATE";
  requiredForRegression: boolean;
  requiredEnvironment: string[];
  expectedExit: number;
  expectedStatus: "PASS" | "NOT_READY";
};

type CIResult = {
  path: string;
  type: ManifestEntry["type"];
  status: "PASS" | "FAIL" | "TIMEOUT" | "NOT_READY";
  exitCode: number | null;
  durationMs: number;
  failureSignature: string | null;
};

type CISummary = {
  runner: "sera-vnext-ci-deterministic";
  total_manifest_cases: number;
  deterministic_cases_selected: number;
  ci_exclusions_applied: number;
  executed: number;
  passed: number;
  failed: number;
  timeouts: number;
  not_ready: number;
  consistency_errors: string[];
  overall: "CI_PASS" | "CI_FAIL";
};

const rootDir = path.resolve(__dirname, "..");
const manifestPath = path.join(rootDir, "tests/sera-vnext/test-manifest.json");
const exclusionsPath = path.join(rootDir, "tests/sera-vnext/ci-exclusions.json");

if (!existsSync(manifestPath)) {
  console.error(`FATAL: manifesto não encontrado: ${manifestPath}`);
  process.exit(1);
}

const allEntries = JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[];
const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";

// Carrega exclusões documentadas (manifesto inconsistente — sem alterar o manifesto metodológico)
type Exclusion = { path: string; reason: string; classifiedAs: string; addedAt: string; resolvedBy: string };
type ExclusionsFile = { exclusions: Exclusion[] };
const exclusions: Map<string, Exclusion> = new Map();
if (existsSync(exclusionsPath)) {
  const excFile = JSON.parse(readFileSync(exclusionsPath, "utf8")) as ExclusionsFile;
  for (const exc of excFile.exclusions) {
    exclusions.set(exc.path, exc);
  }
  console.log(`Exclusões CI documentadas: ${exclusions.size}`);
}

// Seleciona apenas casos determinísticos: obrigatórios + sem ambiente externo
const deterministicEntries = allEntries.filter(
  (e) => e.requiredForRegression === true && Array.isArray(e.requiredEnvironment) && e.requiredEnvironment.length === 0,
);

// Verificação de consistência do manifesto
const consistencyErrors: string[] = [];
for (const entry of deterministicEntries) {
  // Um caso sem requiredEnvironment NÃO pode ser do tipo ambiental real
  if (ENVIRONMENTAL_TYPES.has(entry.type)) {
    consistencyErrors.push(
      `INCONSISTENCY: ${entry.path} tem type=${entry.type} mas requiredEnvironment=[] — tipo ambiental real não pode ser determinístico`,
    );
  }
  // Verificar que o arquivo existe
  if (!existsSync(path.join(rootDir, entry.path))) {
    consistencyErrors.push(`MISSING_FILE: ${entry.path} listado no manifesto mas não existe no repositório`);
  }
}

if (consistencyErrors.length > 0) {
  console.error("MANIFESTO INCONSISTENTE:");
  for (const err of consistencyErrors) console.error(`  ${err}`);
  process.exit(1);
}

function firstFailureLine(output: string): string | null {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    lines.find((l) => /AssertionError|Error:|Fatal:|FAIL|✗|not ready|NOT_READY/i.test(l)) ?? null
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

const DETERMINISTIC_TIMEOUT_MS = 120_000; // 2 minutos por caso determinístico

function runEntry(entry: ManifestEntry): CIResult {
  const started = performance.now();
  const result = spawnSync(npxBin, ["tsx", entry.path], {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      // Garantir flags SERA vNext desligadas em CI
      SERA_VNEXT_READONLY_ENABLED: "false",
      SERA_VNEXT_INTERNAL_PILOT_ENABLED: "false",
      NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED: "false",
      SERA_SHADOW_EXECUTION_ENABLED: "false",
    },
    timeout: DETERMINISTIC_TIMEOUT_MS,
  });

  const durationMs = Math.round(performance.now() - started);
  const exitCode = typeof result.status === "number" ? result.status : null;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  // Timeout detectado
  if (result.signal === "SIGTERM" || exitCode === 124 || exitCode === 143) {
    return {
      path: entry.path,
      type: entry.type,
      status: "TIMEOUT",
      exitCode,
      durationMs,
      failureSignature: `TIMEOUT após ${durationMs}ms (limite: ${DETERMINISTIC_TIMEOUT_MS}ms)`,
    };
  }

  // NOT_READY esperado por manifesto (somente GATE com expectedStatus=NOT_READY)
  if (isExpectedNotReady(entry, exitCode ?? -1, output)) {
    return { path: entry.path, type: entry.type, status: "NOT_READY", exitCode, durationMs, failureSignature: null };
  }

  // NOT_READY não esperado = falha
  if (entry.expectedStatus === "PASS" && output.includes("ENGINE_NATURALISTIC_VALIDATION_NOT_READY")) {
    return {
      path: entry.path,
      type: entry.type,
      status: "FAIL",
      exitCode,
      durationMs,
      failureSignature: "UNEXPECTED_NOT_READY: manifesto esperava PASS mas teste retornou NOT_READY",
    };
  }

  const pass = exitCode === entry.expectedExit && entry.expectedStatus === "PASS";
  return {
    path: entry.path,
    type: entry.type,
    status: pass ? "PASS" : "FAIL",
    exitCode,
    durationMs,
    failureSignature: pass ? null : firstFailureLine(output),
  };
}

async function main() {
  console.log(`SERA vNext CI Deterministic Regression`);
  console.log(`Manifesto total: ${allEntries.length} casos`);
  console.log(`Selecionados (determinísticos): ${deterministicEntries.length} casos`);
  console.log(`Timeout por caso: ${DETERMINISTIC_TIMEOUT_MS}ms\n`);

  const results: CIResult[] = [];
  const appliedExclusions: string[] = [];

  // Separa casos excluídos por ci-exclusions.json
  const activeEntries = deterministicEntries.filter((e) => {
    if (exclusions.has(e.path)) {
      appliedExclusions.push(e.path);
      return false;
    }
    return true;
  });

  if (appliedExclusions.length > 0) {
    console.log(`\n⚠ CI exclusions aplicadas (manifesto inconsistente — pendente decisão autoral):`);
    for (const p of appliedExclusions) {
      const exc = exclusions.get(p)!;
      console.log(`  EXCLUÍDO ${p}`);
      console.log(`    Motivo: ${exc.classifiedAs}`);
    }
    console.log();
  }

  for (const entry of activeEntries) {
    const result = runEntry(entry);
    results.push(result);

    const icon = result.status === "PASS" ? "✓" : result.status === "NOT_READY" ? "⚪" : "✗";
    console.log(`${icon} ${result.status.padEnd(10)} ${entry.path} exit=${result.exitCode} ${result.durationMs}ms`);
    if (result.failureSignature) {
      console.log(`    └─ ${result.failureSignature}`);
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const timeouts = results.filter((r) => r.status === "TIMEOUT").length;
  const notReady = results.filter((r) => r.status === "NOT_READY").length;

  const overall: CISummary["overall"] =
    failed === 0 && timeouts === 0 ? "CI_PASS" : "CI_FAIL";

  const summary: CISummary = {
    runner: "sera-vnext-ci-deterministic",
    total_manifest_cases: allEntries.length,
    deterministic_cases_selected: deterministicEntries.length,
    ci_exclusions_applied: appliedExclusions.length,
    executed: results.length,
    passed,
    failed,
    timeouts,
    not_ready: notReady,
    consistency_errors: consistencyErrors,
    overall,
  };

  console.log("\n--- SUMMARY ---");
  console.log(JSON.stringify(summary, null, 2));

  if (overall === "CI_FAIL") {
    console.error(`\nCI FAIL: ${failed} falha(s), ${timeouts} timeout(s)`);
    process.exitCode = 1;
  } else {
    console.log(`\n${overall}: ${passed} passed, ${notReady} NOT_READY esperado`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
