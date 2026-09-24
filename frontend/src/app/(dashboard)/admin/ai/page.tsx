'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type Provider = 'anthropic' | 'openai' | 'deepseek' | 'google' | 'groq'

const PROVIDERS: Array<{ id: Provider; label: string }> = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'google', label: 'Google' },
  { id: 'groq', label: 'Groq' },
]

type ProviderState = {
  api_key: string
  model: string
}

function isMaskedKey(value: string): boolean {
  return value.includes('****')
}

const EMPTY: Record<Provider, ProviderState> = {
  anthropic: { api_key: '', model: 'claude-sonnet-4-5' },
  openai: { api_key: '', model: 'gpt-6-luna' },
  deepseek: { api_key: '', model: 'deepseek-reasoner' },
  google: { api_key: '', model: 'gemini-2.0-flash' },
  groq: { api_key: '', model: 'llama-3.3-70b-versatile' },
}

const MAIN_MODEL_OPTIONS: Record<Provider, string[]> = {
  anthropic: [
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-opus-4-0',
    'claude-3-7-sonnet-latest',
    'claude-3-5-haiku-latest',
  ],
  openai: [
    'gpt-6-luna',
    'gpt-6-sol',
    'gpt-6-astra',
    'gpt-5.1',
    'gpt-5.1-mini',
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
    'gpt-4o-mini',
  ],
  deepseek: [
    'deepseek-v4-pro',
    'deepseek-v4-flash',
    'deepseek-reasoner',
    'deepseek-chat',
  ],
  google: [
    'gemini-3-pro-preview',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'qwen-qwq-32b',
    'deepseek-r1-distill-llama-70b',
  ],
}

export default function AdminAIPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activeProvider, setActiveProvider] = useState<Provider>('deepseek')
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>(EMPTY)
  const [testResult, setTestResult] = useState<{ latency_ms: number; model: string; message: string } | null>(null)

  async function authHeaders() {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new Error('Sessão inválida')
    return { Authorization: `Bearer ${data.session.access_token}` }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/settings', { headers })
      if (!res.ok) throw new Error((await res.json()).detail || 'Falha ao carregar')
      const data = await res.json() as Record<string, string>

      setActiveProvider((data.ai_provider as Provider) || 'deepseek')
      setProviders({
        anthropic: {
          api_key: data.anthropic_api_key ?? '',
          model: data.anthropic_model ?? EMPTY.anthropic.model,
        },
        openai: {
          api_key: data.openai_api_key ?? '',
          model: data.openai_model ?? EMPTY.openai.model,
        },
        deepseek: {
          api_key: data.deepseek_api_key ?? '',
          model: data.deepseek_model ?? EMPTY.deepseek.model,
        },
        google: {
          api_key: data.google_api_key ?? '',
          model: data.google_model ?? EMPTY.google.model,
        },
        groq: {
          api_key: data.groq_api_key ?? '',
          model: data.groq_model ?? EMPTY.groq.model,
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function save() {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const payload: Record<string, string> = {
        ai_provider: activeProvider,
      }

      for (const p of PROVIDERS) {
        if (!isMaskedKey(providers[p.id].api_key)) {
          payload[`${p.id}_api_key`] = providers[p.id].api_key
        }
        payload[`${p.id}_model`] = providers[p.id].model
      }

      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Falha ao salvar')
      toast.success('Configurações de IA salvas')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const headers = await authHeaders()
      const payload: Record<string, string> = {
        ai_provider: activeProvider,
      }
      for (const p of PROVIDERS) {
        if (!isMaskedKey(providers[p.id].api_key)) {
          payload[`${p.id}_api_key`] = providers[p.id].api_key
        }
        payload[`${p.id}_model`] = providers[p.id].model
      }
      const res = await fetch('/api/admin/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Falha no teste')
      setTestResult({
        latency_ms: Number(data.latency_ms ?? 0),
        model: String(data.model ?? ''),
        message: String(data.message ?? ''),
      })
      toast.success('Conexão testada com sucesso')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no teste')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuração de IA</h1>
        <p className="text-slate-400 text-sm mt-1">Provider ativo, modelos e chaves de API.</p>
      </div>

      {loading ? (
        <div className="text-slate-400">Carregando...</div>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Provider ativo</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {PROVIDERS.map((p) => (
                <label key={p.id} className={`border rounded-lg px-3 py-2 cursor-pointer ${activeProvider === p.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-800/40'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{p.label}</span>
                    <input
                      type="radio"
                      checked={activeProvider === p.id}
                      onChange={() => setActiveProvider(p.id)}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Credenciais e modelos</h2>
            <div className="space-y-4">
              {PROVIDERS.map((p) => (
                <div key={p.id} className="border border-slate-800 rounded-lg p-4 bg-slate-900/50">
                  <p className="text-sm text-slate-300 font-medium mb-3">{p.label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs text-slate-400">API Key</span>
                      <input
                        type="password"
                        value={providers[p.id].api_key}
                        onChange={(e) => setProviders((s) => ({ ...s, [p.id]: { ...s[p.id], api_key: e.target.value } }))}
                        className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="sk-...****"
                      />
                    </label>
                    <div className="block">
                      <span className="text-xs text-slate-400">Modelo padrão</span>
                      <select
                        value={providers[p.id].model}
                        onChange={(e) => setProviders((s) => ({ ...s, [p.id]: { ...s[p.id], model: e.target.value } }))}
                        className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      >
                        {[...new Set([providers[p.id].model, ...MAIN_MODEL_OPTIONS[p.id]].filter(Boolean))].map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                      <input
                        value={providers[p.id].model}
                        onChange={(e) => setProviders((s) => ({ ...s, [p.id]: { ...s[p.id], model: e.target.value } }))}
                        className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                        placeholder="ID customizado do modelo"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Selecione uma opção sugerida ou informe um ID customizado no campo abaixo.
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={save} disabled={saving} className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium px-4 py-2 rounded-lg">
                {saving ? 'Salvando...' : 'Salvar configurações'}
              </button>
              <button onClick={testConnection} disabled={testing} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {testing ? 'Testando...' : 'Testar conexão'}
              </button>
            </div>

            {testResult && (
              <div className="mt-4 rounded-lg border border-green-700/40 bg-green-950/30 p-3 text-sm">
                <p className="text-green-300">Latência: {testResult.latency_ms} ms</p>
                <p className="text-green-300">Modelo: {testResult.model}</p>
                <p className="text-green-200/90 text-xs mt-1">Resposta: {testResult.message || 'OK'}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
