'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Archive, FileSearch, Lock, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const betaUiEnabled = process.env.NEXT_PUBLIC_SERA_VNEXT_PRODUCT_BETA_UI_ENABLED?.trim().toLowerCase() === 'true'

type AnalysisSummary = {
  id: string
  title: string
  status: string
  review_status: string
  created_at: string
  created_by: string
  engine_version: string
  warnings: string[]
  current_revision: number
}

type ListPayload = {
  items: AnalysisSummary[]
  page: number
  pageSize: number
  total: number
}

export default function SeraVNextAnalysesPage() {
  const [payload, setPayload] = useState<ListPayload | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  async function load(page = 1) {
    setLoading(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setError('Sessão ausente')
      setLoading(false)
      return
    }
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/sera-vnext/analyses?${params.toString()}`, {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json.detail ?? 'Falha ao listar análises.'))
      setPayload(json as ListPayload)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao listar análises.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (betaUiEnabled) void load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!betaUiEnabled) {
    return (
      <div className="p-5 md:p-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-white"><Lock className="size-4" /> Revisão SERA 0.3 indisponível</div>
          <p className="mt-2 text-sm text-slate-400">Defina NEXT_PUBLIC_SERA_VNEXT_PRODUCT_BETA_UI_ENABLED=true apenas em ambiente interno controlado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Product Beta interno</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Revisão das análises SERA 0.3</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">Análises persistidas e auditáveis do motor SERA 0.3. A revisão humana é obrigatória antes da liberação formal.</p>
        </div>
        <Link href="/admin/sera-vnext/analyses/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
          <Plus className="size-4" /> Nova análise
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título" className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" />
          <button type="button" onClick={() => void load(1)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900">
            <RefreshCw className="size-4" /> Filtrar
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-6 gap-3 border-b border-slate-800 px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
          <span className="col-span-2">Título</span><span>Status</span><span>Review</span><span>Engine</span><span>Ação</span>
        </div>
        {loading && <div className="p-6 text-sm text-slate-400">Carregando...</div>}
        {!loading && payload?.items.length === 0 && <div className="p-6 text-sm text-slate-400">Nenhuma análise encontrada.</div>}
        {payload?.items.map((item) => (
          <div key={item.id} className="grid grid-cols-6 gap-3 border-b border-slate-900 px-4 py-4 text-sm text-slate-300 last:border-b-0">
            <div className="col-span-2 min-w-0">
              <p className="truncate font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">rev {item.current_revision} · {new Date(item.created_at).toLocaleString()}</p>
            </div>
            <span>{item.status}</span>
            <span>{item.review_status}</span>
            <span>v{item.engine_version}</span>
            <Link href={`/admin/sera-vnext/analyses/${item.id}`} className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"><FileSearch className="size-4" /> Abrir</Link>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500"><Archive className="size-4" /> Arquivadas ficam ocultas por padrão e podem ser restauradas pelo detalhe/export autorizado.</div>
    </div>
  )
}
