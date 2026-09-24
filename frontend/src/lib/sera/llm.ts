import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { decryptString } from '@/lib/server/ai-settings-crypto'

export type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'groq'

let llmConfigLogged = false
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-reasoner'
const DEFAULT_OPENAI_MODEL = 'gpt-6-luna'
// DeepSeek may show deepseek-v4-flash in billing because deepseek-reasoner is mapped to V4 Flash thinking mode by the provider.
let deepseekFlashWarningLogged = false
let seraSupabaseLoaded = false

function loadFrontendEnvLocal(options?: { overrideAiKeys?: boolean }): void {
  const envPath = path.resolve(process.cwd(), 'frontend/.env.local')
  if (!fs.existsSync(envPath)) return
  const overrideKeys = new Set([
    'AI_PROVIDER',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_MODEL',
    'DEEPSEEK_TEMPERATURE',
    'DEEPSEEK_TOP_P',
    'OPENAI_API_KEY',
    'OPENAI_MODEL',
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_MODEL',
    'GOOGLE_API_KEY',
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'GOOGLE_MODEL',
    'GROQ_API_KEY',
    'GROQ_MODEL',
  ])
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key] || (options?.overrideAiKeys && overrideKeys.has(key))) process.env[key] = value
  }
}

function isSeraTestContext(): boolean {
  return Boolean(
    process.env.SERA_N_RUNS ||
      process.env.SERA_FIXTURE ||
      process.argv.some((a) => a.includes('tests/sera/run.ts') || a.includes('tests/sera/'))
  )
}

async function loadSeraAiSettingsFromSupabase(): Promise<void> {
  if (!isSeraTestContext() || seraSupabaseLoaded) return
  seraSupabaseLoaded = true

  loadFrontendEnvLocal({ overrideAiKeys: true })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return

  try {
    const supabase = createClient(url, key)
    const { data, error } = await supabase
      .from('ai_settings')
      .select('active_provider, deepseek_api_key, openai_api_key, anthropic_api_key, google_api_key, groq_api_key, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return

    if (typeof data.active_provider === 'string' && data.active_provider.trim()) {
      process.env.AI_PROVIDER = data.active_provider.trim()
    }

    const encryptedKeys: Record<string, unknown> = {
      DEEPSEEK_API_KEY: data.deepseek_api_key,
      OPENAI_API_KEY: data.openai_api_key,
      ANTHROPIC_API_KEY: data.anthropic_api_key,
      GOOGLE_API_KEY: data.google_api_key,
      GROQ_API_KEY: data.groq_api_key,
    }

    for (const [envName, encrypted] of Object.entries(encryptedKeys)) {
      if (typeof encrypted !== 'string' || !encrypted) continue
      process.env[envName] = decryptString(encrypted).trim()
    }
  } catch {
    // Mantemos fallback local para não bloquear o runner quando o Supabase não estiver acessível.
  }
}

function resolveDeepseekConfig() {
  const seraContext = isSeraTestContext()
  loadFrontendEnvLocal({ overrideAiKeys: seraContext && !seraSupabaseLoaded })
  const configuredModel = process.env.DEEPSEEK_MODEL?.trim()
  const model = configuredModel || DEFAULT_DEEPSEEK_MODEL
  const temperature = seraContext ? 0 : Number(process.env.DEEPSEEK_TEMPERATURE ?? '0')
  const topP = seraContext ? 1 : Number(process.env.DEEPSEEK_TOP_P ?? '1')

  if (!deepseekFlashWarningLogged && configuredModel?.toLowerCase().includes('flash')) {
    deepseekFlashWarningLogged = true
    console.warn('[SERA LLM WARNING] using flash model id explicitly', { model: configuredModel })
  }

  if (!llmConfigLogged) {
    llmConfigLogged = true
    console.log('[SERA LLM CONFIG]', {
      provider: 'deepseek',
      model,
      temperature,
      top_p: topP
    })
  }

  return { model, temperature, topP }
}

export function getActiveProvider(): AIProvider {
  loadFrontendEnvLocal({ overrideAiKeys: isSeraTestContext() && !seraSupabaseLoaded })
  const p = (process.env.AI_PROVIDER ?? 'deepseek').toLowerCase()
  // Only accept known providers; fall back to deepseek for safety.
  if (p === 'deepseek' || p === 'openai' || p === 'anthropic' || p === 'google' || p === 'groq')
    return p
  return 'deepseek'
}

export function getModelName(provider?: AIProvider): string {
  const p = provider ?? getActiveProvider()
  const deepseek = resolveDeepseekConfig()
  const models: Record<AIProvider, string> = {
    deepseek: deepseek.model,
    openai: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
    anthropic: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    google: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
    groq: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  }
  return models[p]
}

function requireApiKey(envName: string, hint?: string): string {
  const v = process.env[envName]?.trim()
  const extra = hint ? ` ${hint}` : ''
  if (v && !v.includes('****')) return v
  if (v?.includes('****')) {
    throw new Error(
      `${envName} contém uma chave mascarada e não pode ser usada para chamada LLM.${extra} Configure a chave real em frontend/.env.local (ou no hospedeiro da API).`
    )
  }
  throw new Error(
    `${envName} não está definida.${extra} Configure em frontend/.env.local (ou no hospedeiro da API).`
  )
}

function extractJsonBlock(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1]!.trim()
  const obj = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (obj) return obj[1]!
  return t
}

