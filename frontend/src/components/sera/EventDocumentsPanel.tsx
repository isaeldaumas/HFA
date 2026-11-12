'use client'

import { useEffect, useState } from 'react'

type EventDocument = {
  id: string
  fileName: string
  mimeType: string | null
  sizeBytes: number
  sourceOrdinal: number
  sha256: string | null
  createdAt: string
}

const MAX_BYTES = 10 * 1024 * 1024

/** Read-only evidence access; never submits new files or modifies SERA results. */
export function EventDocumentsPanel({
  eventId, accessToken,
}: { eventId: string; accessToken: string | null }) {
  const [documents, setDocuments] = useState<EventDocument[] | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    async function load() {
      setDocuments(null)
      setError('')
      try {
        const res = await fetch('/api/events/' + eventId + '/documents', {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + accessToken },
          signal: controller.signal, cache: 'no-store',
        })
        if (!res.ok) throw new Error('FETCH_FAILED')
        const body = await res.json() as { documents?: EventDocument[] }
        if (!Array.isArray(body.documents)) throw new Error('INVALID_RESPONSE')
        if (!controller.signal.aborted) setDocuments(body.documents)
      } catch {
        if (!controller.signal.aborted) setError('Não foi possível consultar os anexos do evento.')
      }
    }
    void load()
    return () => controller.abort()
  }, [eventId, accessToken])

  if (!accessToken) return null

  async function download(item: EventDocument) {
    if (!accessToken || downloading) return
    setDownloading(item.id)
    setError('')
    try {
      const res = await fetch('/api/events/' + eventId + '/documents/' + item.id, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error('DOCUMENT_UNAVAILABLE')
      const size = Number(res.headers.get('content-length') ?? NaN)
      if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) {
        throw new Error('DOCUMENT_TOO_LARGE')
      }
      const buffer = await res.arrayBuffer()
      if (buffer.byteLength !== size) throw new Error('DOCUMENT_SIZE_MISMATCH')
      const blob = new Blob([buffer], {
        type: item.mimeType || 'application/octet-stream',
      })
      const url = URL.createObjectURL(blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = item.fileName.replace(/[\\/]/g, '_')
        anchor.click()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setError('Download não concluído. A integridade do documento ou o acesso precisam ser verificados.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <section aria-label="Anexos e proveniência do evento" className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Documentos de origem</h2>
        <p className="text-xs text-slate-400">Arquivos originais · somente leitura</p>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {!documents && !error && <p className="mt-2 text-xs text-slate-400">Consultando anexos...</p>}
      {documents?.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Nenhum documento de origem indexado. Isso não confirma ausência de outras evidências.
        </p>
      )}
      {documents && documents.length > 0 && (
        <ul className="mt-3 space-y-2">
          {documents.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-700 bg-slate-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-200">
                    {'Fonte ' + item.sourceOrdinal + ' · ' + item.fileName}
                  </p>
                  <p className="text-xs text-slate-400">{Math.ceil(item.sizeBytes / 1024)} KiB · {item.mimeType ?? 'tipo não identificado'}</p>
                </div>
                <button type="button" onClick={() => void download(item)}
                  disabled={downloading !== null}
                  className="shrink-0 rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50 hover:bg-slate-800">
                  {downloading === item.id ? 'Baixando...' : 'Baixar original'}
                </button>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
                SHA-256: {item.sha256 || 'não registrado (documento legado, integridade não comprovada)'}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-amber-300/80">
        Anexar um arquivo não significa que seu conteúdo tenha sido extraído ou validado pelo investigador.
      </p>
    </section>
  )
}
