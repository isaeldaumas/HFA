import { NextResponse } from 'next/server'
import { requireAdmin, jsonError, maskSensitive, isMasked } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { decryptString, encryptString } from '@/lib/server/ai-settings-crypto'

const SENSITIVE = new Set([
  'stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret',
  'anthropic_api_key', 'openai_api_key', 'google_api_key', 'groq_api_key', 'deepseek_api_key',
])

const ENV_DEFAULTS: Record<string, string> = {
  ai_provider: process.env.AI_PROVIDER ?? 'deepseek',
  deepseek_model: process.env.DEEPSEEK_MODEL ?? 'deepseek-reasoner',
  openai_model: process.env.OPENAI_MODEL ?? 'gpt-6-luna',
  anthropic_model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  google_model: process.env.GOOGLE_MODEL ?? 'gemini-2.0-flash',
  groq_model: process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
}

const SENSITIVE_ENV_KEYS: Record<string, string> = {
  anthropic_api_key: process.env.ANTHROPIC_API_KEY ?? '',
  openai_api_key: process.env.OPENAI_API_KEY ?? '',
  google_api_key: process.env.GOOGLE_API_KEY ?? '',
  groq_api_key: process.env.GROQ_API_KEY ?? '',
  deepseek_api_key: process.env.DEEPSEEK_API_KEY ?? '',
  stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
  stripe_secret_key: process.env.STRIPE_SECRET_KEY ?? '',
  stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
}

function normalizeSettingValue(key: string, value: unknown): string {
  const raw = value == null ? '' : String(value)
  return SENSITIVE.has(key) ? raw.trim() : raw
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    return String(record.message || record.details || record.hint || JSON.stringify(record))
  }
  return String(error)
}

function isMissingSystemSettings(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'PGRST205'
  )
}

export async function GET(req: Request) {
  try {
    const user = await requireAdmin(req)
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('system_settings').select('key, value')
    if (error && !isMissingSystemSettings(error)) throw error

    const result: Record<string, unknown> = {}
    if (error && isMissingSystemSettings(error)) {
      const { data: aiRow, error: aiError } = await admin
        .from('ai_settings')
        .select('active_provider, deepseek_api_key, openai_api_key, anthropic_api_key, google_api_key, groq_api_key')
        .eq('user_id', user.userId)
        .maybeSingle()
      if (aiError) throw aiError
      if (aiRow?.active_provider) result.ai_provider = String(aiRow.active_provider)
      for (const key of ['deepseek_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'groq_api_key']) {
        const enc = aiRow?.[key as keyof typeof aiRow]
        if (typeof enc !== 'string' || !enc) continue
        result[key] = maskSensitive(decryptString(enc))
      }
    } else {
      for (const row of data ?? []) {
        const key = String(row.key)
        const value = String(row.value ?? '')
        result[key] = SENSITIVE.has(key) ? maskSensitive(value) : value
      }
    }

    for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
      if (result[key] == null || result[key] === '') result[key] = value
    }

    for (const [key, value] of Object.entries(SENSITIVE_ENV_KEYS)) {
      if ((result[key] == null || result[key] === '') && value) {
        result[key] = maskSensitive(value)
      }
    }

    result.env = {
      app_env: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
      api_url: process.env.NEXT_PUBLIC_API_URL ?? '',
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      ai_provider: process.env.AI_PROVIDER ?? '',
      deepseek_model: process.env.DEEPSEEK_MODEL ?? '',
      openai_model: process.env.OPENAI_MODEL ?? '',
      anthropic_model: process.env.ANTHROPIC_MODEL ?? '',
      google_model: process.env.GOOGLE_MODEL ?? '',
      groq_model: process.env.GROQ_MODEL ?? '',
      allow_origin_regex: process.env.ALLOWED_ORIGIN_REGEX ?? '',
      allowed_origins: process.env.ALLOWED_ORIGINS ?? '',
      anthropic_key_set: Boolean(process.env.ANTHROPIC_API_KEY),
      openai_key_set: Boolean(process.env.OPENAI_API_KEY),
      google_key_set: Boolean(process.env.GOOGLE_API_KEY),
      groq_key_set: Boolean(process.env.GROQ_API_KEY),
      deepseek_key_set: Boolean(process.env.DEEPSEEK_API_KEY),
    }

    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(formatError(e), 500)
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAdmin(req)
    const body = await req.json() as Record<string, unknown>
    const updates = (body.updates && typeof body.updates === 'object')
      ? body.updates as Record<string, unknown>
      : body

    const admin = getSupabaseAdmin()
    let systemSettingsMissing = false

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'env') continue
      const raw = normalizeSettingValue(key, value)
      if (isMasked(raw)) continue
      const { error } = await admin.from('system_settings').upsert(
        { key, value: raw },
        { onConflict: 'key' }
      )
      if (error && isMissingSystemSettings(error)) {
        systemSettingsMissing = true
        break
      }
      if (error) throw error
    }

    if (systemSettingsMissing) {
      const payload: Record<string, unknown> = { user_id: user.userId }
      const provider = updates.ai_provider
      if (provider) payload.active_provider = String(provider)
      for (const key of ['deepseek_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'groq_api_key']) {
        if (!(key in updates)) continue
        const raw = normalizeSettingValue(key, updates[key])
        if (isMasked(raw)) continue
        payload[key] = raw ? encryptString(raw) : null
      }
      const { error } = await admin.from('ai_settings').upsert(payload, { onConflict: 'user_id' })
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(formatError(e), 500)
  }
}
