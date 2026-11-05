/**
 * Server-only per-request AI configuration. Unlike process.env mutations,
 * AsyncLocalStorage isolates overlapping asynchronous request lifetimes.
 *
 * All secrets are stored in the current async scope; never log or serialize
 * them. An active scope must NEVER fall back to process.env at the LLM layer:
 * defaults are fully resolved by user-ai-settings.ts before this scope starts.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export type RequestAiProvider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'groq'
export type RequestAiSettings = Readonly<{
  provider: RequestAiProvider
  models: Readonly<Partial<Record<RequestAiProvider, string>>>
  apiKeys: Readonly<Partial<Record<RequestAiProvider, string>>>
}>

const store = new AsyncLocalStorage<RequestAiSettings>()

export function getScopedAiSettings(): RequestAiSettings | undefined {
  return store.getStore()
}

export function withRequestAiSettings<T>(settings: RequestAiSettings, fn: () => T): T {
  const snapshot: RequestAiSettings = Object.freeze({
    provider: settings.provider,
    models: Object.freeze({ ...settings.models }),
    apiKeys: Object.freeze({ ...settings.apiKeys }),
  })
  return store.run(snapshot, fn)
}
