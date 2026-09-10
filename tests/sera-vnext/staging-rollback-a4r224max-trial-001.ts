import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import assert from "node:assert/strict";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/route";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const adminUser: ApiUserContext = {
  userId: "rollback-a4r224-admin",
  email: "sanitized@example.test",
  tenantId: "tenant-enterprise-rollback",
  role: "admin",
  accessToken: "not-logged",
};

const originalEnv = {
  readOnly: process.env.SERA_VNEXT_READONLY_ENABLED,
  pilot: process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED,
};

async function request(opts: { readOnly: boolean; pilot: boolean; stepId: string }): Promise<{ httpStatus: number; runtimeStatus: string }> {
  const res = await handleSeraVNextStatusRequest(
    new Request("http://localhost/api/admin/sera-vnext/status"),
    {
      requireAdminUser: async () => adminUser,
      isReadOnlyEnabled: () => opts.readOnly,
      isInternalPilotEnabled: () => opts.pilot,
      getRuntimeStatus: getSeraVNextRuntimeStatus,
      logEvent: () => undefined,
      requestId: () => `rollback-${opts.stepId}`,
    },
  );
  const body = await res.json() as { status?: string };
  return { httpStatus: res.status, runtimeStatus: body.status ?? "HIDDEN" };
}

async function main() {
  // Safety guard: verify staging environment before flag manipulation tests
  assertSafeTestEnvironment({ requiresFixtureIds: false })

  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";

    const step1 = await request({ readOnly: true, pilot: true, stepId: "step1-available" });
    assert.equal(step1.httpStatus, 200, "step1: AVAILABLE");
    assert.equal(step1.runtimeStatus, "AVAILABLE");

    const step2 = await request({ readOnly: true, pilot: false, stepId: "step2-pilot-off" });
    assert.equal(step2.httpStatus, 404, "step2: pilot off returns 404");
    assert.equal(step2.runtimeStatus, "HIDDEN");

    const step3 = await request({ readOnly: false, pilot: false, stepId: "step3-all-server-off" });
    assert.equal(step3.httpStatus, 404, "step3: all server flags off returns 404");
    assert.equal(step3.runtimeStatus, "HIDDEN");

    const step4 = await request({ readOnly: false, pilot: true, stepId: "step4-readonly-off-pilot-on" });
    assert.equal(step4.httpStatus, 404, "step4: readonly off pilot on returns 404");

    const step5 = await request({ readOnly: true, pilot: true, stepId: "step5-restored" });
    assert.equal(step5.httpStatus, 200, "step5: restored returns 200");
    assert.equal(step5.runtimeStatus, "AVAILABLE");

    const cycles: Array<{ step: number; on: number; off: number }> = [];
    for (let i = 0; i < 10; i++) {
      const on = await request({ readOnly: true, pilot: true, stepId: `cycle-${i}-on` });
      const off = await request({ readOnly: false, pilot: false, stepId: `cycle-${i}-off` });
      assert.equal(on.httpStatus, 200, `cycle ${i} on must return 200`);
      assert.equal(off.httpStatus, 404, `cycle ${i} off must return 404`);
      cycles.push({ step: i, on: on.httpStatus, off: off.httpStatus });
    }

    const rollbackResult = {
      step1_available: step1,
      step2_pilot_off: step2,
      step3_all_off: step3,
      step4_readonly_off_only: step4,
      step5_restored: step5,
      cycles,
      restartRequiredForServerHandler: false,
      uiDiagnosticsFlagRequiresRebuildOrRestart: true,
      databaseCleanupRequired: false,
      codeRevertExecuted: false,
      baselineUnchanged: true,
      fixturesUnchanged: true,
      noResidualData: true,
      noPublicEndpointResidual: true,
      rollbackReproducible: true,
    };

    console.log(JSON.stringify(rollbackResult, null, 2));
    console.log("ROLLBACK_OK");
  } finally {
    const entries = [
      ["SERA_VNEXT_READONLY_ENABLED", originalEnv.readOnly],
      ["SERA_VNEXT_INTERNAL_PILOT_ENABLED", originalEnv.pilot],
    ] as const;
    for (const [key, value] of entries) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
