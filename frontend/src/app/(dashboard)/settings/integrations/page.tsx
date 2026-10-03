'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Connection = {
  id: string
  provider: 'AIRTRUST'
  external_tenant_ref: string
  name: string
  token_prefix: string
  scopes: string[]
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

export default function IntegrationsSettingsPage() {
  const [rows, setRows] = useState<Connection[]>([])
  const [name, setName] = useState('AirTrust')
  const [externalRef, setExternalRef] = useState('')
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão inválida.')
    return { Authorization: `Bearer ${session.access_token}` }
  }, [])

  const load = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/integrations/connections', { headers })
      const json = await res.json().catch(() => ([]))
      if (!res.ok) throw new Error(json?.detail || 'Falha ao carregar integrações.')
      setRows(Array.isArray(json) ? json : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar integrações.')
    }
  }, [authHeaders])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function issue() {
    if (!externalRef.trim() || !name.trim()) return
    setBusy(true); setError(null); setIssuedToken(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/integrations/connections', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'AIRTRUST', external_tenant_ref: externalRef.trim(), name: name.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || 'Falha ao criar integração.')
      setIssuedToken(String(json.token || ''))
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao criar integração.')
    } finally { setBusy(false) }
  }

  async function revoke(id: string) {
    setBusy(true); setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/integrations/connections/${id}`, { method: 'DELETE', headers })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || 'Falha ao revogar integração.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao revogar integração.')
    } finally { setBusy(false) }
  }

  return (
    <div className="p-5 md:p-8 max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-blue-300"><Link2 className="size-5" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Integrações</span></div>
        <h1 className="mt-2 text-2xl font-bold text-white">AirTrust ↔ HFA</h1>
        <p className="mt-1 text-sm text-slate-400">Conecte uma empresa do AirTrust a este tenant HFA. O token é exibido uma única vez e nunca é armazenado em texto puro.</p>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label><span className="text-xs text-slate-400">Nome da conexão</span><input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" /></label>
          <label><span className="text-xs text-slate-400">ID da empresa no AirTrust</span><input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="Ex.: 6" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" /></label>
        </div>
        <button disabled={busy || !externalRef.trim()} onClick={() => void issue()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          {rows.some((row) => row.external_tenant_ref === externalRef.trim() && row.is_active) ? 'Rotacionar token' : 'Gerar conexão'}
        </button>
      </section>

      {issuedToken && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="text-sm font-semibold text-amber-100">Copie este token agora. Ele não será exibido novamente.</p>
          <div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-slate-950 p-3 text-xs text-slate-200">{issuedToken}</code><button onClick={() => void navigator.clipboard.writeText(issuedToken)} className="rounded-lg border border-slate-700 p-3 text-slate-200"><Copy className="size-4" /></button></div>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Conexões</h2><button onClick={() => void load()} className="text-slate-400 hover:text-white"><RefreshCw className="size-4" /></button></div>
        <div className="mt-4 space-y-3">
          {rows.map((row) => <div key={row.id} className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-white">{row.name}</p><p className="mt-1 text-xs text-slate-500">empresa {row.external_tenant_ref} · {row.token_prefix}… · {row.is_active ? 'ativa' : 'revogada'}{row.last_used_at ? ` · último uso ${new Date(row.last_used_at).toLocaleString('pt-BR')}` : ''}</p></div>{row.is_active && <button disabled={busy} onClick={() => void revoke(row.id)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"><Trash2 className="size-3.5" />Revogar</button>}</div>)}
          {rows.length === 0 && <p className="text-sm text-slate-600">Nenhuma integração configurada.</p>}
        </div>
      </section>
    </div>
  )
}
