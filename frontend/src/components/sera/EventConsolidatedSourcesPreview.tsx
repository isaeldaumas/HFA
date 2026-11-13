'use client'

import {useState} from 'react'
import {
  assembleVerifiedSourceBundle,
  type SourceIdentity,type VerifiedSourcePreview,type BundleResult,
} from '@/lib/browser/verified-source-bundle'

/**
 * This is an unsaved review draft, NOT SERA narrative input. Analysts choose
 * sources explicitly; image OCR and failed/truncated previews are excluded.
 */
export function EventConsolidatedSourcesPreview({
  eventId, accessToken, documents,
}:{
  eventId:string
  accessToken:string
  documents:SourceIdentity[]
}){
  const [selected,setSelected]=useState<string[]>([])
  const [busy,setBusy]=useState(false)
  const [bundle,setBundle]=useState<BundleResult|null>(null)
  const [error,setError]=useState('')
  const [rejected,setRejected]=useState<string[]>([])
  const [copied,setCopied]=useState(false)
  const eligible=documents.filter(item=>item.sha256 &&
    ['application/pdf','text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ].includes(item.mimeType??''))
  async function prepare(){
    if(busy||!selected.length)return
    setBusy(true);setError('');setBundle(null);setRejected([]);setCopied(false)
    const previews:Record<string,VerifiedSourcePreview>={}
    const skipped:string[]=[]
    try{
      for(const source of eligible.filter(item=>selected.includes(item.id))){
        try{
          const response=await fetch(
            '/api/events/'+eventId+'/documents/'+source.id+'/preview',{
              method:'POST',headers:{Authorization:'Bearer '+accessToken},
              cache:'no-store',redirect:'error',
            })
          if(response.status!==200) {
            skipped.push('Fonte '+source.sourceOrdinal+': sem prévia textual verificada (HTTP '+response.status+').')
            await response.body?.cancel().catch(()=>undefined)
            continue
          }
          const output:unknown=await response.json()
          if(!output||typeof output!=='object'||!('documentId' in output)){
            skipped.push('Fonte '+source.sourceOrdinal+': resposta inválida.')
            continue
          }
          previews[source.id]=output as VerifiedSourcePreview
        }catch{
          skipped.push('Fonte '+source.sourceOrdinal+': extração não confirmada.')
        }
      }
      const included=eligible.filter(item=>selected.includes(item.id))
      const result=assembleVerifiedSourceBundle(included,previews)
      setBundle(result)
      setRejected([...skipped,...result.excluded.map(x=>
        'Fonte '+x.ordinal+': excluída por '+x.reason+'.')])
      if(!result.included)setError('Nenhuma fonte selecionada possui texto completamente verificável.')
    }catch{
      setError('Não foi possível montar o rascunho. Nenhuma análise foi alterada.')
    }finally{setBusy(false)}
  }
  async function copy(){
    if(!bundle?.included)return
    try{
      await navigator.clipboard.writeText(bundle.text)
      setCopied(true)
    }catch{
      setError('Não foi possível copiar. O texto permanece disponível para revisão manual.')
    }
  }
  return (
    <section aria-label="Rascunho consolidado de fontes verificadas"
      className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-slate-200">
        Prévia consolidada de fontes documentais
      </h3>
      <p className="text-xs text-amber-300">
        A montagem é exclusivamente local e requer seleção humana de fontes.
        Não classifica fatos antes/depois do ponto de fuga, não certifica OCR,
        não salva a narrativa nem modifica os resultados SERA/P/O/A.
      </p>
      <div className="space-y-2">
        {eligible.map(source=>(
          <label key={source.id} className="flex gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={selected.includes(source.id)}
              disabled={busy}
              onChange={(ev)=>{
                setSelected(current=>ev.target.checked?
                  [...current,source.id]:current.filter(id=>id!==source.id))
                setBundle(null);setRejected([]);setCopied(false)
              }}
              aria-label={'Incluir fonte '+source.sourceOrdinal+' '+source.fileName}
            />
            <span className="break-all">
              Fonte {source.sourceOrdinal} · {source.fileName}
            </span>
          </label>
        ))}
        {eligible.length===0&&(
          <p className="text-xs text-slate-500">
            Nenhuma fonte textual com SHA-256 elegível para consolidação.
          </p>
        )}
      </div>
      <button type="button" disabled={busy||selected.length===0}
        onClick={()=>void prepare()}
        className="rounded border border-slate-500 px-3 py-2 text-xs text-slate-200 disabled:opacity-40">
        {busy?'Verificando originais...':'Montar rascunho para conferência'}
      </button>
      {rejected.map((reason,i)=>(
        <p key={i} className="text-xs text-amber-300">{reason}</p>
      ))}
      {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
      {bundle && bundle.included>0&&(
        <div className="space-y-2">
          <p className="text-xs text-slate-400">
            {bundle.included} fonte(s) com texto preliminar delimitado por ID, hash
            e página verificada quando disponível. Não constitui laudo ou análise.
          </p>
          <textarea aria-label="Rascunho de trechos extraídos" readOnly
            rows={12} value={bundle.text}
            className="w-full rounded border border-slate-600 bg-slate-900 p-3 font-mono text-xs text-slate-200"/>
          <button type="button" onClick={()=>void copy()}
            className="rounded border border-slate-500 px-3 py-2 text-xs text-slate-200">
            {copied?'Texto copiado para revisão':'Copiar rascunho não validado'}
          </button>
        </div>
      )}
    </section>
  )
}
