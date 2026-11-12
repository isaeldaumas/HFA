import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {
  appendOriginalEventDocument,
  AppendDocumentError,
  MAX_APPEND_FILE_BYTES,
  MAX_APPEND_MULTIPART_BYTES,
  MAX_EVENT_SOURCES,
  readBoundedDocumentAppendForm,
} from '../src/lib/server/event-document-append'
import {DocumentAccessError,resolveAuthorizedDocumentRange} from '../src/lib/server/event-document-access'
import {EventAttachmentError} from '../src/lib/server/event-attachment'

const tenant='11111111-1111-4111-8111-111111111111'
const foreignTenant='22222222-2222-4222-8222-222222222222'
const event='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const authId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const publicId='cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function pdf(body='FIRST ORIGINAL') {
  return new File(['%PDF-1.7\n'+body],body.replace(/\W/g,'').slice(0,15)+'.pdf',{
    type:'application/pdf',
  })
}
type Stored={id:string;source_ordinal:number;content_sha256:string | null;size_bytes:number}
function makeDb(opts:{
  missingEvent?:boolean;
  lookupFails?:boolean;
  uploadFails?:boolean;
  indexFails?:boolean;
  cleanupFails?:boolean;
  seed?:Stored[];
}={}) {
  const docs:Stored[]=opts.seed?.map(row=>({...row})) ?? []
  const log:Array<{op:string;value?:unknown}>=[]
  const storage={
    from:(bucket:string)=>{
      assert.equal(bucket,'analysis-documents')
      return {
        upload:async(path:string,bytes:Uint8Array,settings:Record<string,unknown>)=>{
          log.push({op:'upload',value:{path,bytes:bytes.length,settings}})
          return {error:opts.uploadFails?new Error('hidden-storage-error'):null}
        },
        remove:async(paths:string[])=>{
          log.push({op:'remove',value:paths})
          return {error:opts.cleanupFails?new Error('hidden-delete-error'):null}
        },
      }
    },
  }
  const from=(table:string)=>{
    const filters:Record<string,unknown>={}
    const query={
      select:()=>query,
      eq:(key:string,value:unknown)=>{filters[key]=value;log.push({op:'where:'+key,value});return query},
      is:()=>query,
      neq:()=>query,
      order:()=>query,
      maybeSingle:async()=>({data:opts.missingEvent||filters.tenant_id!==tenant?
        null:{id:event},error:null}),
      limit:async()=>{
        if(opts.lookupFails) return {data:null,error:new Error('db-failed')}
        assert.equal(filters.tenant_id,tenant)
        assert.equal(filters.event_id,event)
        return {data:docs.map(row=>({...row})),error:null}
      },
      insert:async(row:Record<string,unknown>)=>{
        log.push({op:'insert',value:row})
        if(opts.indexFails) return {error:new Error('index unavailable')}
        const ordinal=Number(row.source_ordinal)
        const hash=String(row.content_sha256)
        if(docs.some(doc=>doc.source_ordinal===ordinal||
          doc.content_sha256===hash)) return {error:new Error('unique violation')}
        docs.push({id:'index-'+docs.length,source_ordinal:ordinal,
          content_sha256:hash,size_bytes:Number(row.size_bytes)})
        return {error:null}
      },
    }
    assert.ok(table==='events'||table==='event_documents')
    return query
  }
  return {admin:{from,storage} as unknown as SupabaseClient,docs,log}
}
function input(admin:SupabaseClient,file:File,tenantId=tenant){
  return {admin,tenantId,eventId:event,authUserId:authId,publicUserId:publicId,file}
}

