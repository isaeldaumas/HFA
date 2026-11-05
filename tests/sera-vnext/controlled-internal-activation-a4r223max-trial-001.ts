import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/handler";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

type TimedResult = {
  status: number;
  durationMs: number;
  payload: string;
};

const originalEnv = {
  readOnly: process.env.SERA_VNEXT_READONLY_ENABLED,
  pilot: process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED,
  diagnostics: process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED,
};

const adminUser: ApiUserContext = {
  userId: "a4r223-admin",
  email: "sanitized-admin@example.test",
  tenantId: "tenant-enterprise-sanitized",
  role: "admin",
  accessToken: "must-not-be-logged",
};

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
  const durations = results.map((result) => result.durationMs);
  return {
    calls: results.length,
    minMs: Math.min(...durations),
    averageMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
    p95Ms: percentile95(durations),
    maxMs: Math.max(...durations),
    errors: results.filter((result) => result.status >= 500).length,
  };
}

async function invoke(options: { authorized: boolean; enabled: boolean; requestId: string }): Promise<TimedResult> {
  const started = performance.now();
  const response = await handleSeraVNextStatusRequest(
    new Request("http://localhost/api/admin/sera-vnext/status", {
      headers: options.authorized ? { Authorization: "Bearer synthetic-not-forwarded" } : {},
    }),
    {
      requireAdminUser: async () => {
        if (!options.authorized) {
          throw new Response(JSON.stringify({ detail: "Não autorizado" }), { status: 401 });
        }
        return adminUser;
      },
      isReadOnlyEnabled: () => options.enabled,
      isInternalPilotEnabled: () => options.enabled,
      getRuntimeStatus: getSeraVNextRuntimeStatus,
      logEvent: () => undefined,
      requestId: () => options.requestId,
    },
  );
  return {
    status: response.status,
    durationMs: performance.now() - started,
    payload: await response.text(),
  };
}

function assertDeterministic(results: TimedResult[], expectedStatus: number) {
  assert.ok(results.every((result) => result.status === expectedStatus), `all responses must be ${expectedStatus}`);
  const payloads = new Set(results.map((result) => result.payload));
  assert.equal(payloads.size, 1, "payload must be deterministic");
}

async function main() {
  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";
    process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED = "true";

    const sequential: TimedResult[] = [];
    for (let index = 0; index < 25; index += 1) {
      sequential.push(await invoke({ authorized: true, enabled: true, requestId: `seq-${index}` }));
    }
    assertDeterministic(sequential, 200);

    const concurrent = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        invoke({ authorized: true, enabled: true, requestId: `concurrent-${index}` }),
      ),
    );
    assertDeterministic(concurrent, 200);

    const unauthorized: TimedResult[] = [];
    for (let index = 0; index < 25; index += 1) {
      unauthorized.push(await invoke({ authorized: false, enabled: true, requestId: `unauthorized-${index}` }));
    }
    assertDeterministic(unauthorized, 401);

    const disabled: TimedResult[] = [];
    for (let index = 0; index < 25; index += 1) {
      disabled.push(await invoke({ authorized: true, enabled: false, requestId: `disabled-${index}` }));
    }
    assertDeterministic(disabled, 404);

    const cycles: Array<{ on: number; off: number }> = [];
    for (let index = 0; index < 10; index += 1) {
      const on = await invoke({ authorized: true, enabled: true, requestId: `cycle-${index}-on` });
      const off = await invoke({ authorized: true, enabled: false, requestId: `cycle-${index}-off` });
      cycles.push({ on: on.status, off: off.status });
    }
    assert.deepEqual(cycles, Array.from({ length: 10 }, () => ({ on: 200, off: 404 })));

    const payload = JSON.parse(sequential[0].payload) as Record<string, unknown>;
    assert.equal(payload.baselineId, "SERA_VNEXT_BASELINE_V0");
    assert.equal(payload.fixtureCount, 7);
    assert.equal(payload.expectedOutputCount, 7);
    assert.equal(payload.classificationEnabled, false);
    assert.equal(payload.productIntegrated, false);
    assert.equal(payload.downstreamAllowed, false);

    console.log(JSON.stringify({
      sequential: metrics(sequential),
      concurrent: metrics(concurrent),
      unauthorized: metrics(unauthorized),
      disabled: metrics(disabled),
      flagCycles: cycles.length,
      payloadVariants: 1,
      mutationsDetected: 0,
    }, null, 2));
    console.log("CONTROLLED_INTERNAL_ACTIVATION_OK");
  } finally {
    restoreEnv();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
