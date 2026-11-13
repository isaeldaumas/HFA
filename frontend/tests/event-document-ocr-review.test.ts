import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {buildLocalOcrReviewRecord} from '../src/lib/browser/local-ocr-human-review'
import {
  readOcrReviewBody,storeAuthorizedOcrReview,listAuthorizedOcrReviews,
  OcrReviewStoreError,
} from '../src/lib/server/event-document-ocr-review'
import {DocumentAccessError} from '../src/lib/server/event-document-access'
const tenant='11111111-1111-4111-8111-111111111111'
const event='22222222-2222-4222-8222-222222222222'
const documentId='33333333-3333-4333-8333-333333333333'
const authUserId='44444444-4444-4444-8444-444444444444'
const publicUserId='55555555-5555-4555-8555-555555555555'
const bytes=Buffer.from('PRIVATE SYNTHETIC PNG ORIGINAL')
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex')
const source={eventId:event,documentId,sourceOrdinal:2,
  sha256:sha(bytes),mimeType:'image/png',sizeBytes:bytes.length}
const review=buildLocalOcrReviewRecord({source,pageNumber:null,
  originalText:'TESTE OCR',correctedText:'TESTE OCR CORRIGIDO',
  ocrTruncated:false,comparedToOriginal:true,checkedCorrections:true})
