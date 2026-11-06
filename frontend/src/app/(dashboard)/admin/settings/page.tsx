'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

type SettingsResponse = Record<string, unknown>

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  const [adminEmail, setAdminEmail] = useState('')
  const [corsOrigins, setCorsOrigins] = useState('')
  const [notifyNewSignup, setNotifyNewSignup] = useState(true)
  const [env, setEnv] = useState<Record<string, unknown>>({})

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
      const data = await res.json() as SettingsResponse

      setAdminEmail(String(data.admin_email ?? ''))
      const corsValue = String(data.cors_origins ?? '')
      setCorsOrigins(corsValue.split(',').map(v => v.trim()).filter(Boolean).join('\n'))
      setNotifyNewSignup(String(data.notify_new_signup ?? 'true') === 'true')
      setEnv((data.env as Record<string, unknown>) ?? {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao carregar configurações')
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
      const corsCsv = corsOrigins
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .join(',')

      const payload = {
        admin_email: adminEmail,
        cors_origins: corsCsv,
        notify_new_signup: notifyNewSignup ? 'true' : 'false',
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

      toast.success('Configurações do sistema salvas')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function sendResetLink() {
    setSendingReset(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/settings/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ email: adminEmail }),
      })
      if (!res.ok) throw new Error((await res.json()).detail || 'Falha ao solicitar recuperação')
      const result = await res.json() as { request_accepted?: boolean }
      if (!result.request_accepted) throw new Error('Solicitação não confirmada pelo provedor')
      toast.success('Solicitação aceita pelo Supabase. A entrega do email ainda não está confirmada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao solicitar recuperação')
    } finally {
      setSendingReset(false)
    }
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Configurações do Sistema</h1>
        <p className="text-slate-400 text-sm mt-1">Parâmetros administrativos globais e ambiente.</p>
      </div>

      {loading ? (
        <p className="text-slate-400">Carregando...</p>
      ) : (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h2 className="text-white font-semibold">Geral</h2>

            <label className="block">
              <span className="text-xs text-slate-400">Email do administrador</span>
              <input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>

            <div className="flex gap-2">
              <button
                onClick={sendResetLink}
                disabled={sendingReset}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {sendingReset ? 'Solicitando...' : 'Solicitar email de recuperação de senha'}
              </button>
            </div>
            <p className="text-xs text-slate-400">O pedido é enviado ao Supabase Auth para processamento. A entrega do email deve ser confirmada no provedor e pelo destinatário; este botão não comprova recebimento.</p>

            <label className="block">
              <span className="text-xs text-slate-400">CORS origins (uma por linha)</span>
              <textarea
                value={corsOrigins}
                onChange={(e) => setCorsOrigins(e.target.value)}
                className="mt-1 w-full min-h-28 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={notifyNewSignup}
                onChange={(e) => setNotifyNewSignup(e.target.checked)}
              />
              <span className="text-sm text-slate-300">Notificar por email em novos cadastros</span>
            </label>

            <div>
              <button
                onClick={save}
                disabled={saving}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-medium px-4 py-2 rounded-lg"
              >
                {saving ? 'Salvando...' : 'Salvar configurações'}
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-white font-semibold">Variáveis de ambiente (somente leitura)</h2>
            <p className="text-xs text-amber-300/90 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
              Atualize essas variáveis no Railway/Render/Vercel. Esta tela não altera valores de runtime do deploy.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(env).map(([key, value]) => (
                <div key={key} className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-slate-400 uppercase tracking-wide">{key}</p>
                  <p className="text-xs text-slate-200 break-all mt-1">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
