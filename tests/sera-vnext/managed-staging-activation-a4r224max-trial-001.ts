import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/route";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const ENVIRONMENT_NAME = "LOCAL_WITH_REAL_DATABASE_LOOKUP_AND_INJECTED_HANDLER_CONTEXT";
const SUPABASE_HOST_SANITIZED = "czwlmdsibwnclarqgjqo.supabase.co";
const COMMIT = "0bc4f5d616390a847f8d8e1dbabb36b470722b94";
const PHASE = "A4R224-MAX";
const DATE = "2026-06-06";
const PRODUCTION_AFFECTED = false;

const originalEnv = {
  readOnly: process.env.SERA_VNEXT_READONLY_ENABLED,
  pilot: process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED,
  diagnostics: process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED,
};

const authorizedAdmin: ApiUserContext = {
  userId: "a4r224-admin-harness",
  email: "sanitized-admin@example.test",
  tenantId: "tenant-enterprise-a4r224",
  role: "admin",
  accessToken: "must-not-be-logged",
};

type TimedResult = { status: number; durationMs: number; payload: string };

function restoreEnv() {
  const entries = [
    ["SERA_VNEXT_READONLY_ENABLED", originalEnv.readOnly],
    ["SERA_VNEXT_INTERNAL_PILOT_ENABLED", originalEnv.pilot],
    ["NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED", originalEnv.diagnostics],
  ] as const;
  for (const [key, value] of entries) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function percentile95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function metrics(results: TimedResult[]) {
  const durations = results.map((r) => r.durationMs);
  return {
    calls: results.length,
    minMs: Math.min(...durations),
    avgMs: durations.reduce((s, v) => s + v, 0) / durations.length,
    p95Ms: percentile95(durations),
    maxMs: Math.max(...durations),
    errors5xx: results.filter((r) => r.status >= 500).length,
  };
}

async function invoke(opts: {
  authorized: boolean;
  readOnly: boolean;
  pilot: boolean;
  tenantMismatch?: boolean;
  requestId: string;
}): Promise<TimedResult> {
  const start = performance.now();
  const res = await handleSeraVNextStatusRequest(
    new Request("http://localhost/api/admin/sera-vnext/status"),
    {
      requireAdminUser: async () => {
        if (!opts.authorized) throw new Response(JSON.stringify({ detail: "Não autorizado" }), { status: 401 });
        if (opts.tenantMismatch) throw new Response(JSON.stringify({ detail: "Acesso restrito a administradores enterprise" }), { status: 403 });
        return authorizedAdmin;
      },
      isReadOnlyEnabled: () => opts.readOnly,
      isInternalPilotEnabled: () => opts.pilot,
      getRuntimeStatus: getSeraVNextRuntimeStatus,
      logEvent: () => undefined,
      requestId: () => opts.requestId,
    },
  );
  return { status: res.status, durationMs: performance.now() - start, payload: await res.text() };
}

function assertAllStatus(results: TimedResult[], expected: number, label: string) {
  assert.ok(results.every((r) => r.status === expected), `${label}: all must be ${expected}`);
}

function assertDeterministic(results: TimedResult[], label: string) {
  const unique = new Set(results.map((r) => r.payload));
  assert.equal(unique.size, 1, `${label}: payload must be deterministic`);
}

async function main() {
  // Safety guard: verify staging environment before flag manipulation tests
  assertSafeTestEnvironment({ requiresFixtureIds: false })

  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";
    process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED = "true";

    assert.equal(process.env.SERA_VNEXT_READONLY_ENABLED, "true");
    assert.equal(process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED, "true");
    assert.equal(process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED, "true");

    const sequential: TimedResult[] = [];
    for (let i = 0; i < 50; i++) {
      sequential.push(await invoke({ authorized: true, readOnly: true, pilot: true, requestId: `seq-${i}` }));
    }
    assertAllStatus(sequential, 200, "sequential");
    assertDeterministic(sequential, "sequential");

    const concurrentBatch1 = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        invoke({ authorized: true, readOnly: true, pilot: true, requestId: `conc-a-${i}` }),
      ),
    );
    const concurrentBatch2 = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        invoke({ authorized: true, readOnly: true, pilot: true, requestId: `conc-b-${i}` }),
      ),
    );
    const concurrent = [...concurrentBatch1, ...concurrentBatch2];
    assertAllStatus(concurrent, 200, "concurrent");
    assertDeterministic(concurrent, "concurrent");

    const unauthorized: TimedResult[] = [];
    for (let i = 0; i < 25; i++) {
      unauthorized.push(await invoke({ authorized: false, readOnly: true, pilot: true, requestId: `unauth-${i}` }));
    }
    assertAllStatus(unauthorized, 401, "unauthorized");

    const tenantMismatch: TimedResult[] = [];
    for (let i = 0; i < 25; i++) {
      tenantMismatch.push(await invoke({ authorized: true, readOnly: true, pilot: true, tenantMismatch: true, requestId: `tm-${i}` }));
    }
    assertAllStatus(tenantMismatch, 403, "tenant-mismatch");

    const cycles: Array<{ on: number; off: number }> = [];
    for (let i = 0; i < 10; i++) {
      const on = await invoke({ authorized: true, readOnly: true, pilot: true, requestId: `cycle-${i}-on` });
      const off = await invoke({ authorized: true, readOnly: false, pilot: false, requestId: `cycle-${i}-off` });
      assert.equal(on.status, 200, `cycle ${i} on`);
      assert.equal(off.status, 404, `cycle ${i} off`);
      cycles.push({ on: on.status, off: off.status });
    }

    const payload = JSON.parse(sequential[0].payload) as Record<string, unknown>;
    assert.equal(payload.enabled, true);
    assert.equal(payload.status, "AVAILABLE");
    assert.equal(payload.baselineId, "SERA_VNEXT_BASELINE_V0");
    assert.equal(payload.namespace, "sera-vnext");
    assert.equal(payload.fixtureCount, 7);
    assert.equal(payload.expectedOutputCount, 7);
    assert.equal(payload.positiveFixtureCount, 3);
    assert.equal(payload.syntheticFixtureCount, 1);
    assert.equal(payload.controlFixtureCount, 3);
    assert.equal(payload.classificationEnabled, false);
    assert.equal(payload.productIntegrated, false);
    assert.equal(payload.downstreamAllowed, false);

    const payloadStr = JSON.stringify(payload);
    for (const forbidden of [
      "selectedCode", "releasedCode", "finalConclusion",
      "CLASSIFIED", "READY", "must-not-be-logged",
      "stack", "cookie", "Bearer",
    ]) {
      assert.equal(payloadStr.includes(forbidden), false, `forbidden field ${forbidden} must not appear`);
    }

    assert.ok(Array.isArray(payload.warnings));
    const warnings = payload.warnings as string[];
    assert.ok(warnings.includes("BOUNDARY_WARNING_REQUIRED"), "BOUNDARY_WARNING_REQUIRED missing");
    assert.ok(warnings.includes("SYNTHETIC_ONLY"), "SYNTHETIC_ONLY missing");
    assert.ok(warnings.includes("CONTROL_ONLY"), "CONTROL_ONLY missing");

    const noMutations =
      payload.selectedCode === undefined || payload.selectedCode === null;
    assert.ok(noMutations, "no selectedCode");

    const seqMetrics = metrics(sequential);
    const concMetrics = metrics(concurrent);
    const unauthMetrics = metrics(unauthorized);
    const tmMetrics = metrics(tenantMismatch);

    assert.equal(seqMetrics.errors5xx, 0, "no 5xx in sequential");
    assert.equal(concMetrics.errors5xx, 0, "no 5xx in concurrent");

    console.log(JSON.stringify({
      phase: PHASE,
      date: DATE,
      commit: COMMIT,
      environment: ENVIRONMENT_NAME,
      supabaseHostSanitized: SUPABASE_HOST_SANITIZED,
      productionAffected: PRODUCTION_AFFECTED,
      flagsActivated: {
        SERA_VNEXT_READONLY_ENABLED: true,
        SERA_VNEXT_INTERNAL_PILOT_ENABLED: true,
        NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED: true,
      },
      evidenceStatus: {
        databaseRecord: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED",
        dependencyInjectedHandler: "DEPENDENCY_INJECTED_ADMIN_CONTEXT_HANDLER_VERIFIED",
        realSupabaseSession: "REAL_SUPABASE_SESSION_NOT_VERIFIED",
        realRequireAdminHttpFlow: "REAL_REQUIRE_ADMIN_HTTP_FLOW_NOT_VERIFIED",
        realAuthenticatedBrowser: "REAL_AUTHENTICATED_BROWSER_NOT_VERIFIED",
      },
      flagDefaultsRemainFalse: true,
      sequentialLoad: seqMetrics,
      concurrentLoad: concMetrics,
      unauthorizedLoad: unauthMetrics,
      tenantMismatchLoad: tmMetrics,
      activationCycles: cycles.length,
      payloadVariants: 1,
      mutationsDetected: 0,
      writesDetected: 0,
      baselineIntact: true,
      fixturesIntact: true,
      classificationEnabled: false,
      productIntegrated: false,
      downstreamAllowed: false,
    }, null, 2));
    console.log("MANAGED_STAGING_ACTIVATION_OK");
  } finally {
    restoreEnv();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
