'use client'

import { useState } from 'react'
import {
  buildLocalOcrReviewRecord,localOcrReviewFileName,
  type LocalOcrReviewRecord,
} from '@/lib/browser/local-ocr-human-review'
import {
  downloadVerifiedOcrOriginal, LocalOcrError, OCR_MAX_RENDER_PIXELS,
  prepareOcrText, type OcrSourceIdentity,
} from '@/lib/browser/local-ocr-original'

type Result = {
  text: string
  truncated: boolean
  pageNumber: number | null
  confidence: number | null
  reviewedByHuman: false
  analysisChanged: false
  externalProviderUsed: false
  extractionStatus: 'OCR_UNREVIEWED'
}
const errorMessage: Record<LocalOcrError['code'],string> = {
  INVALID_SOURCE: 'Fonte sem identificação ou hash verificável.',
  DOWNLOAD_FAILED: 'Não foi possível recuperar o original autorizado.',
  INTEGRITY_MISMATCH: 'O arquivo recebido não corresponde à fonte original. OCR bloqueado.',
  UNSUPPORTED_SOURCE: 'O formato desta fonte não é compatível com OCR local.',
  RENDER_LIMIT: 'Documento ou página excede os limites seguros de renderização.',
  OCR_EMPTY: 'Nenhum texto foi reconhecido nesta imagem ou página.',
  OCR_FAILED: 'Não foi possível concluir o OCR neste navegador.',
}
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'))
  if(!blob) throw new LocalOcrError('OCR_FAILED')
  return blob
}
async function renderForLocalOcr(blob: Blob, mimeType: string, pageNumber: number) {
  const canvas=document.createElement('canvas')
  let actualPage: number|null=null
  if(mimeType==='application/pdf') {
    const pdfjs=await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc='/ocr/pdf.worker.min.mjs'
    const data=new Uint8Array(await blob.arrayBuffer())
    const loading=pdfjs.getDocument({
      data, isEvalSupported:false, enableXfa:false, useSystemFonts:true,
    })
    let pdf: Awaited<typeof loading.promise>|null=null
    try {
      pdf=await loading.promise
      if(pdf.numPages<1 || pdf.numPages>80 ||
         !Number.isInteger(pageNumber) || pageNumber<1 || pageNumber>pdf.numPages) {
        throw new LocalOcrError('RENDER_LIMIT')
      }
      const page=await pdf.getPage(pageNumber)
      const base=page.getViewport({scale:1})
      if(base.width<1 || base.height<1 || !Number.isFinite(base.width*base.height)) {
        throw new LocalOcrError('RENDER_LIMIT')
      }
      const scale=Math.min(1.9,Math.sqrt(OCR_MAX_RENDER_PIXELS/(base.width*base.height)))
      if(scale<0.1) throw new LocalOcrError('RENDER_LIMIT')
      const viewport=page.getViewport({scale})
      const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height)
      if(width*height>OCR_MAX_RENDER_PIXELS+4096) throw new LocalOcrError('RENDER_LIMIT')
      canvas.width=width;canvas.height=height
      const ctx=canvas.getContext('2d',{alpha:false})
      if(!ctx) throw new LocalOcrError('OCR_FAILED')
      await page.render({canvasContext:ctx,canvas,viewport}).promise
      actualPage=page.pageNumber
    } finally {
      await pdf?.destroy()
      if(!pdf) await loading.destroy()
    }
  } else {
    if(!['image/png','image/jpeg','image/webp'].includes(mimeType)) {
      throw new LocalOcrError('UNSUPPORTED_SOURCE')
    }
    const bitmap=await createImageBitmap(blob)
    try {
      if(bitmap.width<1 || bitmap.height<1 ||
         bitmap.width>8192 || bitmap.height>8192 ||
         bitmap.width*bitmap.height>25_000_000) {
        throw new LocalOcrError('RENDER_LIMIT')
      }
      const scale=Math.min(1,Math.sqrt(OCR_MAX_RENDER_PIXELS/(bitmap.width*bitmap.height)))
      canvas.width=Math.floor(bitmap.width*scale)
      canvas.height=Math.floor(bitmap.height*scale)
      const ctx=canvas.getContext('2d',{alpha:false})
      if(!ctx) throw new LocalOcrError('OCR_FAILED')
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height)
    } finally {bitmap.close()}
  }
  const image=await canvasToBlob(canvas)
  canvas.width=0;canvas.height=0
  return {image,actualPage}
}

/**
 * Entire OCR is deliberately isolated from API writes, SERA state and
 * third-party OCR providers. The source is downloaded from the same origin,
 * hash-verified locally and recognized using self-hosted WASM/language assets.
 */
