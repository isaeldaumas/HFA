/**
 * Offline concurrency and fail-closed tests for the per-HTTP-request LLM scope.
 * No network or real API provider credentials. All synthetic test keys.
 */
import assert from 'node:assert/strict'
import { getScopedAiSettings, withRequestAiSettings } from '../../../frontend/src/lib/server/ai-request-scope'
import { getActiveProvider, getModelName, assertLlmEnvConfigured } from '../../../frontend/src/lib/sera/llm'
import { withUserAiSettings, resolveUserAiSettings } from '../../../frontend/src/lib/server/user-ai-settings'
import { readFileSync } from 'node:fs'
import path from 'node:path'

async function main() {
const before = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
}
const KEY_A = 'sk-' + 'a'.repeat(40)
const KEY_B = 'AIza' + 'b'.repeat(39)
const contextA = {
  provider: 'openai' as const,
  models: { openai: 'private-model-alpha' },
  apiKeys: { openai: KEY_A },
}
const contextB = {
  provider: 'google' as const,
  models: { google: 'private-model-bravo' },
  apiKeys: { google: KEY_B },
}
assert.equal(getScopedAiSettings(), undefined)
const wait = () => new Promise(resolve => setTimeout(resolve, 1))
const checks = await Promise.all([
  withRequestAiSettings(contextA, async () => {
    assert.equal(getActiveProvider(), 'openai')
    assert.equal(getModelName(), 'private-model-alpha')
    assertLlmEnvConfigured()
    assert.equal(getScopedAiSettings()?.apiKeys.openai, KEY_A)
    assert.equal(getScopedAiSettings()?.apiKeys.google, undefined)
    await wait()
    assert.equal(getActiveProvider(), 'openai')
    assert.equal(getScopedAiSettings()?.apiKeys.google, undefined)
    return 'ALPHA_CONTAINED'
  }),
  withRequestAiSettings(contextB, async () => {
    assert.equal(getActiveProvider(), 'google')
    assert.equal(getModelName(), 'private-model-bravo')
    assertLlmEnvConfigured()
    assert.equal(getScopedAiSettings()?.apiKeys.google, KEY_B)
    assert.equal(getScopedAiSettings()?.apiKeys.openai, undefined)
    await wait()
    assert.equal(getActiveProvider(), 'google')
    assert.equal(getScopedAiSettings()?.apiKeys.openai, undefined)
    return 'BRAVO_CONTAINED'
  }),
])
assert.deepEqual(checks, ['ALPHA_CONTAINED', 'BRAVO_CONTAINED'])
assert.equal(getScopedAiSettings(), undefined, 'Scope cannot leak after callback returns')

// Even if a server-wide key happens to exist, it MUST NOT be a fallback inside
// a scoped user request that has no key for the selected provider.
withRequestAiSettings({ provider: 'openai', models: {}, apiKeys: {} }, () => {
  assert.throws(() => assertLlmEnvConfigured(), /OPENAI_API_KEY/)
})
withRequestAiSettings(contextA, () => {
  assert.equal(getActiveProvider(), 'openai')
  withRequestAiSettings(contextB, () => assert.equal(getActiveProvider(), 'google'))
  assert.equal(getActiveProvider(), 'openai', 'Nested scopes restore parent')
})