function sanitizeJsonCandidate(raw: string): string {
  const candidate = extractJsonBlock(raw).trim()
  let result = ''
  let inString = false
  let escaped = false

  for (const char of candidate) {
    const code = char.charCodeAt(0)

    if (escaped) {
      result += char
      escaped = false
      continue
    }

    if (char === '\\') {
      result += char
      escaped = true
      continue
    }

    if (char === '"') {
      result += char
      inString = !inString
      continue
    }

    if (code < 0x20) {
      if (inString) {
        result += ' '
      } else if (char === '\n' || char === '\r' || char === '\t') {
        result += char
      }
      continue
    }

    result += char
  }

  return result.trim()
}

const LLM_TIMEOUT_MS = 120_000

function isTransientError(e: Error): boolean {
  const msg = e.message.toLowerCase()
  return (
    msg === 'terminated' ||
    msg.includes('econnreset') ||
    msg.includes('econnaborted') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('request timed out') ||
    msg.includes('connection reset') ||
    msg.includes('connection closed')
  )
}

async function callGoogle(system: string, user: string): Promise<string> {
  const key =
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  if (!key) {
    throw new Error(
      'Chave Google ausente: defina GOOGLE_API_KEY ou GOOGLE_GENERATIVE_AI_API_KEY.'
    )
  }

  const genAI = new GoogleGenerativeAI(key)
  const model = genAI.getGenerativeModel({
    model: getModelName('google'),
    systemInstruction: system,
  })
  const r = await model.generateContent(user)
  return r.response.text()
}

export async function callAi(system: string, userMsg: string, maxTokens = 8192): Promise<string> {
  await loadSeraAiSettingsFromSupabase()
  const provider = getActiveProvider()
  let raw: string

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: requireApiKey('ANTHROPIC_API_KEY'), timeout: LLM_TIMEOUT_MS })
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: 'user', content: userMsg }],
    })
    raw = (msg.content[0] as { text: string }).text
  } else if (provider === 'openai') {
    const client = new OpenAI({ apiKey: requireApiKey('OPENAI_API_KEY'), timeout: LLM_TIMEOUT_MS })
    const r = await client.chat.completions.create({
      model: getModelName('openai'),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      max_completion_tokens: maxTokens,
    })
    raw = r.choices[0]?.message?.content || ''
  } else if (provider === 'google') {
    raw = await callGoogle(system, userMsg)
  } else if (provider === 'groq') {
    const client = new OpenAI({
      apiKey: requireApiKey('GROQ_API_KEY'),
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: LLM_TIMEOUT_MS,
    })
    const r = await client.chat.completions.create({
      model: getModelName('groq'),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      max_tokens: maxTokens,
    })
    raw = r.choices[0]?.message?.content || ''
  } else {
    /* deepseek — mesmo cliente OpenAI */
    const deepseek = resolveDeepseekConfig()
    const client = new OpenAI({
      apiKey: requireApiKey(
        'DEEPSEEK_API_KEY',
        'O padrão é DeepSeek (AI_PROVIDER não definido ou = deepseek). Para usar OpenAI, defina AI_PROVIDER=openai e OPENAI_API_KEY.'
      ),
      baseURL: 'https://api.deepseek.com/v1',
      timeout: LLM_TIMEOUT_MS,
    })
    const r = await client.chat.completions.create({
      model: deepseek.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      max_tokens: Math.min(maxTokens, 16000),
      temperature: deepseek.temperature,
      top_p: deepseek.topP,
    })
    raw = r.choices[0]?.message?.content || ''
  }

  return raw
}

