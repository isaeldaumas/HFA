'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Link2, RefreshCcw, ShieldOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Connection = {
  id: string
  external_tenant_ref: string
  name: string | null
  token_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
  updated_at: string
  revoked_at: string | null
}

export default function IntegrationsAdminPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [externalRef, setExternalRef] = useState('')
  const [displayName, setDisplayName] = useState('AirTrust')
  const [issuedToken, setIssuedToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const sessionToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sessão inválida.')
    return session.access_token
  }, [])

  const load = useCallback(async () => {
    try {
      const token = await sessionToken()
      const res = await fetch('/api/admin/integrations/airtrust', { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ([]))
      if (!res.ok) throw new Error(json?.detail || 'Não foi possível carregar as integrações.')
      setConnections(Array.isArray(json) ? json : [])
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as integrações.')
    } finally {
      setLoading(false)
    }
  }, [sessionToken])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function issueToken() {
    if (!externalRef.trim()) return
    setSaving(true)
    setIssuedToken(null)
    try {
      const token = await sessionToken()
      const res = await fetch('/api/admin/integrations/airtrust', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_tenant_ref: externalRef.trim(), name: displayName.trim() || 'AirTrust' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || 'Não foi possível gerar a credencial.')
      setIssuedToken(json.token)
      setMessage('Credencial gerada. Ela será exibida somente agora; copie-a para o AirTrust.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a credencial.')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(connectionId: string) {
    setSaving(true)
    try {
      const token = await sessionToken()
      const res = await fetch('/api/admin/integrations/airtrust', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.detail || 'Não foi possível revogar a credencial.')
      setIssuedToken(null)
      setMessage('Credencial revogada.')
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível revogar a credencial.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 md:p-8 max-w-5xl">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">HFA API</p>
        <h1 className="mt-1 text-2xl font-bold text-white">Integração AirTrust</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          Crie uma credencial por empresa do AirTrust. O AirTrust pode registrar ou atualizar um evento de Safety no HFA, mas nunca inicia análise HFA nem consome crédito automaticamente.
        </p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-slate-400">ID da empresa no AirTrust</span>
            <input value={externalRef} onChange={(e) => setExternalRef(e.target.value)} placeholder="Ex.: 6"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">Nome da conexão</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="button" disabled={saving || !externalRef.trim()} onClick={() => void issueToken()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            <RefreshCcw className="size-4" /> {saving ? 'Salvando…' : 'Gerar / rotacionar token'}
          </button>
        </div>
      </section>

      {issuedToken && (
        <section className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/20 p-5">
          <p className="text-sm font-semibold text-amber-200">Copie agora — o token não será exibido novamente</p>
          <div className="mt-3 flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-200">{issuedToken}</code>
            <button type="button" onClick={() => void navigator.clipboard.writeText(issuedToken)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-slate-200 hover:border-slate-500" title="Copiar token">
              <Copy className="size-4" />
            </button>
          </div>
        </section>
      )}

      {message && <p className="mt-4 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300">{message}</p>}

      <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white"><Link2 className="size-4" /> Conexões</h2>
        {loading ? <p className="mt-4 text-sm text-slate-500">Carregando…</p> : (
          <div className="mt-4 space-y-3">
            {connections.map((connection) => (
              <div key={connection.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{connection.name || 'AirTrust'} · empresa {connection.external_tenant_ref}</p>
                    <p className="mt-1 text-xs text-slate-500">Token {connection.token_prefix}… · {connection.is_active ? 'ativo' : 'revogado'}</p>
                    <p className="mt-1 text-xs text-slate-600">Último uso: {connection.last_used_at ? new Date(connection.last_used_at).toLocaleString('pt-BR') : 'ainda não utilizado'}</p>
                  </div>
                  {connection.is_active && (
                    <button type="button" disabled={saving} onClick={() => void revoke(connection.id)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-50">
                      <ShieldOff className="size-4" /> Revogar
                    </button>
                  )}
                </div>
              </div>
            ))}
            {connections.length === 0 && <p className="text-sm text-slate-500">Nenhuma conexão AirTrust configurada.</p>}
          </div>
        )}
      </section>
    </div>
  )
}