type DbResult = { data?: unknown; error?: unknown }
class FakeAiAdmin {
  constructor(
    readonly global: Record<string, string>,
    readonly users: Record<string, Record<string, unknown>>,
    readonly failUser = false,
    readonly missingSystemSettings = false,
  ) {}
  from(table: string) {
    const db = this
    return {
      select(_fields: string) {
        if (table === 'system_settings') {
          if (db.missingSystemSettings) {
            return Promise.resolve({ data: null, error: { code: 'PGRST205' } } as DbResult)
          }
          return Promise.resolve({ data: Object.entries(db.global).map(([key, value]) => ({ key, value })), error: null } as DbResult)
        }
        if (table !== 'ai_settings') throw new Error('Unexpected table')
        return {
          eq(field: string, id: string) {
            assert.equal(field, 'user_id')
            return {
              maybeSingle: async () => db.failUser
                ? { data: null, error: { code: 'DB_TIMEOUT' } }
                : { data: db.users[id] ?? null, error: null },
            }
          },
        }
      },
    }
  }
}
const adminA = new FakeAiAdmin(
  { ai_provider: 'openai', openai_api_key: KEY_A, openai_model: 'org-alpha-model' },
  { 'auth-a': { active_provider: 'openai' } },
)
const adminB = new FakeAiAdmin(
  { ai_provider: 'google', google_api_key: KEY_B, google_model: 'org-bravo-model' },
  { 'auth-b': { active_provider: 'google' } },
)
const resolvedA = await resolveUserAiSettings(adminA as never, 'auth-a')
assert.equal(resolvedA.provider, 'openai')
assert.equal(resolvedA.apiKeys.openai, KEY_A)
const resolvedB = await resolveUserAiSettings(adminB as never, 'auth-b')
assert.equal(resolvedB.provider, 'google')
assert.equal(resolvedB.apiKeys.google, KEY_B)

const liveLike = await Promise.all([
  withUserAiSettings(adminA as never, 'auth-a', async () => {
    await wait()
    assert.equal(getActiveProvider(), 'openai')
    assert.equal(getModelName(), 'org-alpha-model')
    assert.equal(getScopedAiSettings()?.apiKeys.google, undefined)
    return 'tenant-a'
  }),
  withUserAiSettings(adminB as never, 'auth-b', async () => {
    await wait()
    assert.equal(getActiveProvider(), 'google')
    assert.equal(getModelName(), 'org-bravo-model')
    assert.equal(getScopedAiSettings()?.apiKeys.openai, undefined)
    return 'tenant-b'
  }),
])
assert.deepEqual(liveLike, ['tenant-a', 'tenant-b'])
assert.equal(getScopedAiSettings(), undefined)

// Read-only schema check in HFA found no public.system_settings table;
 // the loader must preserve the deployment/env fallback without inventing
 // an AI key or treating PGRST205 as a tenant identity.
const systemSettingsAbsent = new FakeAiAdmin({}, {}, false, true)
const fallbackResolved = await resolveUserAiSettings(systemSettingsAbsent as never, 'auth-a')
assert.ok(fallbackResolved.provider)
assert.equal(getScopedAiSettings(), undefined)

const dbFailed = new FakeAiAdmin({}, {}, true)
let ran = false
await assert.rejects(
  withUserAiSettings(dbFailed as never, 'auth-a', async () => { ran = true }),
  /USER_AI_SETTINGS_UNAVAILABLE/,
)
assert.equal(ran, false, 'Do not enter LLM code with ambiguous failed key lookup')

const keysAfter = {
  AI_PROVIDER: process.env.AI_PROVIDER,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
}
assert.deepEqual(keysAfter, before, 'Provider and key environment MUST remain unchanged')
const ROOT = path.resolve(__dirname, '../../..')
const loader = readFileSync(path.join(ROOT, 'frontend/src/lib/server/user-ai-settings.ts'), 'utf8')
assert.doesNotMatch(loader, /process\.env(?:\.[A-Z_]+|\[[^\]]+\])\s*=/)
for (const file of [
  'frontend/src/app/api/events/route.ts',
  'frontend/src/app/api/analyze/route.ts',
  'frontend/src/app/api/org/ai-insight/route.ts',
  'frontend/src/app/api/events/[eventId]/reanalyze-vnext/route.ts',
]) {
  const src = readFileSync(path.join(ROOT, file), 'utf8')
  assert.match(src, /with(?:Optional)?UserAiSettings\(/)
  assert.doesNotMatch(src, /applyUserAiSettingsToEnv/)
}
console.log('AI_ASYNC_REQUEST_ISOLATION_PASS', {
  concurrentTenants: 2,
  checkedRoutes: 4,
  leakedProcessEnvKeys: false,
  unconfiguredScopeFailsClosed: true,
  liveProviderCalls: 'NOT_RUN',
})

}
main().catch(error => { console.error(error); process.exitCode = 1 })
