import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/handler";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";

const rootDir = path.resolve(__dirname, "..", "..");
const originalReadOnlyFlag = process.env.SERA_VNEXT_READONLY_ENABLED;
const originalPilotFlag = process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;

function restoreEnv() {
  if (originalReadOnlyFlag === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
  else process.env.SERA_VNEXT_READONLY_ENABLED = originalReadOnlyFlag;
  if (originalPilotFlag === undefined) delete process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;
  else process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = originalPilotFlag;
}

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const adminUser: ApiUserContext = {
  userId: "pilot-admin",
  email: "pilot@example.test",
  tenantId: "pilot-enterprise",
  role: "admin",
  accessToken: "redacted",
};

async function main() {
  try {
  const pageSource = readFileSync(path.join(rootDir, "frontend/src/app/(dashboard)/admin/sera-vnext/page.tsx"), "utf8");
  assert.ok(pageSource.includes("Diagnóstico interno somente leitura"), "diagnostic-only status must be visible");
  assert.ok(pageSource.includes("Não integrado à classificação"), "non-classification status must be visible");
  assert.equal(pageSource.includes("<button"), false, "diagnostic page must not expose mutable buttons");
  assert.equal(pageSource.includes("<form"), false, "diagnostic page must not expose forms");
  assert.equal(/type=["']file["']/.test(pageSource), false, "diagnostic page must not expose uploads");
  assert.equal(pageSource.includes("selectedCode"), false, "diagnostic page must not expose selectedCode");
  assert.equal(pageSource.includes("releasedCode"), false, "diagnostic page must not expose releasedCode");
  assert.equal(pageSource.includes("finalConclusion"), false, "diagnostic page must not expose finalConclusion");

  process.env.SERA_VNEXT_READONLY_ENABLED = "true";
  process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";
  const runtime = getSeraVNextRuntimeStatus();
  assert.equal(runtime.status, "AVAILABLE", "internal pilot runtime must load baseline summary");

  const res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    requireAdminUser: async () => adminUser,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    getRuntimeStatus: () => runtime,
    logEvent: () => undefined,
    now: () => 1,
    requestId: () => "pilot-req",
  });
  assert.equal(res.status, 200);
  const payload = await body(res);
  assert.equal(payload.baselineId, "SERA_VNEXT_BASELINE_V0");
  assert.equal(payload.fixtureCount, 7);
  assert.equal(payload.expectedOutputCount, 7);
  assert.equal(payload.positiveFixtureCount, 3);
  assert.equal(payload.syntheticFixtureCount, 1);
  assert.equal(payload.controlFixtureCount, 3);
  assert.equal(payload.classificationEnabled, false);
  assert.equal(payload.productIntegrated, false);
  assert.equal(payload.downstreamAllowed, false);

  console.log("A4R222 internal pilot trial passed.");
  } finally {
    restoreEnv();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
