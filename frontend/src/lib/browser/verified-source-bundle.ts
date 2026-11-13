/**
 * Human-review staging, never SERA narration or a verified causal conclusion.
 * Every included passage is an exact server-extracted preview tied to source
 * ordinal, document ID and original SHA; no generated/guessed content.
 */
export type SourceIdentity = {
  id:string;sourceOrdinal:number;sha256:string|null;fileName:string;
  mimeType:string|null
}
export type SourcePage = {
  pageNumber:number;text:string;extractedChars:number;
  truncated:boolean;hasText:boolean
}
export type VerifiedSourcePreview = {
  documentId:string;sourceOrdinal:number;sha256:string;
  text:string;truncated:boolean;analysisChanged:false;
  reviewedByHuman:false;
  citationLevel:'DOCUMENT_ONLY'|'PDF_PAGE_INDEXED';
  pages:SourcePage[]|null;totalPages:number|null
}
export type BundleResult={text:string;included:number;excluded:Array<{ordinal:number;reason:string}>}
const SHA=/^[a-f0-9]{64}$/
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TOTAL_CHARS=80_000
const MAX_SOURCE_CHARS=60_000
const supported=new Set([
  'application/pdf','text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
function sanitizeName(v:string){
  return v.replace(/[\\/\r\n\t\u0000-\u001f]/g,'_').slice(0,100)
}
/** Every line of extracted text is quoted so it cannot forge source/page tags. */
function quoteExtracted(v:string){
  return v.replace(/\r\n?/g,'\n').split('\n').map(line=>'| '+line).join('\n')
}
function sourceValid(a:SourceIdentity,b:VerifiedSourcePreview|null|undefined):boolean{
  return !!b && UUID.test(a.id) && SHA.test(a.sha256??'') &&
    a.id===b.documentId && a.sha256===b.sha256 &&
    a.sourceOrdinal===b.sourceOrdinal &&
    Number.isInteger(a.sourceOrdinal)&&a.sourceOrdinal>=1&&a.sourceOrdinal<=5 &&
    typeof b.text==='string'&&b.text.length>0&&b.text.length<=MAX_SOURCE_CHARS &&
    b.analysisChanged===false && b.reviewedByHuman===false &&
    b.truncated===false && supported.has(a.mimeType??'') &&
    typeof a.fileName==='string' && a.fileName.length>0
}
export function assembleVerifiedSourceBundle(
  sources:SourceIdentity[],
  previews:Record<string,VerifiedSourcePreview|null|undefined>,
):BundleResult{
  const parts:string[]=[
    'RASCUNHO DE TRECHOS EXTRAÍDOS — NÃO REVISADO',
    'Não constitui narrativa SERA/HFA, análise causal ou afirmação de fatos.',
    'A ordem é documental e NÃO indica antes/depois do ponto de fuga.',
    'Conferência com os originais e classificação temporal são obrigatórias.',
  ]
  const excluded:Array<{ordinal:number;reason:string}>=[]
  let total=parts.join('\n').length
  let included=0
  const sorted=sources.slice().sort((a,b)=>a.sourceOrdinal-b.sourceOrdinal)
  if(sorted.length>5) throw new Error('SOURCE_LIMIT')
  const seen=new Set<string>()
  for(const source of sorted){
    if(seen.has(source.id)){excluded.push({ordinal:source.sourceOrdinal,reason:'DOCUMENT_DUPLICATE'});continue}
    seen.add(source.id)
    const preview=previews[source.id]
    if(!sourceValid(source,preview)){excluded.push({ordinal:source.sourceOrdinal,reason:'UNVERIFIED_OR_MISSING'});continue}
    const b=preview!
    let body:string
    if(b.citationLevel==='PDF_PAGE_INDEXED'){
      if(source.mimeType!=='application/pdf' || !Array.isArray(b.pages) ||
        !Number.isInteger(b.totalPages) || !b.totalPages ||
        b.totalPages!==b.pages.length || b.totalPages>80 ||
        b.pages.some((page,i)=>page.pageNumber!==i+1 ||
          page.truncated || typeof page.text!=='string' ||
          page.extractedChars!==page.text.length ||
          page.hasText!==(page.text.length>0))) {
        excluded.push({ordinal:source.sourceOrdinal,reason:'PAGE_PROVENANCE_INVALID'})
        continue
      }
      body=b.pages.map(page=>(
        '[FONTE '+source.sourceOrdinal+' / PÁGINA '+page.pageNumber+']\n'+
        (page.hasText?quoteExtracted(page.text):'| [SEM CAMADA TEXTUAL EXTRAÍDA]')
      )).join('\n')
    }else if(b.citationLevel==='DOCUMENT_ONLY' &&
      source.mimeType!=='application/pdf' && b.pages===null && b.totalPages===null){
      body='[FONTE '+source.sourceOrdinal+' / DOCUMENTO SEM PAGINAÇÃO VERIFICÁVEL]\n'+
        quoteExtracted(b.text)
    }else{
      excluded.push({ordinal:source.sourceOrdinal,reason:'CITATION_LEVEL_UNVERIFIED'})
      continue
    }
    const section='=== INÍCIO FONTE '+source.sourceOrdinal+' | DOCUMENTO '+source.id+
      ' | SHA256 '+source.sha256+' | ARQUIVO '+sanitizeName(source.fileName)+' ===\n'+
      body+'\n=== FIM FONTE '+source.sourceOrdinal+' ==='
    if(total+section.length>MAX_TOTAL_CHARS){
      excluded.push({ordinal:source.sourceOrdinal,reason:'TOTAL_TEXT_LIMIT'})
      continue
    }
    parts.push(section)
    total+=section.length
    included++
  }
  return {text:parts.join('\n\n'),included,excluded}
}
