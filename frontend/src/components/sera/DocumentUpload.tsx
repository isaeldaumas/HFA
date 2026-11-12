'use client'

import { useCallback, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n'

type UiState = 'idle' | 'uploading' | 'success' | 'error'

const MSGS: Record<string, string> = {
  INVALID_TYPE: 'Apenas arquivos PDF ou DOCX são aceitos',
  TOO_LARGE: 'Em produção, selecione um arquivo de até 3,8 MB por vez.',
  PDF_PASSWORD: 'Este PDF está protegido. Remova a senha antes de fazer o upload.',
  PDF_NO_TEXT:
    'Este PDF contém apenas imagens e não pode ser processado automaticamente. Por favor, digite o texto manualmente.',
  CORRUPT: 'Não foi possível ler o arquivo. Verifique se ele está corrompido.',
  PARSE_FAILED: 'Não foi possível ler o arquivo. Verifique se ele está corrompido.',
  RATE_LIMIT: 'Limite de extrações por hora atingido. Tente mais tarde.',
}

type Props = {
  onExtracted: (text: string, meta: { fileName: string; wordCount: number }) => void
  onFileReady?: (file: File | null) => void
}

export default function DocumentUpload({ onExtracted, onFileReady }: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UiState>('idle')
  const [fileName, setFileName] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [extractedPreview, setExtractedPreview] = useState('')
  const [errMsg, setErrMsg] = useState('')

  const uploadFile = useCallback(
    async (file: File) => {
      setErrMsg('')
      setFileName(file.name)
      onFileReady?.(null)
      if (file.size === 0 || file.size > 3_800_000) {
        setErrMsg(file.size === 0 ? 'Arquivo vazio.' : MSGS.TOO_LARGE)
        setState('error')
        return
      }
      setState('uploading')
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setErrMsg('Não autenticado')
        setState('error')
        return
      }
      const fd = new FormData()
      fd.set('file', file)
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
                : MSGS[code] || 'Erro ao extrair texto'
          setErrMsg(msg)
          setState('error')
          return
        }
        const text = String(data.text || '')
        const wc = Number(data.wordCount) || 0
        const fn = String(data.fileName || file.name)
        setWordCount(wc)
        setExtractedPreview(text.slice(0, 4000))
        setState('success')
        onExtracted(text, { fileName: fn, wordCount: wc })
        onFileReady?.(file)
      } catch {
        setErrMsg(MSGS.CORRUPT)
        setState('error')
      }
    },
    [onExtracted, onFileReady]
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) uploadFile(f)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0]
    if (f) uploadFile(f)
  }

  const reset = () => {
    setState('idle')
    setFileName('')
    setWordCount(0)
    setExtractedPreview('')
    setErrMsg('')
    onFileReady?.(null)
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={onInputChange}
      />

      {state === 'idle' && (
        <>
          <button
            type="button"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className="w-full rounded-xl border-2 border-dashed border-slate-600 bg-slate-900/40 px-6 py-12 text-center text-slate-300 hover:border-blue-500/60 hover:bg-slate-800/50 transition"
          >
            <div className="text-lg mb-1">📄 {t('analysis.dragDrop')}</div>
            <div className="text-xs text-slate-500 mt-3">{t('analysis.fileTypes')}</div>
          </button>
          <p className="text-xs text-slate-600 px-1">
            Relatórios brutos, narrativas parciais e documentos operacionais são aceitos. O sistema identifica lacunas de evidência e as sinaliza ao investigador.
          </p>
        </>
      )}

      {state === 'uploading' && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-4">
          <div className="text-sm text-slate-200 mb-2 truncate">📄 {fileName}</div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div className="h-full w-2/5 bg-blue-500 animate-pulse rounded-full" />
          </div>
          <p className="text-xs text-slate-400 mt-2">{t('analysis.extracting')}</p>
        </div>
      )}

      {state === 'success' && (
        <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 px-4 py-4 space-y-3">
          <div className="text-sm text-emerald-200">✅ {fileName}</div>
          <div className="text-xs text-slate-400">{wordCount} {t('analysis.wordsExtracted')}</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600"
              onClick={() => alert(extractedPreview.slice(0, 8000) + (extractedPreview.length >= 4000 ? '…' : ''))}
            >
              Visualizar texto
            </button>
            <button
              type="button"
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
              onClick={reset}
            >
              Trocar arquivo
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/25 px-4 py-4 space-y-2">
          <div className="text-sm text-red-300">❌ {t('common.error')}</div>
          <p className="text-xs text-slate-400">{errMsg}</p>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200"
            onClick={reset}
          >
            {t('analysis.retryUpload')}
          </button>
        </div>
      )}
    </div>
  )
}