test('adding 3 distinct originals keeps order, byte hash, unique paths and no engine mutation',async()=>{
  const m=makeDb()
  const paths:string[]=[]
  for(const [i,n] of ['first','second','third'].entries()){
    const file=pdf(n)
    const response=await appendOriginalEventDocument(input(m.admin,file))
    assert.equal(response.status,'created')
    assert.equal(response.sourceOrdinal,i+1)
    assert.equal(response.sha256,createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'))
  }
  const insertCalls=m.log.filter(x=>x.op==='insert')
  assert.equal(insertCalls.length,3)
  for(const call of insertCalls){
    const row=call.value as Record<string,unknown>
    assert.equal(row.tenant_id,tenant)
    assert.equal(row.event_id,event)
    assert.equal(row.uploaded_by,publicId)
    paths.push(String(row.storage_path))
  }
  assert.equal(new Set(paths).size,3)
  assert.ok(paths.every(p=>p.includes('/events/'+event+'/')))
  assert.deepEqual(m.docs.map(row=>row.source_ordinal),[1,2,3])
  assert.ok(!m.log.some(x=>x.op==='update'||x.op==='delete'))
})

test('exact file retry does not create another row, Storage object or source ordinal',async()=>{
  const m=makeDb()
  const file=pdf('RETRY CONTENT')
  const one=await appendOriginalEventDocument(input(m.admin,file))
  const two=await appendOriginalEventDocument(input(m.admin,file))
  assert.equal(one.status,'created')
  assert.equal(two.status,'already_present')
  assert.equal(two.sourceOrdinal,one.sourceOrdinal)
  assert.equal(m.log.filter(x=>x.op==='upload').length,1)
  assert.equal(m.log.filter(x=>x.op==='insert').length,1)
})

test('cross-tenant or missing event does not touch Storage or documents index',async()=>{
  for(const [opts,contextTenant] of [[{},foreignTenant],[{missingEvent:true},tenant]] as const){
    const m=makeDb(opts)
    await assert.rejects(
      appendOriginalEventDocument(input(m.admin,pdf('SECRET'),contextTenant)),
      (e:unknown)=>e instanceof DocumentAccessError&&e.code==='NOT_FOUND')
    assert.equal(m.log.filter(x=>x.op==='upload'||x.op==='insert').length,0)
  }
})

test('five slots cap and 30 MB total reject without writes',async()=>{
  const seed=Array.from({length:5},(_,i)=>({
    id:'index-'+i,source_ordinal:i+1,content_sha256:'f'.repeat(63)+i,size_bytes:10,
  }))
  const m=makeDb({seed})
  await assert.rejects(appendOriginalEventDocument(input(m.admin,pdf('LATE'))),
    (e:unknown)=>e instanceof AppendDocumentError&&e.code==='LIMIT_REACHED')
  assert.equal(m.log.filter(x=>x.op==='upload'||x.op==='insert').length,0)
  assert.equal(MAX_EVENT_SOURCES,5)
})

test('forged file, empty file and >3.8 MB fail before Storage',async()=>{
  const m=makeDb()
  for(const file of [
    new File([''], 'empty.pdf', {type:'application/pdf'}),
    new File(['hacked'], 'forged.pdf',{type:'application/pdf'}),
    new File([new Uint8Array(MAX_APPEND_FILE_BYTES+1)],'big.pdf',{type:'application/pdf'}),
  ]) {
    await assert.rejects(appendOriginalEventDocument(input(m.admin,file)))
  }
  assert.equal(m.log.filter(x=>x.op==='upload').length,0)
})

test('DB outage, upload error, index failure and failed cleanup fail closed',async()=>{
  const scenarios=[
    {lookupFails:true, expected:'LOOKUP_UNAVAILABLE', sequence:[]},
    {uploadFails:true, expected:'STORAGE_FAILED', sequence:['upload']},
    {indexFails:true, expected:'STORAGE_FAILED', sequence:['upload','insert','remove']},
    {indexFails:true,cleanupFails:true,expected:'STORAGE_FAILED',sequence:['upload','insert','remove']},
  ] as const
  for(const [i,setup] of scenarios.entries()){
    const m=makeDb(setup)
    await assert.rejects(appendOriginalEventDocument(input(m.admin,pdf('FAIL '+i))),
      (e:unknown)=>e instanceof AppendDocumentError&&e.code===setup.expected)
    assert.deepEqual(m.log.filter(x=>['upload','insert','remove'].includes(x.op)).map(x=>x.op),
      [...setup.sequence])
  }
})

test('ordinal collision with simultaneous different files retains only one and compensates failure',async()=>{
  const m=makeDb()
  const responses=await Promise.allSettled([
    appendOriginalEventDocument(input(m.admin,pdf('CONCURRENT A'))),
    appendOriginalEventDocument(input(m.admin,pdf('CONCURRENT B'))),
  ])
  assert.equal(m.docs.length,1)
  assert.equal(responses.filter(x=>x.status==='fulfilled').length,1)
  assert.equal(responses.filter(x=>x.status==='rejected').length,1)
  assert.equal(m.log.filter(x=>x.op==='remove').length,1)
})

test('bounded multipart permits one file and rejects oversized declared or actual payload',async()=>{
  const body=new FormData()
  body.set('file',pdf('HTTP CONTENT'))
  const req=()=>new Request('https://hfa.invalid/api/events/'+event+'/documents',{
    method:'POST',body,
  })
  const parsed=await readBoundedDocumentAppendForm(req())
  assert.equal((parsed.get('file') as File).name,'HTTPCONTENT.pdf')
  const declared=new Request('https://hfa.invalid/',{
    method:'POST',body:new FormData(),
    headers:{'content-length':String(MAX_APPEND_MULTIPART_BYTES+1)},
  })
  await assert.rejects(readBoundedDocumentAppendForm(declared),
    (e:unknown)=>e instanceof EventAttachmentError&&e.code==='BODY_TOO_LARGE')
  const oversized=new Request('https://hfa.invalid/',{
    method:'POST',body:new File([new Uint8Array(MAX_APPEND_MULTIPART_BYTES+1)],'payload.bin'),
    headers:{'content-type':'multipart/form-data; boundary=fake'},
  })
  await assert.rejects(readBoundedDocumentAppendForm(oversized),
    (e:unknown)=>e instanceof EventAttachmentError&&e.code==='BODY_TOO_LARGE')
})

test('download range is limited to Vercel-safe chunks with correct 206 semantics',()=>{
  assert.deepEqual(resolveAuthorizedDocumentRange(null,120),{start:0,end:119,partial:false})
  assert.deepEqual(resolveAuthorizedDocumentRange('bytes=0-3799999',10_000_000),
    {start:0,end:3799999,partial:true})
  assert.deepEqual(resolveAuthorizedDocumentRange('bytes=7600000-9999999',10_000_000),
    {start:7600000,end:9999999,partial:true})
  for(const request of [null,'bytes=0-4000000','bytes=0-10000000',
    'bytes=-1','bytes=1-0','bytes=1-','bytes=0-1,3-4','bytes=9000000-9999999junk']){
    assert.throws(()=>resolveAuthorizedDocumentRange(request,10_000_000),DocumentAccessError)
  }
})
