'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type PossibleDuplicate = { eventId: string; title: string; createdAt: string; reason: string }
type DuplicateStatus = { linkedTo: string | null; linkReason: string | null; canReconcile: boolean; duplicates: PossibleDuplicate[] }

export function EventDuplicateReviewPanel({ eventId, token }: { eventId: string; token: string }) {
  const [status, setStatus] = useState<DuplicateStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('Os dois relatos descrevem a mesma ocorrência, com horário apenas formatado de maneira diferente.')
  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/events/${eventId}/duplicates`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'Não foi possível consultar duplicidades.')
      setStatus(data as DuplicateStatus)
      setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na consulta de duplicidade.') }
  }, [eventId, token])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  if (!status?.linkedTo && !status?.duplicates.length && !error) return null
  async function confirmMatch(canonicalEventId: string) {
    if (!status?.canReconcile || reason.trim().length < 10) return
    setBusy(true)
    try {
      const res = await fetch(`/api/events/${eventId}/duplicates`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalEventId, reason: reason.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? 'Não foi possível vincular a ocorrência.')
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao vincular.') }
    finally { setBusy(false) }
  }
  return <section className="rounded-xl border border-amber-700/70 bg-amber-950/25 p-5 space-y-3" aria-label="Verificação de duplicidade">
    <h2 className="text-base font-semibold text-amber-200">Verificação de duplicidade de evento</h2>
    {status?.linkedTo ? <div className="text-sm text-slate-200 space-y-2">
      <p><strong>Duplicidade confirmada por revisão humana.</strong> Este registro foi preservado para auditoria e não será contado novamente nos indicadores consolidados.</p>
      <p>Ocorrência original: <Link className="text-cyan-300 underline" href={`/events/${status.linkedTo}`}>Abrir registro original</Link></p>
      <p className="text-xs text-slate-400">Justificativa: {status.linkReason}</p>
    </div> : status?.duplicates.map((match) => <div key={match.eventId} className="rounded-lg border border-amber-700/40 p-3 space-y-3 text-sm">
      <p className="font-semibold text-amber-200">Possível ocorrência já registrada: {match.title}</p>
      <p className="text-xs text-slate-300">{match.reason}. A correspondência é uma sugestão; não há vinculação automática.</p>
      <Link className="text-cyan-300 underline" href={`/events/${match.eventId}`}>Comparar com registro anterior</Link>
      {status?.canReconcile && <>
        <label className="block text-xs text-slate-200">Justificativa da decisão humana
          <textarea rows={2} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-sm text-white" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <button type="button" disabled={busy || reason.trim().length < 10} onClick={() => void confirmMatch(match.eventId)} className="rounded-lg bg-amber-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-40">{busy ? 'Registrando…' : 'Confirmar: é a mesma ocorrência'}</button>
      </>}
    </div>)}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </section>
}
