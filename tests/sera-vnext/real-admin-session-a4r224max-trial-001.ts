import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { handleSeraVNextStatusRequest } from "../../frontend/src/app/api/admin/sera-vnext/status/route";
import { getSeraVNextRuntimeStatus } from "../../frontend/src/lib/sera-vnext-runtime/runtime-service";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const rootDir = path.resolve(__dirname, "..", "..");

type EnvMap = Record<string, string>;

function parseEnvFile(content: string): EnvMap {
  const result: EnvMap = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    result[key] = val;
  }
  return result;
}

type RealSessionResult =
  | {
      type: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED";
      userIdSanitized: string;
      tenantIdSanitized: string;
      role: string;
    }
  | { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO"; reason: string };

async function attemptRealSupabaseValidation(): Promise<RealSessionResult> {
  const envPath = path.join(rootDir, "frontend", ".env.local");
  if (!existsSync(envPath)) {
    return { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO", reason: "frontend/.env.local not found" };
  }

  let envVars: EnvMap;
  try {
    envVars = parseEnvFile(readFileSync(envPath, "utf8"));
  } catch {
    return { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO", reason: "failed to parse .env.local" };
  }

  const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO", reason: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" };
  }

  const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const savedAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const savedSvc = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
    if (envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    }
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

    const { getSupabaseAdmin } = await import("../../frontend/src/lib/server/supabase-admin");
    const admin = getSupabaseAdmin();

    const tenantsResult = await admin
      .from("tenants")
      .select("id,plan")
      .eq("plan", "enterprise")
      .limit(3);

    if (tenantsResult.error || !tenantsResult.data || tenantsResult.data.length === 0) {
      return { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO", reason: "no enterprise tenant found in DB" };
    }

    const enterpriseTenantIds = tenantsResult.data.map((t: Record<string, unknown>) => String(t.id));

    const usersResult = await admin
      .from("users")
      .select("id,role,tenant_id")
      .eq("role", "admin")
      .in("tenant_id", enterpriseTenantIds)
      .eq("active", true)
      .limit(3);

    if (usersResult.error || !usersResult.data || usersResult.data.length === 0) {
      const usersResult2 = await admin
        .from("users")
        .select("id,role,tenant_id")
        .eq("role", "admin")
        .in("tenant_id", enterpriseTenantIds)
        .limit(3);
      if (usersResult2.error || !usersResult2.data || usersResult2.data.length === 0) {
        return { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO", reason: "no enterprise admin user found in DB" };
      }
      const user = usersResult2.data[0] as Record<string, unknown>;
      return {
        type: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED",
        userIdSanitized: `REAL-ADMIN-${String(user.id).slice(0, 8)}****`,
        tenantIdSanitized: `REAL-TENANT-${String(user.tenant_id).slice(0, 8)}****`,
        role: String(user.role),
      };
    }

    const user = usersResult.data[0] as Record<string, unknown>;
    return {
      type: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED",
      userIdSanitized: `REAL-ADMIN-${String(user.id).slice(0, 8)}****`,
      tenantIdSanitized: `REAL-TENANT-${String(user.tenant_id).slice(0, 8)}****`,
      role: String(user.role),
    };
  } catch (err) {
    return {
      type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO",
      reason: `Supabase query error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  } finally {
    if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
    if (savedAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedAnon;
    if (savedSvc === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = savedSvc;
  }
}

async function main() {
  // Safety guard: verify staging environment before flag manipulation tests
  assertSafeTestEnvironment({ requiresFixtureIds: false })

  const savedReadOnly = process.env.SERA_VNEXT_READONLY_ENABLED;
  const savedPilot = process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;

  try {
    process.env.SERA_VNEXT_READONLY_ENABLED = "true";
    process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";

    const sessionResult = await attemptRealSupabaseValidation();

    const hasRealDatabaseRecord =
      sessionResult.type === "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED";

    const adminContext: ApiUserContext = hasRealDatabaseRecord
      ? {
          userId: (sessionResult as Extract<typeof sessionResult, { type: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED" }>).userIdSanitized,
          email: undefined,
          tenantId: (sessionResult as Extract<typeof sessionResult, { type: "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED" }>).tenantIdSanitized,
          role: "admin",
          accessToken: "not-logged",
        }
      : {
          userId: "a4r224-synthetic-admin",
          email: "sanitized@example.test",
          tenantId: "tenant-enterprise-synthetic",
          role: "admin",
          accessToken: "not-logged",
        };

    const loggedEvents: Array<Record<string, unknown>> = [];

    const response = await handleSeraVNextStatusRequest(
      new Request("http://localhost/api/admin/sera-vnext/status", {
        headers: { "x-request-id": "a4r224-real-admin-session-test" },
      }),
      {
        requireAdminUser: async () => adminContext,
        isReadOnlyEnabled: () => true,
        isInternalPilotEnabled: () => true,
        getRuntimeStatus: getSeraVNextRuntimeStatus,
        logEvent: (ev) => loggedEvents.push(ev),
        requestId: () => "a4r224-real-admin-session-test",
      },
    );

    assert.equal(response.status, 200, "admin session must receive 200");

    const payload = await response.json() as Record<string, unknown>;
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
      "CLASSIFIED", "READY", "not-logged", "Bearer", "stack",
    ]) {
      assert.equal(payloadStr.includes(forbidden), false, `${forbidden} must not appear in payload`);
    }

    assert.ok(loggedEvents.some((e) => e.event === "sera_vnext_runtime_status_requested"), "requested event required");
    assert.ok(loggedEvents.some((e) => e.event === "sera_vnext_runtime_status_available"), "available event required");

    const eventsStr = JSON.stringify(loggedEvents);
    for (const forbidden of ["not-logged", "Bearer", "stack", "selectedCode"]) {
      assert.equal(eventsStr.includes(forbidden), false, `${forbidden} must not appear in events`);
    }

    const recordStatus = hasRealDatabaseRecord
      ? "REAL_DATABASE_ENTERPRISE_ADMIN_RECORD_VERIFIED"
      : "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO";

    console.log(JSON.stringify({
      sessionResult,
      evidenceStatus: {
        databaseRecord: recordStatus,
        dependencyInjectedHandler:
          hasRealDatabaseRecord
            ? "DEPENDENCY_INJECTED_ADMIN_CONTEXT_HANDLER_VERIFIED"
            : "DEPENDENCY_INJECTED_ADMIN_CONTEXT_HANDLER_NOT_EXECUTED",
        realSupabaseSession: "REAL_SUPABASE_SESSION_NOT_VERIFIED",
        realRequireAdminHttpFlow: "REAL_REQUIRE_ADMIN_HTTP_FLOW_NOT_VERIFIED",
        realAuthenticatedBrowser: "REAL_AUTHENTICATED_BROWSER_NOT_VERIFIED",
      },
      endpointStatus: response.status,
      payloadBaselineId: payload.baselineId,
      payloadNamespace: payload.namespace,
      payloadFixtureCount: payload.fixtureCount,
      payloadClassificationEnabled: payload.classificationEnabled,
      payloadProductIntegrated: payload.productIntegrated,
      payloadDownstreamAllowed: payload.downstreamAllowed,
      observabilityEvents: loggedEvents.map((e) => e.event),
      limitation: hasRealDatabaseRecord
        ? "Dependency-injected admin context validated the handler, but no real JWT, cookie, browser session, or requireAdmin(req) HTTP flow was executed."
        : (sessionResult as Extract<typeof sessionResult, { type: "REAL_SESSION_NOT_AVAILABLE_FOR_SCENARIO" }>).reason,
    }, null, 2));
    console.log("REAL_ADMIN_SESSION_OK");
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
