import {createHash} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {
  DocumentAccessError,downloadAuthorizedEventDocument,
  isEventDocumentId,listEventDocumentManifest,
} from './event-document-access'
import {
  LOCAL_OCR_REVIEW_VERSION,buildLocalOcrReviewRecord,
  type LocalOcrReviewRecord,
} from '../browser/local-ocr-human-review'

const SHA=/^[a-f0-9]{64}$/
const MAX_REQUEST_BYTES=550_000

export class OcrReviewStoreError extends Error {
  constructor(public readonly code:
    'INVALID_BODY'|'TOO_LARGE'|'SOURCE_CHANGED'|'STORE_UNAVAILABLE'|
    'REVIEW_NOT_AVAILABLE'|'TOO_MANY_REVIEWS') {
    super(code);this.name='OcrReviewStoreError'
  }
}
function fail(code:OcrReviewStoreError['code']):never {
  throw new OcrReviewStoreError(code)
}
export async function readOcrReviewBody(req:Request):Promise<unknown> {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      req.headers.get('content-type')??'')) fail('INVALID_BODY')
  const len=req.headers.get('content-length')
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_REQUEST_BYTES))
    fail('TOO_LARGE')
  const reader=req.body?.getReader()
  if(!reader) fail('INVALID_BODY')
  let total=0
  const chunks:Uint8Array[]=[]
  while(true){
    const {done,value}=await reader.read().catch(()=>fail('INVALID_BODY'))
    if(done)break
    total+=value.byteLength
    if(total>MAX_REQUEST_BYTES){
      await reader.cancel().catch(()=>undefined)
      fail('TOO_LARGE')
    }
    chunks.push(value)
  }
  const bytes=new Uint8Array(total)
  let off=0
  for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.byteLength}
  try{
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  }catch{fail('INVALID_BODY')}
}
type Identity={
  admin:SupabaseClient
  eventId:string
  documentId:string
  tenantId:string
  publicUserId:string
  authUserId:string
}
type StoreDeps={
  manifest:typeof listEventDocumentManifest
  download:typeof downloadAuthorizedEventDocument
}
const defaults:StoreDeps={manifest:listEventDocumentManifest,
  download:downloadAuthorizedEventDocument}

function expectedReview(payload:unknown):LocalOcrReviewRecord {
  if(typeof payload!=='object'||payload===null||Array.isArray(payload))
    fail('INVALID_BODY')
  const p=payload as Record<string,unknown>
  const expectedKeys=[
    'schema','eventId','documentId','sourceOrdinal','originalSha256',
    'originalMimeType','pageNumber','ocrText','humanCorrectedText',
    'declaration','reviewedByHuman','reviewPersisted','reviewSignatureVerified',
    'scientificallyValidated','analysisChanged','externalProviderUsed',
  ]
  if(Object.keys(p).length!==expectedKeys.length||
     Object.keys(p).some(key=>!expectedKeys.includes(key))||
     p.schema!==LOCAL_OCR_REVIEW_VERSION||
     p.declaration!=='COMPARISON_WITH_ORIGINAL_DECLARED_IN_THIS_BROWSER_SESSION'||
     p.reviewedByHuman!=='SELF_DECLARED_LOCAL_ONLY'||
     p.reviewPersisted!==false||p.reviewSignatureVerified!==false||
     p.scientificallyValidated!==false||p.analysisChanged!==false||
     p.externalProviderUsed!==false||
     typeof p.ocrText!=='string'||typeof p.humanCorrectedText!=='string'||
     typeof p.originalSha256!=='string'||!SHA.test(p.originalSha256)||
     typeof p.originalMimeType!=='string'||
     typeof p.eventId!=='string'||typeof p.documentId!=='string'||
     typeof p.sourceOrdinal!=='number') fail('INVALID_BODY')
  try{
    const built=buildLocalOcrReviewRecord({
      source:{
        eventId:p.eventId,documentId:p.documentId,
        sourceOrdinal:p.sourceOrdinal,sha256:p.originalSha256,
        mimeType:p.originalMimeType,sizeBytes:1,
      },
      pageNumber:p.pageNumber as number|null,
      originalText:p.ocrText,correctedText:p.humanCorrectedText,
      ocrTruncated:false,
      comparedToOriginal:true,checkedCorrections:true,
    })
    if(JSON.stringify(built)!==JSON.stringify(p)) fail('INVALID_BODY')
    return built
  }catch{fail('INVALID_BODY')}
}
const sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex')

