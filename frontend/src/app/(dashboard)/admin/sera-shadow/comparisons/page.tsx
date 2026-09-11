'use client'

import { useEffect, useState, startTransition } from 'react'
import { supabase } from '@/lib/supabase'

const shadowAdminUiEnabled =
  process.env.NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED?.trim().toLowerCase() === 'true'

type ComparisonPayload = {
  contractId?: string
  ercExcluded?: boolean
  count?: number
  metrics?: {
    exactTripletMatchRate: number | null
    axisAgreementRate: number | null
    runCount: number
    ercIncluded: false
  }
  rows?: Array<{
    shadowRunId: string
    createdAt: string
    comparison: {
      exactTripletMatch: boolean
      agreementRate: number | null
      comparableAxisCount: number
    }
  }>
  detail?: string
}

function ShadowComparisonsDisabled() {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-xl font-semibold text-white">Shadow comparisons</h1>
      <p className="mt-3 text-sm text-slate-400">
        Vista administrativa desligada. Defina NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED=true
        apenas em ambiente controlado. Flags de execução/persistência devem permanecer false.
      </p>
    </div>
  )
}

function ShadowComparisonsEnabled() {
  const [payload, setPayload] = useState<ComparisonPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session?.access_token) {
        startTransition(() => {
          setError('Sessão ausente')
          setLoading(false)
        })
        return
      }
      try {
        const res = await fetch('/api/admin/sera-shadow/comparisons', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const body = await res.json().catch(() => ({})) as ComparisonPayload
        if (cancelled) return
        startTransition(() => {
          if (!res.ok) {
            setError(body.detail ?? `HTTP ${res.status}`)
          } else {
            setPayload(body)
          }
          setLoading(false)
        })
      } catch (loadError) {
        if (cancelled) return
        startTransition(() => {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
          setLoading(false)
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Shadow comparisons (read-only)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Contrato SERA_SHADOW_DIVERGENCE_V1 — igualdade literal de P/O/A. ERC excluído.
          Não ativa Shadow Mode.
        </p>
      </div>

      {loading && <p className="text-sm text-slate-400">Carregando…</p>}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {payload && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase text-slate-500">Runs</p>
              <p className="mt-2 text-2xl text-white">{payload.metrics?.runCount ?? payload.count ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase text-slate-500">Triplet match rate</p>
              <p className="mt-2 text-2xl text-white">
                {payload.metrics?.exactTripletMatchRate === null || payload.metrics?.exactTripletMatchRate === undefined
                  ? 'n/a'
                  : payload.metrics.exactTripletMatchRate}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase text-slate-500">Axis agreement</p>
              <p className="mt-2 text-2xl text-white">
                {payload.metrics?.axisAgreementRate === null || payload.metrics?.axisAgreementRate === undefined
                  ? 'n/a'
                  : payload.metrics.axisAgreementRate}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            ercExcluded={String(payload.ercExcluded === true)} · contract={payload.contractId ?? 'unknown'}
          </p>

          <div className="space-y-2">
            {(payload.rows ?? []).map((row) => (
              <div key={row.shadowRunId} className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                <p className="font-mono text-xs text-slate-500">{row.shadowRunId}</p>
                <p className="mt-1">
                  exactTripletMatch={String(row.comparison.exactTripletMatch)} · agreementRate=
                  {row.comparison.agreementRate === null ? 'n/a' : row.comparison.agreementRate} ·
                  comparableAxes={row.comparison.comparableAxisCount}
                </p>
                <p className="mt-1 text-xs text-slate-500">{row.createdAt}</p>
              </div>
            ))}
            {(payload.rows ?? []).length === 0 && (
              <p className="text-sm text-slate-500">Nenhum resultado shadow persistido neste tenant.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Read-only shadow comparison dashboard.
 * Fail-closed unless NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED=true AND
 * server SERA_SHADOW_ADMIN_VIEW_ENABLED=true.
 * Does not enable execution or persistence.
 */
export default function ShadowComparisonsAdminPage() {
  if (!shadowAdminUiEnabled) return <ShadowComparisonsDisabled />
  return <ShadowComparisonsEnabled />
}
