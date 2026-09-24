'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type AIProvider = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'groq'

type SettingsResponse = {
  active_provider: AIProvider
  keys: Record<string, { configured: boolean; suffix: string }>
  models: Record<string, string>
  updated_at: string | null
}

const PROVIDERS: { id: AIProvider; label: string }[] = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'google', label: 'Google' },
  { id: 'groq', label: 'Groq' },
]

export default function AiSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeProvider, setActiveProvider] = useState<AIProvider>('deepseek')

  const [status, setStatus] = useState<string>('')
  const [latency, setLatency] = useState<number | null>(null)

  // Inputs do usuário: não carregamos a chave completa, apenas deixamos em branco.
  const [keysDraft, setKeysDraft] = useState<Record<AIProvider, string>>({
    deepseek: '',
    openai: '',
    anthropic: '',
    google: '',
    groq: '',
  })

  const [models, setModels] = useState<Record<string, string>>({})

  const [keyInfo, setKeyInfo] = useState<SettingsResponse['keys']>({
    deepseek: { configured: false, suffix: '' },
    openai: { configured: false, suffix: '' },
    anthropic: { configured: false, suffix: '' },
    google: { configured: false, suffix: '' },
    groq: { configured: false, suffix: '' },
  })

  const load = useCallback(async () => {
    setLoading(true)
    setStatus('')
    setLatency(null)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setStatus('Você precisa estar autenticado.')
      setLoading(false)
      return
    }

    const res = await fetch('/api/settings/ai', {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    const data = (await res.json().catch(() => null)) as (SettingsResponse & { detail?: string }) | null
    if (!res.ok || !data) {
      setStatus(data?.detail || 'Falha ao carregar configurações')
      setLoading(false)
      return
    }

    setActiveProvider(data.active_provider)
    setKeyInfo(data.keys)
    setModels(data.models ?? {})
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function save() {
    setSaving(true)
    setStatus('')
    setLatency(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const configuredAfterSave = Object.fromEntries(
        PROVIDERS.map((p) => [p.id, Boolean(keyInfo[p.id]?.configured || keysDraft[p.id].trim())])
      ) as Record<AIProvider, boolean>

      let providerToSave = activeProvider
      if (!configuredAfterSave[providerToSave]) {
        const configuredProviders = PROVIDERS.filter((p) => configuredAfterSave[p.id])
        if (configuredProviders.length === 1) {
          providerToSave = configuredProviders[0].id
          setActiveProvider(providerToSave)
        } else {
          throw new Error('Selecione como provedor ativo um provedor que tenha chave configurada.')
        }
      }

      const payload: Record<string, string> = { active_provider: providerToSave }
      for (const p of PROVIDERS.map((x) => x.id)) {
        const v = keysDraft[p].trim()
        if (!v) continue
        if (p === 'deepseek') payload.deepseek_api_key = v
        if (p === 'openai') payload.openai_api_key = v
        if (p === 'anthropic') payload.anthropic_api_key = v
        if (p === 'google') payload.google_api_key = v
        if (p === 'groq') payload.groq_api_key = v
      }

      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail || 'Falha ao salvar')

      // Recarrega para atualizar suffixes.
      setKeysDraft({ deepseek: '', openai: '', anthropic: '', google: '', groq: '' })
      await load()
      setStatus('Configurações salvas.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function testActive() {
    setStatus('')
    setLatency(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('Não autenticado')

      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider: activeProvider }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error || 'Falha no teste')

      setLatency(data.latencyMs)
      setStatus('Ping OK.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Falha no teste')
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-2">Configuração de IA</h1>
      <p className="text-slate-400 mb-6">Defina o provedor ativo e configure chaves de API.</p>

      {loading ? (
        <p className="text-slate-400">Carregando...</p>
      ) : (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <p className="text-slate-300 text-sm font-medium mb-3">Provedor ativo</p>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map((p) => {
                const selected = activeProvider === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActiveProvider(p.id)}
                    className={`text-left rounded-lg border px-3 py-2 transition ${
                      selected ? 'bg-blue-600/20 border-blue-500' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white text-sm font-medium">{p.label}</span>
                      {selected && <span className="text-xs text-blue-300">Ativo</span>}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {keyInfo[p.id]?.configured ? `Config.: ...${keyInfo[p.id]?.suffix}` : 'Não configurado'}
                    </div>
                    {models[p.id] && (
                      <div className="text-[11px] text-slate-500 mt-1">Modelo: {models[p.id]}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <p className="text-slate-300 text-sm font-medium">Chaves de API</p>

            {PROVIDERS.map((p) => (
              <div key={p.id} className="space-y-1">
                <label className="block text-sm text-slate-400">
                  {p.label} API Key
                </label>
                <input
                  type="password"
                  value={keysDraft[p.id]}
                  onChange={(e) => setKeysDraft((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={keyInfo[p.id]?.configured ? `Atual (…${keyInfo[p.id]?.suffix})` : 'Não configurada'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            ))}

            <div className="flex items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-6 py-2 rounded-lg font-medium text-white transition"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={testActive}
                disabled={!keyInfo[activeProvider]?.configured}
                className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium text-white transition"
                title={!keyInfo[activeProvider]?.configured ? 'Salve uma chave para o provedor ativo antes de testar.' : undefined}
              >
                Testar {PROVIDERS.find((p) => p.id === activeProvider)?.label ?? 'provedor ativo'}
              </button>
            </div>

            {latency != null && (
              <p className="text-xs text-slate-300">Latência: {latency}ms</p>
            )}

            {status && (
              <p className={`text-sm ${status.toLowerCase().includes('ok') ? 'text-green-400' : 'text-red-300'}`}>
                {status}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
