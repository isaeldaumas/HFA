'use client'

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'
import {
  MultiFileItemResult,
  MultiFileManifest,
  MAX_BATCH_FILE_COUNT,
  MAX_TOTAL_BATCH_BYTES,
  MAX_SINGLE_FILE_BYTES,
} from '@/lib/gemini-multifile-types'

type UiState = 'idle' | 'uploading' | 'success' | 'error'

const MSGS: Record<string, string> = {
  INVALID_TYPE: 'Apenas arquivos PDF, DOCX, TXT, JPEG, PNG ou WebP são aceitos.',
  TOO_LARGE: 'O arquivo não pode ultrapassar 10MB individualmente.',
  BATCH_LIMIT_EXCEEDED: `Máximo de ${MAX_BATCH_FILE_COUNT} arquivos permitidos por evento.`,
  BATCH_TOO_LARGE: 'O tamanho total do lote não pode ultrapassar 30MB.',
  PDF_PASSWORD: 'Este PDF está protegido por senha. Remova a senha antes do envio.',
  PDF_NO_TEXT: 'Este PDF contém apenas imagens e não possui camada de texto extraível.',
  CORRUPT: 'Não foi possível ler o arquivo. Verifique se ele está corrompido.',
  PARSE_FAILED: 'Falha ao processar o arquivo. Tente novamente ou digite o texto manualmente.',
  RATE_LIMIT: 'Limite de extrações por hora atingido. Tente mais tarde.',
}

export interface DocumentUploadProps {
  onExtracted: (
    text: string,
    meta: {
      fileName: string
      wordCount: number
      manifest?: MultiFileManifest
    }
  ) => void
  onFilesReady?: (files: File[]) => void
  onFileReady?: (file: File | null) => void // Retrocompatibilidade com contrato legado
}