const identity={tenantId:tenant,eventId:event,documentId,authUserId,publicUserId}
function mock(opts:{
  missing?:boolean
  tamper?:boolean
  unavailable?:boolean
  quota?:number
  duplicate?:boolean
}={}) {
  const log:Array<{table:string;action:string;value?:unknown}>=[]
  const receipt={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at:'2026-11-12T23:00:00Z',page_number:null,source_sha256:sha(bytes)}
  const from=(table:string)=>{
    assert.equal(table,'event_document_ocr_reviews')
    const filters:Record<string,unknown>={}
    const query={
      select:(fields:string,settings?:Record<string,unknown>)=>{
        log.push({table,action:'select',value:{fields,settings}})
        return query
      },
      eq:(k:string,v:unknown)=>{filters[k]=v;log.push({table,action:'eq:'+k,value:v});return query},
      gte:()=>query,
      order:()=>query,
      limit:async()=>({data:[receipt],error:opts.unavailable?{code:'FAIL'}:null}),
      maybeSingle:async()=>({data:opts.duplicate?receipt:null,
        error:opts.unavailable?{code:'FAIL'}:null}),
      insert:(data:Record<string,unknown>)=>{
        log.push({table,action:'insert',value:data})
        return {select:()=>({single:async()=>({
          data:receipt,error:opts.unavailable?{code:'FAIL'}:null,
        })})}
      },
      then:(resolve:(x:unknown)=>unknown)=>resolve({
        count:opts.quota??0,error:opts.unavailable?{code:'FAIL'}:null,
      }),
    }
    return query
  }
  const admin={from} as unknown as SupabaseClient
  const dependencies={
    manifest:async(_admin:SupabaseClient,providedTenant:string,providedEvent:string)=>{
      assert.equal(providedTenant,tenant)
      assert.equal(providedEvent,event)
      return opts.missing?[]:[{
        id:documentId,fileName:'synthetic.png',mimeType:'image/png',
        sizeBytes:bytes.length,sourceOrdinal:2,sha256:sha(bytes),
        createdAt:'2026-11-12T00:00:00Z',
      }]
    },
    download:async()=>{
      return {bytes:Uint8Array.from(opts.tamper?Buffer.from('CHANGED'):bytes),
        fileName:'synthetic.png',mimeType:'image/png',hashVerified:true}
    },
  }
  return {admin,log,dependencies}
}
test('strict bounded JSON rejects oversized requests, wrong MIME and malformed bodies',async()=>{
  const good=new Request('https://synthetic.invalid',{method:'POST',headers:{
    'content-type':'application/json',
  },body:JSON.stringify(review)})
  assert.deepEqual(await readOcrReviewBody(good),review)
  for(const req of [
    new Request('https://synthetic.invalid',{method:'POST',
      headers:{'content-type':'text/plain'},body:'{}'}),
    new Request('https://synthetic.invalid',{method:'POST',
      headers:{'content-type':'application/json','content-length':'600000'},body:'{}'}),
    new Request('https://synthetic.invalid',{method:'POST',
      headers:{'content-type':'application/json'},body:'{not JSON'}),
  ]) await assert.rejects(readOcrReviewBody(req),
    (e:unknown)=>e instanceof OcrReviewStoreError)
})
test('authenticated review uses server-supplied tenant and reviewer, persists no SERA writes',async()=>{
  const m=mock()
  const res=await storeAuthorizedOcrReview({...identity,admin:m.admin},review,
    m.dependencies as never)
  assert.equal(res.status,'created')
  assert.equal(res.receipt.persisted,true)
  assert.equal(res.receipt.scientificallyValidated,false)
  assert.equal(res.receipt.analysisChanged,false)
  const writes=m.log.filter(x=>x.action==='insert')
  assert.equal(writes.length,1)
  const saved=writes[0].value as Record<string,unknown>
  assert.equal(saved.tenant_id,tenant)
  assert.equal(saved.event_id,event)
  assert.equal(saved.document_id,documentId)
  assert.equal(saved.reviewed_by,publicUserId)
  assert.equal(saved.reviewer_auth_sha256,sha(authUserId))
  assert.equal(saved.source_sha256,sha(bytes))
  assert.equal(saved.corrected_text,'TESTE OCR CORRIGIDO')
  assert.equal(saved.ocr_sha256,sha('TESTE OCR'))
  assert.ok(m.log.every(x=>x.table==='event_document_ocr_reviews'))
  assert.ok(!m.log.some(x=>['update','delete'].includes(x.action)))
})
test('same review idempotently returns existing receipt without new insert',async()=>{
  const m=mock({duplicate:true})
  const res=await storeAuthorizedOcrReview({...identity,admin:m.admin},review,
    m.dependencies as never)
  assert.equal(res.status,'already_present')
  assert.equal(m.log.filter(x=>x.action==='insert').length,0)
})
test('foreign tenant, missing original and tampered storage cannot persist a review',async()=>{
  const m=mock()
  await assert.rejects(storeAuthorizedOcrReview({
    ...identity,tenantId:'66666666-6666-4666-8666-666666666666',admin:m.admin,
  },review,m.dependencies as never))
  for(const opts of [{missing:true},{tamper:true}]){
    const instance=mock(opts)
    await assert.rejects(storeAuthorizedOcrReview({...identity,admin:instance.admin},
      review,instance.dependencies as never),
      (e:unknown)=>e instanceof DocumentAccessError)
    assert.equal(instance.log.filter(x=>x.action==='insert').length,0)
  }
})
test('forged original hash, source ordinal and client-provided extra metadata fail',async()=>{
  const m=mock()
  for(const payload of [
    {...review,originalSha256:'f'.repeat(64)},
    {...review,sourceOrdinal:4},
    {...review,tenantId:'foreign'},
    {...review,reviewPersisted:true},
  ]){
    await assert.rejects(storeAuthorizedOcrReview({...identity,admin:m.admin},
      payload,m.dependencies as never),(e:unknown)=>
        e instanceof OcrReviewStoreError&&
        ['SOURCE_CHANGED','INVALID_BODY'].includes(e.code))
  }
  assert.equal(m.log.filter(x=>x.action==='insert').length,0)
})
test('rate cap, backend error and scoped history fail closed',async()=>{
  for(const opts of [{quota:10},{unavailable:true}]){
    const m=mock(opts)
    await assert.rejects(storeAuthorizedOcrReview({...identity,admin:m.admin},
      review,m.dependencies as never),(e:unknown)=>e instanceof OcrReviewStoreError)
    assert.equal(m.log.filter(x=>x.action==='insert').length,0)
  }
  const m=mock()
  const result=await listAuthorizedOcrReviews({...identity,admin:m.admin},
    m.dependencies as never)
  assert.equal(result.length,1)
  assert.deepEqual(Object.keys(result[0]).sort(),[
    'analysisChanged','createdAt','id','originalSha256','pageNumber',
    'persisted','reviewerAuthenticated','scientificallyValidated'].sort())
  assert.ok(m.log.some(x=>x.action==='eq:tenant_id'&&x.value===tenant))
  assert.ok(m.log.some(x=>x.action==='eq:document_id'&&x.value===documentId))
})
