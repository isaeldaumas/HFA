import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { decryptString } from '@/lib/server/ai-settings-crypto'
import { type AIProvider, getModelName } from '@/lib/sera/llm'

type TestBody = { provider: AIProvider }

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const user = await requireBearerUser(req)
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()

    const body = (await req.json()) as TestBody
    const provider = body.provider

    const { data: row } = await admin
      .from('ai_settings')
      .select('*')
      .eq('user_id', user.userId)
      .maybeSingle()

    const decryptField = (field: 'deepseek_api_key' | 'openai_api_key' | 'anthropic_api_key' | 'google_api_key' | 'groq_api_key') => {
      const rowRecord = (row ?? {}) as Record<string, unknown>
      const raw = rowRecord[field]
      const enc = typeof raw === 'string' ? raw : null
      if (!enc) return null
      return decryptString(enc)
    }

    let apiKey: string | null = null
    if (provider === 'deepseek') apiKey = decryptField('deepseek_api_key')
    if (provider === 'openai') apiKey = decryptField('openai_api_key')
    if (provider === 'anthropic') apiKey = decryptField('anthropic_api_key')
    if (provider === 'google') apiKey = decryptField('google_api_key')
    if (provider === 'groq') apiKey = decryptField('groq_api_key')

    if (!apiKey?.trim()) {
      return NextResponse.json({ ok: false, error: 'Chave não configurada' }, { status: 400 })
    }

    const t0 = Date.now()
    if (provider === 'anthropic') {
      const client = new Anthropic({ apiKey })
      await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
        max_tokens: 10,
        system: 'ping',
        messages: [{ role: 'user', content: 'ping' }],
      })
    } else if (provider === 'google') {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({
        model: getModelName('google'),
        systemInstruction: 'ping',
      })
      const r = await model.generateContent('ping')
      void r
    } else if (provider === 'openai') {
      const client = new OpenAI({ apiKey })
      await client.chat.completions.create({
        model: getModelName('openai'),
        messages: [
          { role: 'system', content: 'ping' },
          { role: 'user', content: 'ping' },
        ],
        max_completion_tokens: 32,
      })
    } else {
      const baseURL = provider === 'deepseek'
        ? 'https://api.deepseek.com/v1'
        : 'https://api.groq.com/openai/v1'

      const client = new OpenAI({ apiKey, baseURL })
      await client.chat.completions.create({
        model: getModelName(provider),
        messages: [
          { role: 'system', content: 'ping' },
          { role: 'user', content: 'ping' },
        ],
        max_tokens: 10,
      })
    }

    const latencyMs = Date.now() - t0
    return NextResponse.json({ ok: true, latencyMs })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
