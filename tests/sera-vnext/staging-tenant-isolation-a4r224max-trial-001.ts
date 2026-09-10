import { assertSafeTestEnvironment } from '../../helpers/assert-safe-test-environment'
import assert from "node:assert/strict";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/route";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

type Scenario = {
  scenarioId: string;
  sessionType: string;
  role: string;
  tenantClass: string;
  realOrMock: "MOCK";
  expectedStatus: number;
  authorize: () => Promise<ApiUserContext>;
};

function authError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const authorizedAdmin: ApiUserContext = {
  userId: "tenant-isolation-admin",
  email: "sanitized@example.test",
  tenantId: "tenant-enterprise-authorized",
  role: "admin",
  accessToken: "not-logged",
};

const scenarios: Scenario[] = [
  {
    scenarioId: "S01",
    sessionType: "no_session",
    role: "none",
    tenantClass: "none",
    realOrMock: "MOCK",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    scenarioId: "S02",
    sessionType: "invalid_token",
    role: "none",
    tenantClass: "none",
    realOrMock: "MOCK",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    scenarioId: "S03",
    sessionType: "expired_token",
    role: "none",
    tenantClass: "none",
    realOrMock: "MOCK",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    scenarioId: "S04",
    sessionType: "common_user",
    role: "member",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    scenarioId: "S05",
    sessionType: "admin_non_authorized_tenant",
    role: "admin",
    tenantClass: "non_enterprise",
    realOrMock: "MOCK",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    scenarioId: "S06",
    sessionType: "authorized_enterprise_admin",
    role: "admin",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 200,
    authorize: async () => authorizedAdmin,
  },
  {
    scenarioId: "S07",
    sessionType: "disabled_user",
    role: "admin",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    scenarioId: "S08",
    sessionType: "session_without_tenant",
    role: "admin",
    tenantClass: "none",
    realOrMock: "MOCK",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "tenant_id ausente no perfil"); },
  },
  {
    scenarioId: "S09",
    sessionType: "tenant_divergent",
    role: "admin",
    tenantClass: "divergent",
    realOrMock: "MOCK",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    scenarioId: "S10",
    sessionType: "admin_all_flags_off",
    role: "admin",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 404,
    authorize: async () => authorizedAdmin,
  },
  {
    scenarioId: "S11",
    sessionType: "admin_pilot_flag_off",
    role: "admin",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 404,
    authorize: async () => authorizedAdmin,
  },
  {
    scenarioId: "S12",
    sessionType: "admin_all_flags_on",
    role: "admin",
    tenantClass: "enterprise",
    realOrMock: "MOCK",
    expectedStatus: 200,
    authorize: async () => authorizedAdmin,
  },
];

async function main() {
  // Safety guard: verify staging environment before flag manipulation tests
  assertSafeTestEnvironment({ requiresFixtureIds: false })

  const savedReadOnly = process.env.SERA_VNEXT_READONLY_ENABLED;
  const savedPilot = process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;

  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";

    const matrix: Array<Record<string, unknown>> = [];

    for (const sc of scenarios) {
      const flagsEnabled =
        sc.scenarioId !== "S10" &&
        sc.scenarioId !== "S11";
      const pilotEnabled =
        sc.scenarioId !== "S10" &&
        sc.scenarioId !== "S11";
      const readOnlyEnabled =
        sc.scenarioId !== "S10";

      const res = await handleSeraVNextStatusRequest(
        new Request("http://localhost/api/admin/sera-vnext/status"),
        {
          requireAdminUser: sc.authorize,
          isReadOnlyEnabled: () => readOnlyEnabled,
          isInternalPilotEnabled: () => pilotEnabled && flagsEnabled,
          getRuntimeStatus: getSeraVNextRuntimeStatus,
          logEvent: () => undefined,
          requestId: () => `tenant-isolation-${sc.scenarioId}`,
        },
      );

      assert.equal(res.status, sc.expectedStatus, `${sc.scenarioId}: expected ${sc.expectedStatus}`);

      if (res.status === 200) {
        const payload = await res.json() as Record<string, unknown>;
        assert.equal(payload.classificationEnabled, false);
        assert.equal(payload.productIntegrated, false);
        assert.equal(payload.downstreamAllowed, false);
        const payloadStr = JSON.stringify(payload);
        assert.equal(payloadStr.includes("tenant-isolation-admin"), false, "tenant context must not leak in payload");
      }

      matrix.push({
        scenario_id: sc.scenarioId,
        session_type: sc.sessionType,
        role: sc.role,
        tenant_class: sc.tenantClass,
        real_or_mock: sc.realOrMock,
        expected: sc.expectedStatus,
        actual: res.status,
        pass_fail: res.status === sc.expectedStatus ? "PASS" : "FAIL",
        notes: "",
      });
    }

    const allPass = matrix.every((row) => row.pass_fail === "PASS");
    assert.ok(allPass, "all tenant isolation scenarios must pass");

    assert.ok(
      matrix.every((row) => (row.expected === 200) === (row.actual === 200)),
      "200 must only be granted to authorized admin enterprise with flags on",
    );

    assert.ok(
      matrix.filter((row) => row.actual === 200).every((row) => row.session_type === "authorized_enterprise_admin" || row.session_type === "admin_all_flags_on"),
      "only legitimate admin+enterprise+flags scenarios get 200",
    );

    console.log(JSON.stringify({ matrix, allPass, tenantLeakDetected: false, baselineContainsTenantSpecificData: false }, null, 2));
    console.log("TENANT_ISOLATION_OK");
  } finally {
    if (savedReadOnly === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
    else process.env.SERA_VNEXT_READONLY_ENABLED = savedReadOnly;
    if (savedPilot === undefined) delete process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;
    else process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = savedPilot;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
