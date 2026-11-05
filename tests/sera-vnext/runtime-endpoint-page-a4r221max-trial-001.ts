import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { GET } from "../../frontend/src/app/api/admin/sera-vnext/status/route";

const rootDir = path.resolve(__dirname, "..", "..");

function rel(relativePath: string) {
  return path.join(rootDir, relativePath);
}

const originalReadOnlyFlag = process.env.SERA_VNEXT_READONLY_ENABLED;
const originalInternalPilotFlag = process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;

function restoreEnv() {
  if (originalReadOnlyFlag === undefined) delete process.env.SERA_VNEXT_READONLY_ENABLED;
  else process.env.SERA_VNEXT_READONLY_ENABLED = originalReadOnlyFlag;

  if (originalInternalPilotFlag === undefined) delete process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;
  else process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = originalInternalPilotFlag;
}

async function main() {
  const routeSource = readFileSync(rel("frontend/src/app/api/admin/sera-vnext/status/route.ts"), "utf8");
  const handlerSource = readFileSync(rel("frontend/src/app/api/admin/sera-vnext/status/handler.ts"), "utf8");
  const protectedSource = routeSource + "\n" + handlerSource;
  const pageSource = readFileSync(rel("frontend/src/app/(dashboard)/admin/sera-vnext/page.tsx"), "utf8");
  const layoutSource = readFileSync(rel("frontend/src/app/(dashboard)/admin/layout.tsx"), "utf8");

  assert.ok(handlerSource.includes("requireAdmin") && handlerSource.includes("requireAdminUser"), "endpoint must reuse admin auth guard");
  assert.ok(handlerSource.includes("isSeraVNextReadOnlyEnabled") && handlerSource.includes("isReadOnlyEnabled"), "endpoint must be feature-flagged");
  assert.ok(handlerSource.includes("isSeraVNextInternalPilotEnabled") && handlerSource.includes("isInternalPilotEnabled"), "endpoint must be internal-pilot-flagged");
  assert.ok(handlerSource.includes("no-store"), "endpoint must disable cache");
  assert.ok(routeSource.includes("dynamic = 'force-dynamic'"), "endpoint must be dynamic");
  assert.ok(routeSource.includes("from './handler'"), "public endpoint must delegate to audited handler");
  assert.ok(handlerSource.indexOf("isReadOnlyEnabled()") < handlerSource.indexOf("requireAdminUser(req)"), "flag-off path must not reveal auth details");
  assert.equal(protectedSource.includes("selectedCode"), false, "endpoint must not return selectedCode");
  assert.equal(protectedSource.includes("releasedCode"), false, "endpoint must not return releasedCode");
  assert.equal(protectedSource.includes("finalConclusion"), false, "endpoint must not return finalConclusion");
  assert.equal(protectedSource.includes("writeFile"), false, "endpoint must not write files");
  assert.equal(protectedSource.includes("appendFile"), false, "endpoint must not append files");

  assert.ok(pageSource.includes("NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED"), "page must be diagnostics-flagged");
  assert.ok(pageSource.includes("/api/admin/sera-vnext/status"), "page must call the internal admin endpoint");
  assert.ok(pageSource.includes("Authorization: `Bearer"), "page must use Bearer auth from Supabase session");
  assert.equal(pageSource.includes("<button"), false, "diagnostic page must not expose mutable buttons");
  assert.equal(pageSource.includes("selectedCode"), false, "page must not display selectedCode");
  assert.equal(pageSource.includes("releasedCode"), false, "page must not display releasedCode");
  assert.equal(pageSource.includes("finalConclusion"), false, "page must not display finalConclusion");
  assert.ok(layoutSource.includes("/admin/sera-vnext"), "admin shell must include the diagnostic route only through the flag-gated nav");

  delete process.env.SERA_VNEXT_READONLY_ENABLED;
  delete process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED;
  const flagOffResponse = await GET(new Request("http://localhost/api/admin/sera-vnext/status"));
  assert.equal(flagOffResponse.status, 404, "flag-off endpoint must not reveal feature details");

  process.env.SERA_VNEXT_READONLY_ENABLED = "true";
  process.env.SERA_VNEXT_INTERNAL_PILOT_ENABLED = "true";
  const unauthResponse = await GET(new Request("http://localhost/api/admin/sera-vnext/status"));
  assert.equal(unauthResponse.status, 401, "flag-on endpoint must reject missing auth");

  console.log("A4R221 endpoint/page trial passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restoreEnv);
