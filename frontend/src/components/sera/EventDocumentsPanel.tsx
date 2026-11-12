'use client'

import { useEffect, useRef, useState } from 'react'
import { EventSourceTextPreview } from './EventSourceTextPreview'

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
const DOWNLOAD_PART_BYTES = 3_800_000
const MAX_APPEND_BYTES = 3_800_000
const MAX_SOURCES = 5

type PendingDocument = {
  id: string
  file: File
  state: 'queued' | 'uploading' | 'success' | 'error' | 'unverified'
  message: string
}

/** Read-only evidence access; never submits new files or modifies SERA results. */
export function EventDocumentsPanel({
  eventId, accessToken, canAppend = false,
}: { eventId: string; accessToken: string | null; canAppend?: boolean }) {
  const [documents, setDocuments] = useState<EventDocument[] | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDocument[]>([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [refreshCounter, setRefreshCounter] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

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
  }, [eventId, accessToken, refreshCounter])

  if (!accessToken) return null

  async function download(item: EventDocument) {
    if (!accessToken || downloading) return
    setDownloading(item.id)
    setError('')
    try {
      const fileSize = item.sizeBytes
      if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_BYTES) {
        throw new Error('UNVERIFIED_SIZE')
      }
      const chunks: ArrayBuffer[] = []
      for (let start = 0; start < fileSize; start += DOWNLOAD_PART_BYTES) {
        const end = Math.min(fileSize-1,start+DOWNLOAD_PART_BYTES-1)
        const ranged = fileSize > DOWNLOAD_PART_BYTES
        const res = await fetch('/api/events/' + eventId + '/documents/' + item.id, {
          method:'GET',
          headers:{
            Authorization:'Bearer '+accessToken,
            ...(ranged ? {Range:'bytes='+start+'-'+end} : {}),
          },
          cache:'no-store',
        })
        if (!res.ok || res.status !== (ranged ? 206 : 200)) {
          throw new Error('DOCUMENT_UNAVAILABLE')
        }
        const length = Number(res.headers.get('content-length') ?? NaN)
        if (length !== end-start+1) throw new Error('DOCUMENT_SIZE_MISMATCH')
        if (ranged && res.headers.get('content-range') !==
          'bytes '+start+'-'+end+'/'+fileSize) {
          throw new Error('INVALID_CONTENT_RANGE')
        }
        const chunk = await res.arrayBuffer()
        if (chunk.byteLength !== length) throw new Error('DOCUMENT_SIZE_MISMATCH')
        chunks.push(chunk)
      }
      const blob = new Blob(chunks, {type:item.mimeType || 'application/octet-stream'})
      if (blob.size !== fileSize) throw new Error('DOCUMENT_SIZE_MISMATCH')
      if (item.sha256) {
        const digest = await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())
        const actual = [...new Uint8Array(digest)].map((n)=>n.toString(16).padStart(2,'0')).join('')
        if (actual !== item.sha256) throw new Error('DOCUMENT_HASH_MISMATCH')
      }
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

  const slots = Math.max(0, MAX_SOURCES - (documents?.length ?? MAX_SOURCES))
  const queuedCount = pending.filter((item) => item.state === 'queued' || item.state === 'error').length

  function queueFiles(files: FileList | File[]) {
    if (uploadBusy || !documents) return
    setUploadError('')
    const candidates = Array.from(files)
    const existingPending = pending.filter((item) => item.state === 'queued' || item.state === 'error')
    const available = Math.max(0, slots - existingPending.length)
    if (candidates.length > available) {
      setUploadError('Quantidade acima das vagas disponíveis. Cada evento aceita no máximo cinco fontes.')
    }
    const next: PendingDocument[] = []
    for (const file of candidates.slice(0, available)) {
      if (file.size === 0 || file.size > MAX_APPEND_BYTES ||
          !/\.(pdf|docx|txt|png|jpe?g|webp)$/i.test(file.name)) {
        setUploadError('Arquivos adicionais devem ser PDF/DOCX/TXT/PNG/JPEG/WebP de até 3,8 MB cada.')
        continue
      }
      next.push({id:crypto.randomUUID(),file,state:'queued',message:'Aguardando envio'})
    }
    if (next.length) setPending((current) => [...current,...next])
  }

  function movePending(id: string, step: -1 | 1) {
    if (uploadBusy) return
    setPending((current) => {
      const next = current.slice()
      const index = next.findIndex((item) => item.id === id)
      if (index < 0 || index + step < 0 || index + step >= next.length) return current
      if (next[index].state === 'success' || next[index].state === 'unverified' ||
          next[index+step].state === 'success' || next[index+step].state === 'unverified') return current
      const element = next[index]
      next[index] = next[index+step]
      next[index+step] = element
      return next
    })
  }

  async function appendPendingFiles() {
    if (!accessToken || !documents || uploadBusy) return
    setUploadBusy(true)
    setUploadError('')
    let successCount = 0
    // Sequential, single-file requests: a failed upload cannot discard prior
    // successful evidence. Only terminal successes are skipped on retry.
    for (const item of pending) {
      if (item.state === 'success' || item.state === 'unverified') continue
      if (documents.length + successCount >= MAX_SOURCES) {
        setPending((current) => current.map((row) =>
          row.id === item.id ? {...row,state:'error',message:'Limite de cinco fontes atingido.'} : row))
        continue
      }
      setPending((current) => current.map((row) =>
        row.id === item.id ? {...row,state:'uploading',message:'Enviando...'} : row))
      try {
        const body = new FormData()
        body.set('file',item.file)
        const response = await fetch('/api/events/' + eventId + '/documents', {
          method:'POST',headers:{Authorization:'Bearer '+accessToken},body,
        })
        const result = await response.json().catch(()=>({})) as {
          detail?:string;status?:string;sourceOrdinal?:number
        }
        if (!response.ok) throw new Error(result.detail || 'Falha ao anexar documento.')
        const warning = result.status === 'audit_unverified'
        if (result.status === 'created') successCount++
        setPending((current) => current.map((row) => row.id === item.id ? {
          ...row,state:warning?'unverified':'success',
          message:warning?'Documento indexado; auditoria pendente. Verifique antes de reenviar.':
            result.status==='already_present'?'Arquivo já registrado (sem duplicar).':
            'Original registrado, sem extração automática.',
        } : row))
      } catch (err) {
        setPending((current) => current.map((row) => row.id === item.id ? {
          ...row,state:'error',
          message:err instanceof Error?err.message:'Falha de comunicação.',
        } : row))
      }
    }
    setRefreshCounter((counter)=>counter+1)
    setUploadBusy(false)
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
              {canAppend && item.mimeType?.startsWith('image/') && (
                <p className="mt-2 text-xs text-amber-300">
                  Imagem original preservada. OCR indisponível; nenhum texto foi extraído,
                  revisado ou incorporado à análise SERA.
                </p>
              )}
              {canAppend && !item.mimeType?.startsWith('image/') && (
                <EventSourceTextPreview
                  key={eventId + ':' + item.sha256}
                  eventId={eventId}
                  documentId={item.id}
                  sourceOrdinal={item.sourceOrdinal}
                  sha256={item.sha256}
                  accessToken={accessToken}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canAppend && documents && slots > 0 && (
        <div className="mt-4 space-y-3 border-t border-slate-700 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-slate-200">Acrescentar fontes originais</p>
            <p className="text-xs text-slate-400">{slots} vaga(s) · PDF/DOCX/TXT/PNG/JPEG/WebP · 3,8 MB por arquivo</p>
          </div>
          <input ref={inputRef} type="file" multiple disabled={uploadBusy}
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/png,image/jpeg,image/webp"
            className="hidden" onChange={(ev) => {
              if (ev.currentTarget.files) queueFiles(ev.currentTarget.files)
              ev.currentTarget.value = ''
            }} />
          <button type="button" disabled={uploadBusy}
            onDragOver={(ev)=>ev.preventDefault()}
            onDrop={(ev)=>{ev.preventDefault();queueFiles(ev.dataTransfer.files)}}
            onClick={()=>inputRef.current?.click()}
            className="w-full rounded-lg border-2 border-dashed border-slate-600 px-4 py-5 text-sm text-slate-300 hover:border-cyan-600 disabled:opacity-50">
            Selecionar ou arrastar documentos ou imagens adicionais
          </button>
          {pending.length > 0 && (
            <ol className="space-y-2">
              {pending.map((item,index)=>(
                <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                  <span className="min-w-0 flex-1 break-all">{item.file.name} · {item.message}</span>
                  {(item.state==='queued'||item.state==='error') && !uploadBusy && (
                    <>
                      <button type="button" aria-label={'Subir '+item.file.name}
                        disabled={index===0}
                        onClick={()=>movePending(item.id,-1)}
                        className="rounded border border-slate-700 px-2 py-1 disabled:opacity-30">↑</button>
                      <button type="button" aria-label={'Descer '+item.file.name}
                        disabled={index===pending.length-1}
                        onClick={()=>movePending(item.id,1)}
                        className="rounded border border-slate-700 px-2 py-1 disabled:opacity-30">↓</button>
                      <button type="button"
                        onClick={()=>setPending((items)=>items.filter((row)=>row.id!==item.id))}
                        className="rounded border border-slate-700 px-2 py-1">Remover</button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
          {uploadError && <p role="alert" className="text-xs text-red-300">{uploadError}</p>}
          <button type="button" disabled={uploadBusy||queuedCount===0}
            onClick={()=>void appendPendingFiles()}
            className="rounded-lg bg-cyan-800 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">
            {uploadBusy?'Registrando fontes...':'Registrar arquivos selecionados'}
          </button>
          <p className="text-xs text-slate-400">
            Envio sequencial: arquivos concluídos permanecem salvos em caso de falha
            posterior. Não reenvie um arquivo marcado como auditoria pendente.
          </p>
        </div>
      )}
      <p className="mt-3 text-[11px] text-amber-300/80">
        Anexar um arquivo não significa que seu conteúdo tenha sido extraído ou validado pelo investigador,
        nem altera a narrativa ou a classificação SERA existente.
      </p>
    </section>
  )
}
