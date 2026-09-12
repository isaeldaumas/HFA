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

export function isAllowedSeraVNextProtectedApiPath(rootDir: string, changedPath: string): boolean {
  if (changedPath !== "frontend/src/app/api/analyze/route.ts") return false;
  assertAnalyzeRouteSanitizationContract(rootDir);
  return true;
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
