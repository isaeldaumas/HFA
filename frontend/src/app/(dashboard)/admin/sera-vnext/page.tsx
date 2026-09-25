'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type SeraVNextRuntimeStatus =
  | {
      enabled: false
      status: 'DISABLED'
    }
  | {
      enabled: true
      status: 'AVAILABLE'
      baselineId: 'SERA_VNEXT_BASELINE_V0'
      namespace: 'sera-vnext'
      fixtureCount: 7
      expectedOutputCount: 7
      positiveFixtureCount: 3
      syntheticFixtureCount: 1
      controlFixtureCount: 3
      productIntegrated: false
      classificationEnabled: false
      downstreamAllowed: false
      warnings: string[]
    }
  | {
      enabled: true
      status: 'ERROR'
      errorCode: string
      safeMessage: string
    }

const diagnosticsEnabled =
  process.env.NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED?.trim().toLowerCase() === 'true'

export default function AdminSeraVNextPage() {
  const [status, setStatus] = useState<SeraVNextRuntimeStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!diagnosticsEnabled) return

    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setError('Sessão ausente')
        return
      }

      try {
        const res = await fetch('/api/admin/sera-vnext/status', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: 'no-store',
        })
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(String(payload.detail ?? payload.safeMessage ?? 'Status indisponível'))
        setStatus(payload as SeraVNextRuntimeStatus)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Status indisponível')
      }
    })
  }, [])

  if (!diagnosticsEnabled) {
    return (
      <div className="p-5 md:p-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 text-slate-300">
            <Lock className="size-4" />
            <h1 className="text-xl font-semibold">Diagnóstico SERA 0.3 indisponível</h1>
          </div>
          <p className="text-slate-400 text-sm mt-2">
            Defina NEXT_PUBLIC_SERA_VNEXT_DIAGNOSTICS_ENABLED=true em ambiente local para exibir esta superfície interna.
          </p>
        </div>
      </div>
    )
  }

  const available = status?.status === 'AVAILABLE' ? status : null
  const runtimeError = status?.status === 'ERROR' ? status : null

  return (
    <div className="p-5 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Diagnóstico SERA 0.3</h1>
        <p className="text-slate-400 text-sm mt-1">
          Diagnóstico interno somente leitura. Não integrado à classificação e não produz saída operacional.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Status</p>
          <div className="flex items-center gap-2 text-white font-semibold">
            <ShieldCheck className="size-4 text-emerald-400" />
            {available ? 'Available' : runtimeError ? 'Error' : error ? 'Unavailable' : 'Loading'}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Baseline</p>
          <p className="text-white font-semibold">{available?.baselineId ?? '-'}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Namespace</p>
          <p className="text-white font-semibold">{available?.namespace ?? '-'}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-950/40 border border-red-900/50 rounded-xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {runtimeError && (
        <div className="mb-6 bg-amber-950/30 border border-amber-900/50 rounded-xl p-4 text-amber-200 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" />
            {runtimeError.errorCode}
          </div>
          <p className="mt-1 text-amber-100/80">{runtimeError.safeMessage}</p>
        </div>
      )}

      {available && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              ['Fixtures', available.fixtureCount],
              ['Expected outputs', available.expectedOutputCount],
              ['Positive', available.positiveFixtureCount],
              ['Synthetic', available.syntheticFixtureCount],
              ['Controls', available.controlFixtureCount],
            ].map(([label, value]) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-slate-400 text-xs mb-1">{label}</p>
                <p className="text-white text-2xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-3">Runtime locks</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border border-slate-800 p-3 text-slate-300">
                classificationEnabled: {String(available.classificationEnabled)}
              </div>
              <div className="rounded-lg border border-slate-800 p-3 text-slate-300">
                productIntegrated: {String(available.productIntegrated)}
              </div>
              <div className="rounded-lg border border-slate-800 p-3 text-slate-300">
                downstreamAllowed: {String(available.downstreamAllowed)}
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-3">Methodological warnings</h2>
            <ul className="space-y-2 text-sm text-slate-300">
              {available.warnings.map(warning => (
                <li key={warning} className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
