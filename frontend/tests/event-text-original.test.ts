import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import type {SupabaseClient} from '@supabase/supabase-js'
import {
  decodeStrictUtf8TextOriginal,
  PlainTextOriginalError,
} from '../src/lib/server/event-plain-text'
import {
  EventAttachmentError,
  prepareEventAttachment,
  persistEventAttachment,
} from '../src/lib/server/event-attachment'
import {
  downloadAuthorizedEventDocument,
  DocumentAccessError,
} from '../src/lib/server/event-document-access'
import {
  extractVerifiedEventSourcePreview,
} from '../src/lib/server/event-source-preview'

const tenant='11111111-1111-4111-8111-111111111111'
const foreign='22222222-2222-4222-8222-222222222222'
const event='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const auth='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const publicUser='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const document='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const object='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const text='Relato sintético: aeronave retornou após aviso operacional.\nA equipe registrou o fato.'
const bytes=new TextEncoder().encode(text)
const hash=createHash('sha256').update(bytes).digest('hex')
const txt=(source=text,type='text/plain')=>new File([source],'observacao.txt',{type})

test('UTF-8 intact, accented Portuguese, CRLF, TAB and optional BOM produce text without mutation',()=>{
  for(const input of [
    text,
    '\ufeffRelato técnico em UTF-8.\r\nOutra linha.\tFim.',
    'Protocolo de aeronave – comunicação operacional.',
  ]) {
    const data=new TextEncoder().encode(input)
    const decoded=decodeStrictUtf8TextOriginal(data)
    assert.ok(decoded.includes(input.replace(/^\ufeff/,'').slice(0,7)))
    assert.equal(createHash('sha256').update(data).digest('hex').length,64)
  }
})

test('binary masquerade, invalid UTF-8, controls, bidi overrides and empty content fail closed',()=>{
  const invalid=[
    new Uint8Array([0xc3,0x28]),
    new Uint8Array([0xff,0xfe,0x41,0]),
    new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31]),
    new Uint8Array([0x50,0x4b,0x03,0x04,0x2d,0x31]),
    new Uint8Array([0x47,0x49,0x46,0x38,0x39,0x61,0x20]),
    new Uint8Array([0]),
    new Uint8Array([]),
    new TextEncoder().encode(' \n\r\t '),
    new TextEncoder().encode('fato\u202eevitado'),
    new TextEncoder().encode('linha\u0000oculta'),
    new TextEncoder().encode('texto\u0085controlado'),
  ]
  for(const [index,data] of invalid.entries()) {
    assert.throws(()=>decodeStrictUtf8TextOriginal(data),PlainTextOriginalError,'invalid case '+index)
  }
})

test('initial registration never silently admits TXT: only explicit supplemental scope may prepare it',async()=>{
  await assert.rejects(prepareEventAttachment(txt()),(e:unknown)=>
    e instanceof EventAttachmentError&&e.code==='INVALID_TYPE')
  const valid=await prepareEventAttachment(txt(),{allowText:true})
  assert.equal(valid.kind,'txt')
  assert.equal(valid.mimeType,'text/plain')
  assert.equal(valid.fileName,'observacao.txt')
  assert.deepEqual(new Uint8Array(valid.data),bytes)
  for(const candidate of [
    new File([text],'observacao.pdf',{type:'text/plain'}),
    new File([text],'observacao.txt',{type:'text/html'}),
    new File(['%PDF-1.7\n fake pdf'],'observacao.txt',{type:'text/plain'}),
    new File([new Uint8Array([0xff,0xfe,0x00])],'observacao.txt',{type:'text/plain'}),
    new File([''], 'observacao.txt',{type:'text/plain'}),
  ]) {
    await assert.rejects(prepareEventAttachment(candidate,{allowText:true}),
      (e:unknown)=>e instanceof EventAttachmentError)
  }
})

test('successful TXT original persists original bytes, canonical MIME, path, hash and ordinal',async()=>{
  const writes:Array<{path?:string;kind:string;input?:unknown}>= []
  const admin={
    storage:{from:(_bucket:string)=>({
      upload:async(path:string,data:Buffer,opts:Record<string,unknown>)=>{
        writes.push({kind:'upload',path,input:{data:new Uint8Array(data),opts}})
        return {error:null}
      },
      remove:async(paths:string[])=>{
        writes.push({kind:'remove',path:paths[0]})
        return {error:null}
      },
    })},
    from:(_table:string)=>({
      insert:async(row:Record<string,unknown>)=>{
        writes.push({kind:'index',input:row})
        return {error:null}
      },
    }),
  } as unknown as SupabaseClient
  const saved=await persistEventAttachment({
    admin,tenantId:tenant,eventId:event,authUserId:auth,publicUserId:publicUser,
    attachment:await prepareEventAttachment(txt(),{allowText:true}),
    sourceOrdinal:3,
  })
  assert.match(saved,/\.txt$/)
  assert.ok(saved.startsWith(auth+'/events/'+event+'/'))
  assert.deepEqual(writes.map(x=>x.kind),['upload','index'])
  const upload=writes[0].input as {data:Uint8Array;opts:Record<string,unknown>}
  assert.deepEqual(upload.data,bytes)
  assert.equal(upload.opts.contentType,'text/plain')
  assert.equal(upload.opts.upsert,false)
  const row=writes[1].input as Record<string,unknown>
  assert.equal(row.tenant_id,tenant)
  assert.equal(row.event_id,event)
  assert.equal(row.source_ordinal,3)
  assert.equal(row.content_sha256,hash)
  assert.equal(row.mime_type,'text/plain')
  assert.equal(row.storage_path,saved)
})

