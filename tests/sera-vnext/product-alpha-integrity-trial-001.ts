import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { handleSeraVNextCandidateRequest } from "../../frontend/src/app/api/admin/sera-vnext/candidate/handler";
import { analyzeSeraVNextCandidateOnly } from "../../frontend/src/lib/sera-vnext-runtime";
import type { ApiUserContext } from "../../frontend/src/lib/server/api-auth";

const rootDir = path.resolve(__dirname, "..", "..");
const protectedDirectories = [
  "tests/sera-vnext/baselines",
  "tests/sera-vnext/fixtures",
  "tests/sera-vnext/fixture-sets",
  "tests/sera-vnext/baseline-candidates",
];

const adminUser: ApiUserContext = {
  userId: "a4r225-admin",
  email: "admin@example.test",
  tenantId: "tenant-enterprise-a4r225",
  role: "admin",
  accessToken: "must-not-be-logged",
};

function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function listFiles(relativeDirectory: string): string[] {
  const absoluteDirectory = path.join(rootDir, relativeDirectory);
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? listFiles(relativePath) : [relativePath];
    })
    .sort();
}

function snapshot(): Record<string, string> {
  const files = protectedDirectories.flatMap((directory) => listFiles(directory));
  return Object.fromEntries(
    files.map((relativePath) => [
      relativePath,
      sha256(readFileSync(path.join(rootDir, relativePath))),
    ]),
  );
}

async function main() {
  const before = snapshot();

  const narrative =
    "During approach the crew noticed a warning, continued descent, and the aircraft later struck terrain causing damage.";
  for (let index = 0; index < 10; index += 1) {
    const result = analyzeSeraVNextCandidateOnly({
      input: { eventText: narrative, clientRequestId: `direct-${index}` },
      requestId: `req-${index}`,
    });
    assert.equal(result.persisted, false);
  }

  for (let index = 0; index < 10; index += 1) {
    const response = await handleSeraVNextCandidateRequest(
      new Request("http://localhost/api/admin/sera-vnext/candidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventText: narrative, clientRequestId: `route-${index}` }),
      }),
      {
        requireAdminUser: async () => adminUser,
        isReadOnlyEnabled: () => true,
        isInternalPilotEnabled: () => true,
        isCandidateOnlyEnabled: () => true,
        logEvent: () => undefined,
        requestId: () => `route-${index}`,
      },
    );
    assert.equal(response.status, 200);
  }

  const after = snapshot();
  assert.deepEqual(after, before, "protected baseline artifacts must remain byte-identical");

  const candidateRuntimeFiles = listFiles("frontend/src/lib/sera-vnext-runtime/candidate-only");
  for (const relativePath of candidateRuntimeFiles) {
    const source = readFileSync(path.join(rootDir, relativePath), "utf8");
    for (const forbidden of ["writeFile", "appendFile", "rmSync", "unlinkSync", "createClient", "supabase", "fetch("]) {
      assert.equal(source.includes(forbidden), false, `${relativePath}: forbidden dependency ${forbidden}`);
    }
  }

  console.log(JSON.stringify({ protectedArtifacts: Object.keys(before).length }, null, 2));
  console.log("INTEGRITY_OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
