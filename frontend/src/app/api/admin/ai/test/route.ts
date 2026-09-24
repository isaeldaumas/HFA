import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import Groq from 'groq-sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireAdmin, jsonError, isMasked } from '@/lib/server/admin-auth'
import { getSupabaseAdmin } from '@/lib/server/supabase-admin'
import { decryptString } from '@/lib/server/ai-settings-crypto'

type Provider = 'anthropic' | 'openai' | 'google' | 'groq' | 'deepseek'

type TestPayload = Partial<Record<`${Provider}_api_key` | `${Provider}_model`, string>> & {
  ai_provider?: Provider
}

function pickProvider(settingsMap: Record<string, string>): Provider {
  const raw = (settingsMap.ai_provider || process.env.AI_PROVIDER || 'deepseek').toLowerCase()
  if (raw === 'anthropic' || raw === 'openai' || raw === 'google' || raw === 'groq' || raw === 'deepseek') return raw
  return 'deepseek'
}

function usableKey(value: string | undefined, fallback: string | undefined): string {
  const saved = value?.trim()
  if (saved && !isMasked(saved)) return saved
  return fallback?.trim() || ''
}

function isMissingSystemSettings(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      (error as { code?: string }).code === 'PGRST205'
  )
}

function providerConfig(provider: Provider, settingsMap: Record<string, string>) {
  if (provider === 'anthropic') {
    return {
      key: usableKey(settingsMap.anthropic_api_key, process.env.ANTHROPIC_API_KEY),
      model: settingsMap.anthropic_model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    }
  }
  if (provider === 'openai') {
    return {
      key: usableKey(settingsMap.openai_api_key, process.env.OPENAI_API_KEY),
      model: settingsMap.openai_model || process.env.OPENAI_MODEL || 'gpt-6-luna',
    }
  }
  if (provider === 'google') {
    return {
      key: usableKey(settingsMap.google_api_key, process.env.GOOGLE_API_KEY),
      model: settingsMap.google_model || process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
    }
  }
  if (provider === 'groq') {
    return {
      key: usableKey(settingsMap.groq_api_key, process.env.GROQ_API_KEY),
      model: settingsMap.groq_model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    }
  }
  return {
    key: usableKey(settingsMap.deepseek_api_key, process.env.DEEPSEEK_API_KEY),
    model: settingsMap.deepseek_model || process.env.DEEPSEEK_MODEL || 'deepseek-reasoner',
  }
}

async function runTest(provider: Provider, key: string, model: string): Promise<string> {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: key })
    const response = await client.messages.create({
      model,
      max_tokens: 30,
      system: 'You are a connectivity test assistant.',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    })
    const first = response.content[0]
    return first && 'text' in first ? first.text : ''
  }

  if (provider === 'openai') {
    const client = new OpenAI({ apiKey: key })
    const response = await client.chat.completions.create({
      model,
      max_completion_tokens: 64,
      messages: [
        { role: 'system', content: 'You are a connectivity test assistant.' },
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
    })
    return response.choices[0]?.message?.content || ''
  }

  if (provider === 'google') {
    const genAI = new GoogleGenerativeAI(key)
    const gm = genAI.getGenerativeModel({ model, systemInstruction: 'You are a connectivity test assistant.' })
    const response = await gm.generateContent('Reply with exactly: OK')
    return response.response.text()
  }

  if (provider === 'groq') {
    const client = new Groq({ apiKey: key })
    const response = await client.chat.completions.create({
      model,
      max_tokens: 30,
      messages: [
        { role: 'system', content: 'You are a connectivity test assistant.' },
        { role: 'user', content: 'Reply with exactly: OK' },
      ],
    })
    return response.choices[0]?.message?.content || ''
  }

  const client = new OpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com/v1' })
  const response = await client.chat.completions.create({
    model,
    max_tokens: 30,
    messages: [
      { role: 'system', content: 'You are a connectivity test assistant.' },
      { role: 'user', content: 'Reply with exactly: OK' },
    ],
  })
  return response.choices[0]?.message?.content || ''
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin(req)
    const admin = getSupabaseAdmin()
    const body = (await req.json().catch(() => ({}))) as TestPayload

    const { data, error } = await admin.from('system_settings').select('key, value')
    if (error && !isMissingSystemSettings(error)) throw error
    const settingsMap: Record<string, string> = {}
    for (const row of data ?? []) settingsMap[String(row.key)] = String(row.value ?? '')
    if (error && isMissingSystemSettings(error)) {
      const { data: aiRow, error: aiError } = await admin
        .from('ai_settings')
        .select('active_provider, deepseek_api_key, openai_api_key, anthropic_api_key, google_api_key, groq_api_key')
        .eq('user_id', user.userId)
        .maybeSingle()
      if (aiError) throw aiError
      const stored = (aiRow ?? {}) as Record<string, unknown>
      if (stored.active_provider) settingsMap.ai_provider = String(stored.active_provider)
      for (const provider of ['anthropic', 'openai', 'google', 'groq', 'deepseek'] as const) {
        const enc = stored[`${provider}_api_key`]
        if (typeof enc === 'string' && enc) settingsMap[`${provider}_api_key`] = decryptString(enc)
      }
    }

    if (body.ai_provider) settingsMap.ai_provider = body.ai_provider
    for (const provider of ['anthropic', 'openai', 'google', 'groq', 'deepseek'] as const) {
      const apiKey = body[`${provider}_api_key`]
      const model = body[`${provider}_model`]
      if (apiKey && !isMasked(apiKey)) settingsMap[`${provider}_api_key`] = apiKey.trim()
      if (model) settingsMap[`${provider}_model`] = model
    }

    const provider = pickProvider(settingsMap)
    const { key, model } = providerConfig(provider, settingsMap)

    if (!key) {
      const savedKey = settingsMap[`${provider}_api_key`]
      const detail = savedKey && isMasked(savedKey)
        ? `A chave salva para ${provider} está mascarada. Informe a chave completa e salve novamente antes de testar.`
        : `Chave de API não configurada para ${provider}`
      return NextResponse.json({ ok: false, provider, error: detail, detail }, { status: 400 })
    }

    const started = performance.now()
    const message = await runTest(provider, key, model)
    const latency = Math.round(performance.now() - started)

    return NextResponse.json({
      ok: true,
      provider,
      model,
      latency_ms: latency,
      message: message.slice(0, 120),
    })
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(e instanceof Error ? e.message : String(e), 500)
  }
}