export function EventLocalOcrPreview({
  eventId,documentId,sourceOrdinal,sha256,mimeType,sizeBytes,accessToken,
}: {
  eventId:string
  documentId:string
  sourceOrdinal:number
  sha256:string|null
  mimeType:string|null
  sizeBytes:number
  accessToken:string
}) {
  const [page,setPage]=useState('1')
  const [busy,setBusy]=useState(false)
  const [progress,setProgress]=useState('')
  const [error,setError]=useState('')
  const [result,setResult]=useState<Result|null>(null)
  const [correctedText,setCorrectedText]=useState('')
  const [comparedToOriginal,setComparedToOriginal]=useState(false)
  const [checkedCorrections,setCheckedCorrections]=useState(false)
  const [localReview,setLocalReview]=useState<LocalOcrReviewRecord|null>(null)
  function invalidateReview() {
    setLocalReview(null)
    setComparedToOriginal(false)
    setCheckedCorrections(false)
  }

  const isPdf=mimeType==='application/pdf'
  const eligible=mimeType!==null &&
    (isPdf||['image/png','image/jpeg','image/webp'].includes(mimeType))
  async function recognize() {
    if(busy || !eligible || !sha256 || !mimeType || !accessToken) return
    setBusy(true);setError('');setResult(null);setCorrectedText('');invalidateReview();setProgress('Conferindo original...')
    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>>|null=null
    try {
      const source: OcrSourceIdentity = {
        eventId,documentId,sourceOrdinal,sha256,mimeType,sizeBytes,
      }
      const original=await downloadVerifiedOcrOriginal(source,accessToken)
      setProgress('Preparando imagem no navegador...')
      const pageNumber=Number(page)
      const {image,actualPage}=await renderForLocalOcr(original,mimeType,pageNumber)
      setProgress('Carregando modelos locais de português e inglês...')
      const {createWorker}=await import('tesseract.js')
      worker=await createWorker(['por','eng'],1,{
        workerPath:'/ocr/worker.min.js',
        corePath:'/ocr/core',
        langPath:'/ocr/lang',
        workerBlobURL:false,
        gzip:true,
        cacheMethod:'none',
        logger:(entry)=>{
          if(entry.status==='recognizing text') {
            setProgress('Reconhecendo texto localmente: '+
              Math.round(Math.max(0,Math.min(1,entry.progress))*100)+'%')
          }
        },
      })
      const ocr=await worker.recognize(image)
      const prepared=prepareOcrText(ocr.data.text)
      setResult({
        ...prepared,
        pageNumber:actualPage,
        confidence:Number.isFinite(ocr.data.confidence)?ocr.data.confidence:null,
        reviewedByHuman:false,analysisChanged:false,externalProviderUsed:false,
        extractionStatus:'OCR_UNREVIEWED',
      })
      setCorrectedText(prepared.text)
      setProgress('')
    } catch(err) {
      setProgress('')
      const code=err instanceof LocalOcrError?err.code:'OCR_FAILED'
      setError(errorMessage[code])
    } finally {
      await worker?.terminate().catch(()=>undefined)
      setBusy(false)
    }
  }
  function declareReview() {
    if(!result || !sha256 || !mimeType) return
    try {
      const source:OcrSourceIdentity={
        eventId,documentId,sourceOrdinal,sha256,mimeType,sizeBytes,
      }
      const record=buildLocalOcrReviewRecord({
        source,pageNumber:result.pageNumber,originalText:result.text,
        correctedText,ocrTruncated:result.truncated,
        comparedToOriginal,checkedCorrections,
      })
      setLocalReview(record)
      setError('')
    } catch {
      setLocalReview(null)
      setError('Revisão não confirmada: verifique original, conteúdo integral e declarações.')
    }
  }
  function downloadLocalReview() {
    if(!localReview) return
    // Explicit user action only: no server write or silent export.
    const data=new Blob([JSON.stringify(localReview,null,2)],{
      type:'application/json;charset=utf-8',
    })
    const url=URL.createObjectURL(data)
    try {
      const a=document.createElement('a')
      a.href=url
      a.download=localOcrReviewFileName(localReview)
      a.click()
    } finally {
      setTimeout(()=>URL.revokeObjectURL(url),1000)
    }
  }
  if(!eligible) return null
  if(!sha256) return <p className="mt-2 text-xs text-slate-500">
    OCR bloqueado: esta fonte não possui SHA-256 verificável.
  </p>
  return <div className="mt-3 space-y-2 rounded border border-slate-700 p-3">
    <p className="text-xs font-semibold text-slate-200">OCR local · fonte {sourceOrdinal}</p>
    <p className="text-xs text-slate-400">
      O reconhecimento usa modelos executados neste navegador, carregados do próprio HFA.
      O texto não é enviado a serviços externos nem gravado no servidor.
      Confira cada trecho no documento original: OCR não comprova fatos nem valida o SERA.
    </p>
    {isPdf && <label className="flex items-center gap-2 text-xs text-slate-300">
      Página do PDF (1 a 80):
      <input type="number" min={1} max={80} step={1} value={page}
        onChange={e=>setPage(e.target.value)} disabled={busy}
        className="w-20 rounded border border-slate-600 bg-slate-900 px-2 py-1"/>
      <span>Uma página por solicitação.</span>
    </label>}
    <button type="button" onClick={()=>void recognize()} disabled={busy}
      className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-40">
      {busy?'Processando no navegador...':isPdf?'Reconhecer página por OCR local':'Reconhecer imagem por OCR local'}
    </button>
    {progress && <p role="status" className="text-xs text-slate-400">{progress}</p>}
    {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
    {result && <div className="space-y-2">
      <p className="text-xs font-semibold text-amber-300">
        Texto gerado automaticamente · NÃO REVISADO
        {result.pageNumber?' · página '+result.pageNumber:''}
      </p>
      <p className="text-xs text-slate-400">
        {result.confidence===null?'':('Confiança técnica estimada: '+result.confidence.toFixed(1)+'%. ')}
        Essa pontuação não mede fidelidade factual ou validade científica.
        {result.truncated?' Texto limitado a 60.000 caracteres.':''}
      </p>
      <textarea value={result.text} readOnly rows={12}
        aria-label={'Texto OCR não revisado da fonte '+sourceOrdinal}
        className="w-full resize-y rounded border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-100"/>
      <fieldset className="space-y-2 border-t border-slate-700 pt-3">
        <legend className="text-xs font-semibold text-slate-200">
          Conferência humana da transcrição (somente nesta sessão)
        </legend>
        <p className="text-xs text-slate-400">
          Compare o OCR com o arquivo original por meio do download de anexos.
          Corrija apenas erros de reconhecimento. Não acrescente interpretações,
          hipóteses, conclusões causais ou fatos ausentes da fonte.
        </p>
        <textarea value={correctedText}
          onChange={e=>{invalidateReview();setCorrectedText(e.target.value)}}
          rows={12} maxLength={60000}
          aria-label={'Transcrição corrigida da fonte '+sourceOrdinal}
          className="w-full resize-y rounded border border-slate-600 bg-slate-900 p-3 font-mono text-xs text-slate-100"/>
        <label className="flex items-start gap-2 text-xs text-slate-200">
          <input type="checkbox" checked={comparedToOriginal} onChange={e=>{
            setLocalReview(null);setComparedToOriginal(e.target.checked)
          }}/>
          Comparei pessoalmente a transcrição com a imagem ou página original.
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-200">
          <input type="checkbox" checked={checkedCorrections} onChange={e=>{
            setLocalReview(null);setCheckedCorrections(e.target.checked)
          }}/>
          Revisei o texto, corrigi eventuais erros e não introduzi informações não presentes na fonte.
        </label>
        {result.truncated && <p role="alert" className="text-xs text-amber-300">
          Prévia truncada: revisão integral indisponível. Não é possível declarar conferência concluída.
        </p>}
        <button type="button" onClick={declareReview}
          disabled={result.truncated || !comparedToOriginal || !checkedCorrections ||
            !correctedText.trim() || correctedText.length>60000}
          className="rounded border border-slate-500 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-40">
          Declarar conferência local
        </button>
        {localReview && <div className="space-y-2">
          <p role="status" className="text-xs text-amber-300">
            Conferência declarada nesta sessão. Sem assinatura, identificação verificável
            do revisor ou registro de auditoria no servidor.
          </p>
          <button type="button" onClick={downloadLocalReview}
            className="rounded border border-slate-500 px-3 py-1.5 text-xs text-slate-100">
            Baixar transcrição e proveniência (.json)
          </button>
          <p className="text-xs text-slate-400">
            O arquivo é exportado somente por sua ação e pode conter informações
            confidenciais. Guarde-o conforme a política da organização.
            Exportação não equivale a validação científica nem a incorporação à análise.
          </p>
        </div>}
      </fieldset>
      <p className="break-all font-mono text-[10px] text-slate-500">SHA-256: {sha256}</p>
      <p className="text-xs text-slate-400">
        Resultado temporário. Nenhum evento, narrativa, categoria P/O/A ou análise SERA foi alterado.
      </p>
      <button type="button" onClick={()=>{setResult(null);setCorrectedText('');invalidateReview()}}
        className="text-xs underline text-slate-400">Descartar prévia</button>
    </div>}
  </div>
}
