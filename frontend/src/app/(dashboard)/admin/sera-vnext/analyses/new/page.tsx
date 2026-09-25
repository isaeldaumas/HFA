'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const betaUiEnabled = process.env.NEXT_PUBLIC_SERA_VNEXT_PRODUCT_BETA_UI_ENABLED?.trim().toLowerCase() === 'true'

export default function NewSeraVNextAnalysisPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [narrative, setNarrative] = useState('')
  const [sourceType, setSourceType] = useState('INTERNAL_PILOT')
  const [sourceReference, setSourceReference] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setError('Sessão ausente')
      setLoading(false)
      return
    }
    try {
      const res = await fetch('/api/admin/sera-vnext/analyses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
          'x-request-id': crypto.randomUUID(),
        },
        cache: 'no-store',
        body: JSON.stringify({
          title,
          narrative,
          sourceType,
          sourceReference: sourceReference || null,
          clientRequestId: crypto.randomUUID(),
          metadata: { internalUseConfirmed: confirmed },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(String(json.detail ?? 'Falha ao criar análise.'))
      const id = String(json.analysis?.id ?? '')
      if (!id) throw new Error('Resposta sem ID de análise.')
      router.push(`/admin/sera-vnext/analyses/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar análise.')
    } finally {
      setLoading(false)
    }
  }

  if (!betaUiEnabled) {
    return <div className="p-8 text-slate-300"><Lock className="mb-3 size-5" /> Product Beta UI disabled.</div>
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div>
        <Link href="/admin/sera-vnext/analyses" className="text-sm text-cyan-300 hover:text-cyan-200">
          ← Voltar à lista
        </Link>
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Nova análise</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Executar motor vNext v0.1 e persistir</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Análise SERA 0.3 ainda não liberada formalmente. Exige revisão humana.</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-4">
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Título" className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400" />
        <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400">
          <option value="INTERNAL_PILOT">Piloto interno</option>
          <option value="REAL_EVENT">Evento real</option>
          <option value="TRAINING">Treinamento</option>
          <option value="OTHER">Outro</option>
        </select>
        <input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Referência da fonte (opcional)" className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400" />
        <textarea value={narrative} onChange={(event) => setNarrative(event.target.value)} maxLength={12000} placeholder="Cole relato factual controlado, sem dados confidenciais." className="min-h-72 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-400" />
        <label className="flex items-start gap-3 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-100">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
          Confirmo que esta análise é interna, não final, sem liberação operacional e sem dados confidenciais indevidos.
        </label>
        {error && <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}
        <button type="button" disabled={loading || !confirmed} onClick={() => void submit()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
          <ShieldCheck className="size-4" /> {loading ? 'Executando...' : 'Criar análise SERA 0.3'}
        </button>
      </div>
    </div>
  )
}