async function authorizedSource(args:Identity,deps:StoreDeps){
  if(!isEventDocumentId(args.eventId)||!isEventDocumentId(args.documentId))
    throw new DocumentAccessError('INVALID_ID')
  const manifest=await deps.manifest(args.admin,args.tenantId,args.eventId)
  const source=manifest.find(item=>item.id===args.documentId)
  if(!source) throw new DocumentAccessError('NOT_FOUND')
  if(!source.sha256||!SHA.test(source.sha256)||
     !['application/pdf','image/png','image/jpeg','image/webp'].includes(source.mimeType??''))
    fail('REVIEW_NOT_AVAILABLE')
  return source
}
export type ReviewReceipt={
  id:string
  createdAt:string
  pageNumber:number|null
  originalSha256:string
  reviewerAuthenticated:true
  persisted:true
  scientificallyValidated:false
  analysisChanged:false
}
const columns='id,created_at,page_number,source_sha256'
function receipt(row:Record<string,unknown>):ReviewReceipt{
  if(typeof row.id!=='string'||typeof row.created_at!=='string'||
    typeof row.source_sha256!=='string')fail('STORE_UNAVAILABLE')
  return {id:row.id,createdAt:row.created_at,
    pageNumber:row.page_number===null?null:Number(row.page_number),
    originalSha256:row.source_sha256,reviewerAuthenticated:true,
    persisted:true,scientificallyValidated:false,analysisChanged:false}
}
export async function storeAuthorizedOcrReview(
  args:Identity,payload:unknown,deps:StoreDeps=defaults,
):Promise<{status:'created'|'already_present';receipt:ReviewReceipt}> {
  const source=await authorizedSource(args,deps)
  const review=expectedReview(payload)
  if(review.eventId!==args.eventId||review.documentId!==args.documentId||
     review.sourceOrdinal!==source.sourceOrdinal||
     review.originalSha256!==source.sha256||
     review.originalMimeType!==source.mimeType)fail('SOURCE_CHANGED')
  // Service-role verification of the private original, independent of caller's
  // claimed content. This confirms origin identity, not correctness of OCR text.
  const bytes=await deps.download(args.admin,args.tenantId,args.eventId,args.documentId)
  if(!bytes.hashVerified||sha(bytes.bytes)!==source.sha256||
     bytes.mimeType!==source.mimeType) {
    throw new DocumentAccessError('INTEGRITY_MISMATCH')
  }
  const reviewer=sha(args.authUserId)
  const ocrHash=sha(review.ocrText)
  const correctedHash=sha(review.humanCorrectedText)
  const payloadHash=sha(JSON.stringify({
    eventId:args.eventId,documentId:args.documentId,
    sourceSha256:source.sha256,page:review.pageNumber,
    ocrHash,correctedHash,
  }))
  const match=()=>args.admin.from('event_document_ocr_reviews')
    .select(columns)
    .eq('tenant_id',args.tenantId).eq('document_id',args.documentId)
    .eq('reviewer_auth_sha256',reviewer).eq('payload_sha256',payloadHash)
    .maybeSingle()
  const existing=await match()
  if(existing.error)fail('STORE_UNAVAILABLE')
  if(existing.data)return {status:'already_present',receipt:receipt(existing.data)}
  // A bounded server-side guard against accidental repeated exports.
  // Not an atomic quota: uniqueness remains DB-enforced even under races.
  const cutoff=new Date(Date.now()-3600_000).toISOString()
  const quota=await args.admin.from('event_document_ocr_reviews')
    .select('id',{head:true,count:'exact'})
    .eq('tenant_id',args.tenantId)
    .eq('reviewer_auth_sha256',reviewer)
    .gte('created_at',cutoff)
  if(quota.error||quota.count===null)fail('STORE_UNAVAILABLE')
  if(quota.count>=10)fail('TOO_MANY_REVIEWS')
  const insert=await args.admin.from('event_document_ocr_reviews')
    .insert({
      tenant_id:args.tenantId,event_id:args.eventId,document_id:args.documentId,
      reviewed_by:args.publicUserId,reviewer_auth_sha256:reviewer,
      source_ordinal:source.sourceOrdinal,source_sha256:source.sha256,
      source_mime_type:source.mimeType,page_number:review.pageNumber,
      ocr_text:review.ocrText,corrected_text:review.humanCorrectedText,
      ocr_sha256:ocrHash,corrected_sha256:correctedHash,
      payload_sha256:payloadHash,
    }).select(columns).single()
  if(insert.error){
    if(insert.error.code==='23505'){
      const found=await match()
      if(!found.error&&found.data)
        return {status:'already_present',receipt:receipt(found.data)}
    }
    fail('STORE_UNAVAILABLE')
  }
  return {status:'created',receipt:receipt(insert.data)}
}
export async function listAuthorizedOcrReviews(args:Identity,deps:StoreDeps=defaults) {
  await authorizedSource(args,deps)
  const {data,error}=await args.admin.from('event_document_ocr_reviews')
    .select(columns)
    .eq('tenant_id',args.tenantId).eq('event_id',args.eventId)
    .eq('document_id',args.documentId)
    .order('created_at',{ascending:false}).limit(20)
  if(error||!data)fail('STORE_UNAVAILABLE')
  return data.map(item=>receipt(item))
}
