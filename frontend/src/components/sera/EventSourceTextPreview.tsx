'use client'

import { useState } from 'react'

type Preview = {
  documentId: string
  sourceOrdinal: number
  fileName: string
  sha256: string
  text: string
  previewChars: number
  truncated: boolean
  wordCountInPreview: number
  extractionStatus: 'TEXT_PREVIEW' | 'TEXT_PREVIEW_TRUNCATED'
  reviewedByHuman: false
  analysisChanged: false
  citationLevel: 'DOCUMENT_ONLY'
  externalProviderUsed: false
}

export function EventSourceTextPreview({
  eventId, documentId, sourceOrdinal, sha256, accessToken,
}: {
  eventId: string
  documentId: string
  sourceOrdinal: number
  sha256: string | null
  accessToken: string
}) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')

  async function extract() {
    if (loading || !accessToken || !sha256) return
    setError('')
    setPreview(null)
    setLoading(true)
    try {
      const response = await fetch(
        '/api/events/' + eventId + '/documents/' + documentId + '/preview',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + accessToken },
          cache: 'no-store',
        },
      )
      const result: unknown = await response.json()
      if (!response.ok) {
        const message = typeof result === 'object' && result !== null &&
          'message' in result && typeof result.message === 'string'
          ? result.message : 'Não foi possível extrair o texto da fonte.'
        throw new Error(message)
      }
      if (typeof result !== 'object' || result === null ||
          !('documentId' in result) || result.documentId !== documentId ||
          !('sha256' in result) || result.sha256 !== sha256 ||
          !('sourceOrdinal' in result) || result.sourceOrdinal !== sourceOrdinal ||
          !('text' in result) || typeof result.text !== 'string' ||
          !('analysisChanged' in result) || result.analysisChanged !== false ||
          !('reviewedByHuman' in result) || result.reviewedByHuman !== false ||
          !('citationLevel' in result) || result.citationLevel !== 'DOCUMENT_ONLY') {
        throw new Error('A resposta da extração não corresponde à fonte original.')
      }
      setPreview(result as Preview)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha de extração.')
    } finally {
      setLoading(false)
    }
  }

  if (!sha256) {
    return <p className="mt-2 text-xs text-slate-500">
      Prévia indisponível: documento legado sem hash de integridade.
    </p>
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void extract()}
          disabled={loading}
          className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          {loading ? 'Extraindo texto...' : 'Extrair texto para revisão'}
        </button>
        {preview && (
          <button type="button" onClick={() => setPreview(null)}
            className="text-xs text-slate-400 underline">
            Ocultar prévia
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      {preview && (
        <div className="space-y-2 rounded-lg border border-amber-700/60 bg-slate-950/70 p-3">
          <p className="text-xs font-medium text-amber-300">
            Fonte {preview.sourceOrdinal} · prévia não revisada por humano
          </p>
          <p className="text-xs text-slate-300">
            {preview.wordCountInPreview} palavras exibidas.
            {preview.truncated
              ? ' Prévia truncada: o arquivo contém mais texto que o limite de exibição.'
              : ' Texto extraído para inspeção, sem validação científica.'}
          </p>
          <p className="text-xs text-slate-400">
            Proveniência em nível de documento, sem citações por página. Nenhuma
            alteração no relato, nos resultados SERA ou nas hipóteses causais.
          </p>
          <textarea
            aria-label={'Texto extraído da fonte ' + preview.sourceOrdinal}
            value={preview.text}
            readOnly
            rows={12}
            className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100"
          />
          <p className="break-all font-mono text-[10px] text-slate-500">
            SHA-256 do documento original: {preview.sha256}
          </p>
          <p className="text-xs text-slate-400">
            O texto fica nesta visualização temporária; não é gravado nem
            enviado a provedores externos. Verifique o original antes de citar.
          </p>
        </div>
      )}
    </div>
  )
}