export default function DocumentUpload({
  onExtracted,
  onFilesReady,
  onFileReady,
}: DocumentUploadProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UiState>('idle')
  const [filesList, setFilesList] = useState<File[]>([])
  const [manifest, setManifest] = useState<MultiFileManifest | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const [previewItem, setPreviewItem] = useState<MultiFileItemResult | null>(null)

  const processFiles = useCallback(
    async (newFiles: File[]) => {
      setErrMsg('')
      if (newFiles.length === 0) return

      // Concatena com arquivos ja existentes se aplicavel
      const combinedFiles = [...filesList, ...newFiles]
      if (combinedFiles.length > MAX_BATCH_FILE_COUNT) {
        setErrMsg(`Máximo de ${MAX_BATCH_FILE_COUNT} arquivos permitidos (selecionados: ${combinedFiles.length}).`)
        setState('error')
        return
      }

      const totalBytes = combinedFiles.reduce((acc, f) => acc + f.size, 0)
      if (totalBytes > MAX_TOTAL_BATCH_BYTES) {
        setErrMsg(`Tamanho total (${(totalBytes / (1024 * 1024)).toFixed(1)}MB) ultrapassa o limite de 30MB.`)
        setState('error')
        return
      }

      setState('uploading')
      setFilesList(combinedFiles)
      onFilesReady?.(combinedFiles)
      onFileReady?.(combinedFiles[0] ?? null)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setErrMsg('Usuário não autenticado. Faça login novamente.')
        setState('error')
        return
      }

      const fd = new FormData()
      for (const file of combinedFiles) {
        fd.append('files', file)
      }

      try {
        const res = await fetch('/api/extract-document', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          const code = typeof data.error === 'string' ? data.error : ''
          const msg =
            typeof data.message === 'string'
              ? data.message
              : typeof data.detail === 'string'
                ? data.detail
                : MSGS[code] || 'Erro ao extrair documentos'
          setErrMsg(msg)
          setState('error')
          return
        }

        const returnedManifest: MultiFileManifest | undefined =
          data.manifest ||
          (Array.isArray(data.files)
            ? {
                totalFiles: data.totalFiles || data.files.length,
                successfulExtractions: data.successfulExtractions || 0,
                unsupportedOcrCount: data.unsupportedOcrCount || 0,
                failedFilesCount: data.failedFilesCount || 0,
                totalSizeBytes: totalBytes,
                totalWordCount: Number(data.wordCount) || 0,
                items: data.files,
                combinedText: String(data.text || ''),
              }
            : undefined)

        const text = String(data.text || returnedManifest?.combinedText || '')
        const wc = Number(data.wordCount) || returnedManifest?.totalWordCount || 0
        const fn = String(data.fileName || combinedFiles.map((f) => f.name).join(', '))

        if (returnedManifest) {
          setManifest(returnedManifest)
        }
        setState('success')
        onExtracted(text, {
          fileName: fn,
          wordCount: wc,
          manifest: returnedManifest,
        })
      } catch {
        setErrMsg(MSGS.CORRUPT)
        setState('error')
      }
    },
    [filesList, onExtracted, onFilesReady, onFileReady]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length > 0) void processFiles(files)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length > 0) void processFiles(files)
  }

  const removeFile = (index: number) => {
    const updated = filesList.filter((_, i) => i !== index)
    if (updated.length === 0) {
      reset()
    } else {
      setFilesList([])
      void processFiles(updated)
    }
  }

  const reset = () => {
    setState('idle')
    setFilesList([])
    setManifest(null)
    setErrMsg('')
    setPreviewItem(null)
    onFilesReady?.([])
    onFileReady?.(null)
    onExtracted('', { fileName: '', wordCount: 0 })
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onInputChange}
      />

      {state === 'idle' && (
        <>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="w-full cursor-pointer rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 px-6 py-10 text-center text-slate-300 hover:border-blue-500/60 hover:bg-slate-800/50 transition"
          >
            <div className="text-3xl mb-2">📑 📄 🖼️</div>
            <div className="text-base font-semibold text-slate-200">
              {t('analysis.dragDrop') || 'Clique ou arraste até 5 arquivos para ingestão'}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Formatos aceitos: <strong>PDF, DOCX, TXT UTF-8</strong> (extração de texto) e{' '}
              <strong>JPEG, PNG, WebP</strong> (evidências visuais anexadas).
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Limite: 10MB por arquivo | Máximo de 30MB no total do evento.
            </p>
          </div>
          <p className="text-xs text-slate-500 px-1">
            Cada fonte conserva proveniência individual com hash SHA-256 e estado de extração. O sistema compõe o relato factual mantendo identificação separada de cada documento.
          </p>
        </>
      )}

      {state === 'uploading' && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-6 space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-200">
            <span>Processando {filesList.length} arquivo(s)…</span>
            <span className="text-xs text-blue-400 animate-pulse">Auditando segurança e extraindo…</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full w-3/5 bg-blue-500 animate-pulse rounded-full" />
          </div>
          <div className="text-xs text-slate-400">
            {filesList.map((f) => f.name).join(' • ')}
          </div>
        </div>
      )}

      {state === 'success' && manifest && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">
                Fontes Ingeridas ({manifest.totalFiles} arquivo{manifest.totalFiles > 1 ? 's' : ''})
              </h3>
              <p className="text-xs text-slate-400">
                {manifest.successfulExtractions} extração(ões) de texto concluída(s) •{' '}
                {manifest.totalWordCount} palavras extraídas •{' '}
                {manifest.unsupportedOcrCount > 0
                  ? `${manifest.unsupportedOcrCount} anexo(s) sem OCR (evidência preservada)`
                  : 'Todas fontes textuais processadas'}
              </p>
            </div>
            <div className="flex gap-2">
              {manifest.totalFiles < MAX_BATCH_FILE_COUNT && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-200 hover:bg-blue-600/40 transition"
                >
                  + Adicionar mais fontes
                </button>
              )}
              <button
                type="button"
                onClick={reset}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition"
              >
                Limpar tudo
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {manifest.items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-lg">
                    {item.detectedKind === 'pdf'
                      ? '📕'
                      : item.detectedKind === 'docx'
                        ? '📘'
                        : item.detectedKind === 'txt'
                          ? '📄'
                          : '🖼️'}
                  </span>
                  <div className="truncate">
                    <div className="font-medium text-slate-200 truncate">
                      {item.sanitizedName}
                    </div>
                    <div className="text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{(item.sizeBytes / 1024).toFixed(1)} KB</span>
                      <span>•</span>
                      <span className="font-mono text-slate-400" title={item.sha256}>
                        SHA-256: {item.sha256.slice(0, 10)}…
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {item.status === 'extracted' && (
                    <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/80 text-emerald-300 font-medium">
                      ✅ {item.wordCount} palavras
                    </span>
                  )}
                  {item.status === 'unsupported_ocr' && (
                    <span
                      className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300 font-medium"
                      title="OCR pendente de integração nesta fase. Arquivo preservado como anexo."
                    >
                      ⚠️ OCR Não Suportado (Fase 2)
                    </span>
                  )}
                  {item.status !== 'extracted' && item.status !== 'unsupported_ocr' && (
                    <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-800/80 text-red-300 font-medium">
                      ❌ {item.warningOrError || item.status}
                    </span>
                  )}

                  {item.status === 'extracted' && (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      Ver texto
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="text-slate-500 hover:text-red-400 p-1"
                    title="Remover esta fonte"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-4 space-y-2">
          <div className="text-sm font-semibold text-red-300">Falha na ingestão de fontes</div>
          <p className="text-xs text-slate-300">{errMsg}</p>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
              onClick={reset}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Modal simples de visualizacao de texto da fonte individual */}
      {previewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-semibold text-white text-sm">
                Texto extraído de: {previewItem.sanitizedName} ({previewItem.wordCount} palavras)
              </h4>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <textarea
              readOnly
              value={previewItem.text}
              className="w-full h-72 bg-slate-950 border border-slate-800 rounded p-3 text-xs text-slate-300 font-mono resize-none focus:outline-none"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="text-xs px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