export function safeParse(raw: string, step: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch (_) {}

  const cleaned = extractJsonBlock(raw)
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch (_) {}

  const sanitized = sanitizeJsonCandidate(cleaned)
  try {
    return JSON.parse(sanitized) as Record<string, unknown>
  } catch (_) {}

  const sanitizedRaw = sanitizeJsonCandidate(raw)
  try {
    return JSON.parse(sanitizedRaw) as Record<string, unknown>
  } catch (e) {
    const preview = raw.slice(0, 600)
    throw new Error(`Falha ao parsear JSON na ${step}: ${String(e)} — ${preview}`)
  }
}

export async function ask(
  system: string,
  user: string,
  opts?: { maxTokens?: number }
): Promise<string> {
  const MAX_RETRIES = 2
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callAi(system, user, opts?.maxTokens ?? 16000)
    } catch (e: unknown) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (!isTransientError(lastError)) throw lastError
      if (attempt < MAX_RETRIES) {
        console.warn(`[SERA retry] erro transiente (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError!
}

export async function askJson(
  system: string,
  user: string,
  step: string,
  opts?: { maxTokens?: number }
): Promise<Record<string, unknown>> {
  const MAX_PARSE_RETRIES = 1

  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    if (attempt > 0) {
      console.warn(`[SERA retry] parse error na ${step}, tentativa ${attempt + 1}/${MAX_PARSE_RETRIES + 1} — repetindo chamada LLM`)
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    const raw = await ask(system, user, opts)
    try {
      return safeParse(raw, step)
    } catch (e) {
      if (attempt >= MAX_PARSE_RETRIES) throw e
    }
  }

  throw new Error(`askJson: estado inesperado em ${step}`)
}

/**
 * Falha cedo com mensagem clara se o provedor atual não tem chave configurada.
 * Chamar nas rotas **antes** de criar evento / debitar crédito.
 */
export function assertLlmEnvConfigured(provider?: AIProvider): void {
  const p = provider ?? getActiveProvider()
  const set = (k: string) => Boolean(process.env[k]?.trim())

  if (p === 'anthropic') {
    if (!set('ANTHROPIC_API_KEY')) throw new Error('ANTHROPIC_API_KEY não definida (AI_PROVIDER=anthropic).')
    return
  }
  if (p === 'openai') {
    if (!set('OPENAI_API_KEY')) throw new Error('OPENAI_API_KEY não definida (AI_PROVIDER=openai).')
    return
  }
  if (p === 'google') {
    if (!process.env.GOOGLE_API_KEY?.trim() && !process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
      throw new Error('GOOGLE_API_KEY não definida (AI_PROVIDER=google).')
    }
    return
  }
  if (p === 'groq') {
    if (!set('GROQ_API_KEY')) throw new Error('GROQ_API_KEY não definida (AI_PROVIDER=groq).')
    return
  }
  /* deepseek */
  if (!set('DEEPSEEK_API_KEY')) throw new Error('DEEPSEEK_API_KEY não definida (AI_PROVIDER=deepseek).')
}