function downloadFixture(override:{
  mime?:string;path?:string;payload?:Uint8Array;name?:string;sha?:string|null
}={}) {
  const ops:string[]=[]
  const path=auth+'/events/'+event+'/'+object+'.txt'
  const row={
    file_name:override.name ?? 'observacao.txt',
    mime_type:override.mime ?? 'text/plain',
    size_bytes:bytes.length,
    storage_path:override.path ?? path,
    content_sha256:override.sha===undefined?hash:override.sha,
  }
  const from=(table:string)=>{
    const filters:Record<string,unknown>={}
    const query={
      select:()=>query,
      eq:(key:string,value:unknown)=>{filters[key]=value;ops.push(key+':'+value);return query},
      is:()=>query,
      neq:()=>query,
      maybeSingle:async()=>({
        data:filters.tenant_id!==tenant?null:table==='events'?{id:event}:row,
        error:null,
      }),
    }
    return query
  }
  const storage={from:(_bucket:string)=>({
    download:async(p:string)=>{ops.push('storage:'+p)
      return {data:new Blob([new Uint8Array(override.payload??bytes)]),error:null}
    },
  })}
  return {admin:{from,storage} as unknown as SupabaseClient,ops}
}

test('private TXT download enforces tenant, event, path, stored length and SHA-256',async()=>{
  const normal=downloadFixture()
  const file=await downloadAuthorizedEventDocument(normal.admin,tenant,event,document)
  assert.equal(file.mimeType,'text/plain')
  assert.equal(file.hashVerified,true)
  assert.deepEqual(file.bytes,bytes)
  assert.equal(normal.ops.filter(x=>x.startsWith('storage:')).length,1)

  const foreignFixture=downloadFixture()
  await assert.rejects(
    downloadAuthorizedEventDocument(foreignFixture.admin,foreign,event,document),
    (e:unknown)=>e instanceof DocumentAccessError&&e.code==='NOT_FOUND')
  assert.equal(foreignFixture.ops.filter(x=>x.startsWith('storage:')).length,0)

  for(const bad of [
    {mime:'text/html'},
    {name:'anexo.pdf'},
    {path:auth+'/events/'+foreign+'/'+object+'.txt'},
    {sha:'0'.repeat(64)},
    {payload:new Uint8Array([1,2,3])},
  ]) {
    const f=downloadFixture(bad)
    await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,document),
      (e:unknown)=>e instanceof DocumentAccessError)
  }
})

test('verified TXT preview is text-only, UTF-8 strict, bounded, and never calls PDF/DOCX parser',async()=>{
  let parseCalled=false
  const admin={} as SupabaseClient
  const params={admin,tenantId:tenant,eventId:event,documentId:document,authUserId:auth}
  const dependencies={
    listManifest:async()=>[{
      id:document,fileName:'observacao.txt',mimeType:'text/plain',
      sizeBytes:bytes.length,sourceOrdinal:4,sha256:hash,createdAt:'2026-11-12T00:00:00Z',
    }],
    reserveQuota:async()=> 'allowed' as const,
    download:async()=>({
      bytes:new Uint8Array(bytes),mimeType:'text/plain',fileName:'observacao.txt',
      hashVerified:true,
    }),
    parse:async()=>{parseCalled=true;throw new Error('UNEXPECTED PDF/DOCX PARSER')},
  }
  const result=await extractVerifiedEventSourcePreview(params,dependencies)
  assert.equal(result.sourceOrdinal,4)
  assert.equal(result.sha256,hash)
  assert.equal(result.text,text)
  assert.equal(result.citationLevel,'DOCUMENT_ONLY')
  assert.equal(result.pages,null)
  assert.equal(result.analysisChanged,false)
  assert.equal(result.reviewedByHuman,false)
  assert.equal(result.externalProviderUsed,false)
  assert.equal(parseCalled,false)
})
