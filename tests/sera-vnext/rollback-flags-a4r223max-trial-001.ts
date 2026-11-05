import assert from "node:assert/strict";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/handler";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const adminUser: ApiUserContext = {
  userId: "rollback-admin",
  email: "sanitized-admin@example.test",
  tenantId: "tenant-enterprise-sanitized",
  role: "admin",
  accessToken: "not-logged",
};
const originalReadOnlyFlag = process.env.SERA_VNEXT_READONLY_ENABLED;

async function request(readOnly: boolean, pilot: boolean): Promise<{ httpStatus: number; runtimeStatus: string }> {
  const response = await handleSeraVNextStatusRequest(
    new Request("http://localhost/api/admin/sera-vnext/status"),
    {
      requireAdminUser: async () => adminUser,
      isReadOnlyEnabled: () => readOnly,
      isInternalPilotEnabled: () => pilot,
      getRuntimeStatus: getSeraVNextRuntimeStatus,
      logEvent: () => undefined,
      requestId: () => "rollback-request",
    },
  );
  const payload = await response.json() as { status?: string };
  return { httpStatus: response.status, runtimeStatus: payload.status ?? "HIDDEN" };
}

async function main() {
  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    const sequence = [
      { state: "all_on", result: await request(true, true), expectedHttp: 200, expectedRuntime: "AVAILABLE" },
      { state: "pilot_off", result: await request(true, false), expectedHttp: 404, expectedRuntime: "HIDDEN" },
      { state: "all_server_flags_off", result: await request(false, false), expectedHttp: 404, expectedRuntime: "HIDDEN" },
      { state: "readonly_off_pilot_on", result: await request(false, true), expectedHttp: 404, expectedRuntime: "HIDDEN" },
      { state: "restored_controlled", result: await request(true, true), expectedHttp: 200, expectedRuntime: "AVAILABLE" },
    ];

    for (const item of sequence) {
      assert.equal(item.result.httpStatus, item.expectedHttp, `${item.state} HTTP status`);
      assert.equal(item.result.runtimeStatus, item.expectedRuntime, `${item.state} runtime status`);
    }
    console.log(JSON.stringify({
      sequence,
      restartRequiredForServerHandler: false,
      uiDiagnosticsFlagRequiresRebuildOrRestart: true,
      databaseCleanupRequired: false,
      codeRevertExecuted: false,
    }, null, 2));
    console.log("ROLLBACK_OK");
  } finally {
    if (originalReadOnlyFlag === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
    else process.env.SERA_VNEXT_READONLY_ENABLED = originalReadOnlyFlag;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
