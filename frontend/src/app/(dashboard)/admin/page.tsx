'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ArrowUpRight, BarChart2, Zap, Building2, Link2 } from 'lucide-react'

interface Stats {
  total_tenants: number
  total_analyses: number
  credits_consumed: number
  enterprise_tenants: number
  free_tenants: number
  growth?: {
    current_month: number
    previous_month: number
    pct: number
  }
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return
      try {
        const res = await fetch('/api/admin/stats', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        if (!res.ok) throw new Error((await res.json()).detail)
        setStats(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar')
      }
    })
  }, [])

  const cards = stats ? [
    { label: 'Total Tenants', value: stats.total_tenants, icon: Building2, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    { label: 'Análises Realizadas', value: stats.total_analyses, icon: BarChart2, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
    { label: 'Créditos Consumidos', value: stats.credits_consumed, icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    { label: 'Crescimento Mensal', value: `${stats.growth?.pct ?? 0}%`, icon: ArrowUpRight, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20' },
  ] : []

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
        <p className="text-slate-400 text-sm mt-1">Visão geral do sistema HFA</p>
      </div>

      {error && (
        <div className="mb-6 bg-red-950/40 border border-red-900/50 rounded-xl p-4 text-red-400 text-sm">{error}</div>
      )}

      {!stats && !error && (
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          Carregando métricas…
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className={`border rounded-xl p-5 ${card.bg}`}>
              <div className="flex items-start justify-between mb-3">
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide">{card.label}</p>
                <Icon className={`size-4 shrink-0 ${card.color}`} />
              </div>
              <p className={`text-3xl font-bold ${card.color}`}>{String(card.value)}</p>
            </div>
          )
        })}
      </div>

      <Link href="/admin/integrations" className="mb-6 flex items-center justify-between rounded-xl border border-blue-800/50 bg-blue-950/20 p-5 transition hover:border-blue-600/60">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">HFA API</p>
          <p className="mt-1 text-base font-semibold text-white">Integrações</p>
          <p className="mt-1 text-sm text-slate-400">Conecte o SGSO do AirTrust ao HFA com credenciais revogáveis por organização.</p>
        </div>
        <Link2 className="size-5 text-blue-300" />
      </Link>

      {stats && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Distribuição de Planos</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-slate-400 text-xs mb-1">Free / Trial</p>
              <p className="text-white text-xl font-bold">{stats.free_tenants}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Enterprise</p>
              <p className="text-purple-400 text-xl font-bold">{stats.enterprise_tenants}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Análises no mês</p>
              <p className="text-white text-xl font-bold">{stats.growth?.current_month ?? 0}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs mb-1">Mês anterior</p>
              <p className="text-white text-xl font-bold">{stats.growth?.previous_month ?? 0}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
