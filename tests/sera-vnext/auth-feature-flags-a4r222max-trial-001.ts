import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/handler";
import {
  isSeraVNextDiagnosticsEnabled,
  isSeraVNextInternalPilotEnabled,
  isSeraVNextReadOnlyEnabled,
} from "../../frontend/src/lib/sera-vnext-runtime/feature-flags";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";
import type { SeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/types";

const rootDir = path.resolve(__dirname, "..", "..");
const originalEnv = {
  readOnly: process.env.SERA_VNEXT_READONLY_ENABLED,
  diagnostics: process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED,
  pilot: process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED,
};

function restoreEnv() {
  if (originalEnv.readOnly === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
  else process.env.SERA_VNEXT_READONLY_ENABLED = originalEnv.readOnly;
  if (originalEnv.diagnostics === undefined) delete process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED;
  else process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED = originalEnv.diagnostics;
  if (originalEnv.pilot === undefined) delete process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;
  else process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = originalEnv.pilot;
}

function setAll(value: string | undefined) {
  for (const key of ["SERA_VNEXT_READONLY_ENABLED", "NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED", "SERA_VNEXT_INTERNAL_PILOT_ENABLED"]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function responseError(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const adminUser: ApiUserContext = {
  userId: "user-admin",
  email: "admin@example.test",
  tenantId: "tenant-enterprise",
  role: "admin",
  accessToken: "redacted-test-token",
};

const availableStatus: SeraVNextRuntimeStatus = {
  enabled: true,
  status: "AVAILABLE",
  baselineId: "SERA_VNEXT_BASELINE_V0",
  namespace: "sera-vnext",
  fixtureCount: 7,
  expectedOutputCount: 7,
  positiveFixtureCount: 3,
  syntheticFixtureCount: 1,
  controlFixtureCount: 3,
  productIntegrated: false,
  classificationEnabled: false,
  downstreamAllowed: false,
  warnings: ["BOUNDARY_WARNING_REQUIRED", "SYNTHETIC_ONLY", "CONTROL_ONLY"],
};

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function main() {
  try {
  const flagValues: Array<[string, string | undefined, boolean]> = [
    ["undefined", undefined, false],
    ["empty", "", false],
    ["false", "false", false],
    ["FALSE", "FALSE", false],
    ["0", "0", false],
    ["true", "true", true],
    ["TRUE", "TRUE", true],
    ["1", "1", false],
    ["invalid", "enabled", false],
  ];

  for (const [label, value, expected] of flagValues) {
    setAll(value);
    assert.equal(isSeraVNextReadOnlyEnabled(), expected, `read-only flag ${label}`);
    assert.equal(isSeraVNextDiagnosticsEnabled(), expected, `diagnostics flag ${label}`);
    assert.equal(isSeraVNextInternalPilotEnabled(), expected, `internal pilot flag ${label}`);
  }

  const events: Array<Record<string, unknown>> = [];
  const deps = {
    requireAdminUser: async () => adminUser,
    getRuntimeStatus: () => availableStatus,
    logEvent: (event: Record<string, unknown>) => events.push(event),
    now: () => 100,
    requestId: () => "req-a4r222",
  };

  let res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => false,
    isInternalPilotEnabled: () => true,
  });
  assert.equal(res.status, 404, "read-only off must hide endpoint");
  assert.equal((await json(res)).detail, "Not found");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => false,
  });
  assert.equal(res.status, 404, "pilot off must hide endpoint even when read-only is on");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => false,
    isInternalPilotEnabled: () => true,
  });
  assert.equal(res.status, 404, "public diagnostics flag alone must not enable service-side endpoint");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    requireAdminUser: async () => {
      throw responseError("Não autorizado", 401);
    },
  });
  assert.equal(res.status, 401, "flag on without valid token must be unauthorized");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    requireAdminUser: async () => {
      throw responseError("Não autorizado", 401);
    },
  });
  assert.equal(res.status, 401, "invalid token must be unauthorized");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    requireAdminUser: async () => {
      throw responseError("Acesso restrito a administradores enterprise", 403);
    },
  });
  assert.equal(res.status, 403, "non-admin or non-enterprise tenant must be forbidden");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
  });
  assert.equal(res.status, 200, "authorized admin must get status");
  const ok = await json(res);
  assert.equal(ok.baselineId, "SERA_VNEXT_BASELINE_V0");
  assert.equal(ok.fixtureCount, 7);
  assert.equal(ok.classificationEnabled, false);
  assert.equal(ok.productIntegrated, false);
  assert.equal(ok.downstreamAllowed, false);
  for (const forbidden of ["selectedCode", "releasedCode", "finalConclusion", "classifiedOutput", "readyPromotion"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(ok, forbidden), false, `${forbidden} must not be exposed`);
  }

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    getRuntimeStatus: () => ({
      enabled: true,
      status: "ERROR",
      errorCode: "SERA_VNEXT_BASELINE_VALIDATION_FAILED",
      safeMessage: "SERA vNext read-only baseline validation failed.",
    }),
  });
  assert.equal(res.status, 503, "invalid baseline must fail closed");
  const failed = await json(res);
  assert.equal(failed.errorCode, "SERA_VNEXT_BASELINE_VALIDATION_FAILED");
  assert.equal(JSON.stringify(failed).includes("stack"), false, "fail-closed response must not expose stack");

  res = await handleSeraVNextStatusRequest(new Request("http://localhost/api/admin/sera-vnext/status"), {
    ...deps,
    isReadOnlyEnabled: () => true,
    isInternalPilotEnabled: () => true,
    getRuntimeStatus: () => {
      throw new Error("sensitive stack detail");
    },
  });
  assert.equal(res.status, 500, "unexpected error must be sanitized");
  assert.equal(JSON.stringify(await json(res)).includes("sensitive"), false);

  const routeSource = readFileSync(path.join(rootDir, "frontend/src/app/api/admin/sera-vnext/status/route.ts"), "utf8");
  assert.equal(/export\s+async\s+function\s+POST/.test(routeSource), false, "POST must not be implemented");
  assert.ok(events.some((event) => event.event === "sera_vnext_runtime_status_disabled"), "disabled event must be logged");
  assert.ok(events.some((event) => event.event === "sera_vnext_runtime_status_available"), "available event must be logged");
  assert.ok(events.some((event) => event.event === "sera_vnext_runtime_status_denied"), "denied event must be logged");
  assert.ok(events.some((event) => event.event === "sera_vnext_runtime_status_failed"), "failed event must be logged");
  assert.equal(JSON.stringify(events).includes("redacted-test-token"), false, "logs must not contain tokens");

  console.log("A4R222 auth and feature flags trial passed.");
  } finally {
    restoreEnv();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
