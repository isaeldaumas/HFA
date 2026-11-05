import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptString } from '@/lib/server/ai-settings-crypto'
import { assertLlmEnvConfigured } from '@/lib/sera/llm'
import {
  withRequestAiSettings,
  type RequestAiProvider,
  type RequestAiSettings,
} from './ai-request-scope'

const PROVIDERS: readonly RequestAiProvider[] = ['deepseek', 'openai', 'anthropic', 'google', 'groq']
const KEY_ENV: Record<RequestAiProvider, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
}
const MODEL_ENV: Record<RequestAiProvider, string> = {
  deepseek: 'DEEPSEEK_MODEL',
  openai: 'OPENAI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
  google: 'GOOGLE_MODEL',
  groq: 'GROQ_MODEL',
}
const DEFAULT_MODELS: Record<RequestAiProvider, string> = {
  deepseek: 'deepseek-reasoner',
  openai: 'gpt-6-luna',
  anthropic: 'claude-sonnet-4-5',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.3-70b-versatile',
}

function parseProvider(value: unknown): RequestAiProvider {
  const text = String(value ?? '').trim().toLowerCase()
  return (PROVIDERS as readonly string[]).includes(text) ? text as RequestAiProvider : 'deepseek'
}

function isPlausibleKey(provider: RequestAiProvider, key: string): boolean {
  const minLen = provider === 'google' ? 20 : 32
  if (!key || key.length < minLen || !/^[\x21-\x7E]+$/.test(key) || key.includes('****')) return false
  if (provider === 'google') return true
  if (provider === 'groq') return key.startsWith('gsk_') || key.startsWith('sk-')
  return key.startsWith('sk-')
}

function notFoundTable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' &&
    (error as { code?: string }).code === 'PGRST205')
}

/**
 * Resolve global deployment settings, platform defaults, then the requesting
 * user's own encrypted key. This function does not mutate process.env.
 *
 * Service-role user lookup must be bound to the authenticated auth.users.id.
 * If the configuration storage is temporarily unavailable (not missing),
 * fail closed rather than silently bill another user's key.
 */
export async function resolveUserAiSettings(admin: SupabaseClient, authUserId: string): Promise<RequestAiSettings> {
  if (!authUserId.trim()) throw new Error('AI_SETTINGS_AUTH_ID_REQUIRED')
  const globalMap: Record<string, string> = {}
  try {
    const result = await admin.from('system_settings').select('key, value')
    if (result.error && !notFoundTable(result.error)) throw new Error('SYSTEM_AI_SETTINGS_UNAVAILABLE')
    for (const row of result.data ?? []) {
      if (typeof row.key === 'string' && typeof row.value === 'string') {
        globalMap[row.key] = row.value
      }
    }
  } catch {
    throw new Error('SYSTEM_AI_SETTINGS_UNAVAILABLE')
  }

  const models: Partial<Record<RequestAiProvider, string>> = {}
  const apiKeys: Partial<Record<RequestAiProvider, string>> = {}
  for (const provider of PROVIDERS) {
    models[provider] =
      globalMap[provider + '_model']?.trim() ||
      process.env[MODEL_ENV[provider]]?.trim() ||
      DEFAULT_MODELS[provider]
    const systemKey = globalMap[provider + '_api_key']?.trim()
    const deployedKey = process.env[KEY_ENV[provider]]?.trim()
    const fallback = provider === 'google'
      ? (process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || '')
      : ''
    const candidate = (systemKey && isPlausibleKey(provider, systemKey) ? systemKey : '') ||
      (deployedKey && isPlausibleKey(provider, deployedKey) ? deployedKey : '') ||
      (fallback && isPlausibleKey(provider, fallback) ? fallback : '')
    if (candidate) apiKeys[provider] = candidate
  }
  const activeGlobal = parseProvider(globalMap.ai_provider || process.env.AI_PROVIDER)

  let userRow: Record<string, unknown> | null = null
  try {
    const response = await admin
      .from('ai_settings')
      .select('active_provider, deepseek_api_key, openai_api_key, anthropic_api_key, google_api_key, groq_api_key')
      .eq('user_id', authUserId)
      .maybeSingle()
    if (response.error && !notFoundTable(response.error)) throw new Error('USER_AI_SETTINGS_UNAVAILABLE')
    userRow = response.data as Record<string, unknown> | null
  } catch {
    throw new Error('USER_AI_SETTINGS_UNAVAILABLE')
  }

  const active = userRow?.active_provider ? parseProvider(userRow.active_provider) : activeGlobal
  if (userRow) {
    for (const provider of PROVIDERS) {
      const encrypted = userRow[provider + '_api_key']
      if (typeof encrypted !== 'string' || !encrypted) continue
      let decrypted: string
      try {
        decrypted = decryptString(encrypted).trim()
      } catch {
        throw new Error('USER_AI_CREDENTIAL_UNAVAILABLE')
      }
      if (!isPlausibleKey(provider, decrypted)) throw new Error('USER_AI_CREDENTIAL_INVALID')
      apiKeys[provider] = decrypted
    }
  }
  return { provider: active, models, apiKeys }
}

/** Resolve and run the complete LLM operation within one async request scope. */
export async function withUserAiSettings<T>(
  admin: SupabaseClient,
  authUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const scoped = await resolveUserAiSettings(admin, authUserId)
  return withRequestAiSettings(scoped, async () => {
    assertLlmEnvConfigured(scoped.provider)
    return fn()
  })
}

/** Retains the provider-free deterministic replay path for engine refreshes. */
export async function withOptionalUserAiSettings<T>(
  admin: SupabaseClient,
  authUserId: string,
  requiresLlm: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  if (!requiresLlm) return fn()
  return withUserAiSettings(admin, authUserId, fn)
}
