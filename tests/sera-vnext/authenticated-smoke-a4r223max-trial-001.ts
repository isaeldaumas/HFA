import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/handler";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const rootDir = path.resolve(__dirname, "..", "..");
const originalReadOnlyFlag = process.env.SERA_VNEXT_READONLY_ENABLED;

const authorizedAdmin: ApiUserContext = {
  userId: "authorized-admin",
  email: "sanitized-admin@example.test",
  tenantId: "tenant-enterprise-sanitized",
  role: "admin",
  accessToken: "secret-test-token",
};

type AuthCase = {
  actor: string;
  authenticated: boolean;
  role: string;
  tenant: string;
  expectedStatus: number;
  authorize: () => Promise<ApiUserContext>;
};

function authError(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const cases: AuthCase[] = [
  {
    actor: "no_token",
    authenticated: false,
    role: "none",
    tenant: "none",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    actor: "invalid_token",
    authenticated: false,
    role: "none",
    tenant: "none",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    actor: "authenticated_non_admin",
    authenticated: true,
    role: "member",
    tenant: "enterprise",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    actor: "admin_wrong_tenant_plan",
    authenticated: true,
    role: "admin",
    tenant: "non_enterprise",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    actor: "authorized_admin",
    authenticated: true,
    role: "admin",
    tenant: "enterprise",
    expectedStatus: 200,
    authorize: async () => authorizedAdmin,
  },
  {
    actor: "expired_token",
    authenticated: false,
    role: "none",
    tenant: "none",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    actor: "disabled_user",
    authenticated: false,
    role: "disabled",
    tenant: "enterprise",
    expectedStatus: 401,
    authorize: async () => { throw authError(401, "Não autorizado"); },
  },
  {
    actor: "session_without_tenant",
    authenticated: true,
    role: "admin",
    tenant: "none",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
  {
    actor: "tenant_mismatch",
    authenticated: true,
    role: "admin",
    tenant: "divergent",
    expectedStatus: 403,
    authorize: async () => { throw authError(403, "Acesso restrito a administradores enterprise"); },
  },
];

async function main() {
  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    const matrix: Array<Record<string, unknown>> = [];
    const events: Array<Record<string, unknown>> = [];

    for (const testCase of cases) {
      const request = new Request(
        `http://localhost/api/admin/sera-vnext/status?role=admin&tenant=enterprise&actor=${testCase.actor}`,
        {
          headers: {
            "x-role": "admin",
            "x-tenant-id": "tenant-enterprise-untrusted",
            "x-request-id": `a4r223-${testCase.actor}`,
          },
        },
      );
      const response = await handleSeraVNextStatusRequest(request, {
        requireAdminUser: testCase.authorize,
        isReadOnlyEnabled: () => true,
        isInternalPilotEnabled: () => true,
        getRuntimeStatus: getSeraVNextRuntimeStatus,
        logEvent: (event) => events.push(event),
        now: () => 100,
      });
      assert.equal(response.status, testCase.expectedStatus, testCase.actor);
      matrix.push({
        actor: testCase.actor,
        authenticated: testCase.authenticated,
        role: testCase.role,
        tenant: testCase.tenant,
        flagState: "on",
        expectedStatus: testCase.expectedStatus,
        actualStatus: response.status,
        passFail: "PASS",
      });

      if (response.status === 200) {
        const payload = await response.json() as Record<string, unknown>;
        assert.deepEqual({
          baselineId: payload.baselineId,
          namespace: payload.namespace,
          fixtureCount: payload.fixtureCount,
          expectedOutputCount: payload.expectedOutputCount,
          positiveFixtureCount: payload.positiveFixtureCount,
          syntheticFixtureCount: payload.syntheticFixtureCount,
          controlFixtureCount: payload.controlFixtureCount,
          classificationEnabled: payload.classificationEnabled,
          productIntegrated: payload.productIntegrated,
          downstreamAllowed: payload.downstreamAllowed,
        }, {
          baselineId: "SERA_VNEXT_BASELINE_V0",
          namespace: "sera-vnext",
          fixtureCount: 7,
          expectedOutputCount: 7,
          positiveFixtureCount: 3,
          syntheticFixtureCount: 1,
          controlFixtureCount: 3,
          classificationEnabled: false,
          productIntegrated: false,
          downstreamAllowed: false,
        });
        const serialized = JSON.stringify(payload);
        for (const forbidden of [
          "secret-test-token",
          "selectedCode",
          "releasedCode",
          "finalConclusion",
          "CLASSIFIED",
          "READY",
          "authorization",
          "cookie",
          "stack",
        ]) {
          assert.equal(serialized.includes(forbidden), false, `${forbidden} must not be exposed`);
        }
      }
    }

    const pageSource = readFileSync(
      path.join(rootDir, "frontend/src/app/(dashboard)/admin/sera-vnext/page.tsx"),
      "utf8",
    );
    const adminLayoutSource = readFileSync(
      path.join(rootDir, "frontend/src/app/(dashboard)/admin/layout.tsx"),
      "utf8",
    );
    assert.ok(pageSource.includes("Diagnóstico interno somente leitura"));
    assert.ok(pageSource.includes("Não integrado à classificação"));
    assert.ok(pageSource.includes("available.warnings.map"));
    assert.ok(pageSource.includes("classificationEnabled"));
    assert.ok(pageSource.includes("productIntegrated"));
    assert.ok(pageSource.includes("downstreamAllowed"));
    assert.equal(pageSource.includes("<form"), false);
    assert.equal(pageSource.includes('type="file"'), false);
    assert.equal(pageSource.includes("<button"), false);
    assert.ok(adminLayoutSource.includes("if (!me.isAdmin) return null"), "non-admin page content must be suppressed");
    assert.ok(adminLayoutSource.includes("router.replace('/dashboard')"), "non-admin must be redirected");

    const serializedEvents = JSON.stringify(events);
    for (const eventName of [
      "sera_vnext_runtime_status_requested",
      "sera_vnext_runtime_status_available",
      "sera_vnext_runtime_status_denied",
    ]) {
      assert.ok(serializedEvents.includes(eventName), `${eventName} must be captured`);
    }
    for (const forbidden of ["secret-test-token", "Authorization", "Bearer", "cookie", "stack", "selectedCode", "P/O/A"]) {
      assert.equal(serializedEvents.includes(forbidden), false, `${forbidden} must not be logged`);
    }

    console.log(JSON.stringify({ matrix, capturedEvents: events.length }, null, 2));
    console.log("AUTHENTICATED_SMOKE_OK");
  } finally {
    if (originalReadOnlyFlag === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
    else process.env.SERA_VNEXT_READONLY_ENABLED = originalReadOnlyFlag;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
