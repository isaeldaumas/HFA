import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DocumentAccessError,
  downloadAuthorizedEventDocument,
  isEventDocumentId,
  listEventDocumentManifest,
  safeDocumentContentDisposition,
} from '../src/lib/server/event-document-access'

const tenant = '11111111-1111-4111-8111-111111111111'
const foreignTenant = '22222222-2222-4222-8222-222222222222'
const event = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const documentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const authId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const objectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])
const digest = createHash('sha256').update(bytes).digest('hex')
const path = authId + '/events/' + event + '/' + objectId + '.pdf'

type FixtureOptions = {
  eventExists?: boolean
  documentExists?: boolean
  storageFails?: boolean
  path?: string
  sha256?: string | null
  mime?: string
  fileName?: string
  content?: Uint8Array
  sizeBytes?: number
  indexFails?: boolean
}
function fixture(options:FixtureOptions={}) {
  const audit:Array<{op:string;table?:string;key?:string;value?:unknown}> = []
  const row = {
    id:documentId, file_name:options.fileName ?? 'flight-evidence.pdf',
    mime_type:options.mime ?? 'application/pdf',size_bytes:options.sizeBytes ?? bytes.length,
    source_ordinal:1, content_sha256:options.sha256 === undefined ? digest : options.sha256,
    created_at:'2026-11-12T15:00:00Z', storage_path:options.path ?? path,
  }
  const from = (table:string) => {
    const filters:Record<string,unknown>={}
    let columns=''
    const q={
      select:(fields:string)=>{columns=fields;return q},
      eq:(key:string,value:unknown)=>{audit.push({op:'eq',table,key,value});filters[key]=value;return q},
      is:(key:string,value:unknown)=>{audit.push({op:'is',table,key,value});return q},
      neq:(key:string,value:unknown)=>{audit.push({op:'neq',table,key,value});return q},
      order:(key:string)=>{audit.push({op:'order',table,key});return q},
      maybeSingle:async()=>{
        if(table==='events') {
          return {data:options.eventExists===false||filters.tenant_id!==tenant ? null : {id:event},error:null}
        }
        const found=options.documentExists!==false &&
          filters.id===documentId && filters.event_id===event && filters.tenant_id===tenant
        return {data:found?row:null,error:options.indexFails?{code:'500'}:null}
      },
      limit:async()=>{
        const found=options.documentExists!==false &&
          filters.event_id===event && filters.tenant_id===tenant
        const data=found?[Object.fromEntries(Object.entries(row).filter(([key])=>key!=='storage_path'))]:[]
        assert.ok(!columns.includes('storage_path'))
        return {data,error:options.indexFails?{code:'500'}:null}
      },
    }
    return q
  }
  const storage={
    from:(bucket:string)=>{
      audit.push({op:'bucket',value:bucket})
      assert.equal(bucket,'analysis-documents')
      return {
        download:async (objectPath:string)=>{
          audit.push({op:'download',value:objectPath})
          return options.storageFails ? {data:null,error:new Error('DO-NOT-LOG')} : {
            data:new Blob([new Uint8Array(options.content ?? bytes)]),error:null,
          }
        },
      }
    },
  }
  return {admin:{from,storage} as unknown as SupabaseClient,audit}
}

test('SHA-256 is deterministic and path is event-scoped; no raw storage path leaks to manifest',async()=>{
  const f=fixture()
  const docs=await listEventDocumentManifest(f.admin,tenant,event)
  assert.equal(docs.length,1)
  assert.equal(docs[0].sha256,digest)
  assert.equal(docs[0].sourceOrdinal,1)
  assert.ok(!('storage_path' in docs[0]))
  assert.ok(!('storagePath' in docs[0]))
  assert.ok(!JSON.stringify(docs).includes(path))
  assert.equal(f.audit.find(x=>x.op==='download'),undefined)
  assert.deepEqual(f.audit.filter(x=>x.op==='eq' && x.key==='tenant_id').map(x=>x.value),
    [tenant,tenant])
})

test('authorized download validates original storage bytes against SHA-256',async()=>{
  const f=fixture()
  const result=await downloadAuthorizedEventDocument(f.admin,tenant,event,documentId)
  assert.deepEqual(result.bytes,bytes)
  assert.equal(result.hashVerified,true)
  assert.equal(result.mimeType,'application/pdf')
  assert.equal(f.audit.find(x=>x.op==='download')?.value,path)
  assert.deepEqual(f.audit.filter(x=>x.op==='eq' && x.key==='tenant_id').map(x=>x.value),
    [tenant,tenant])
})

test('legacy document with null hash is marked unverified instead of falsely certified',async()=>{
  const f=fixture({sha256:null})
  const result=await downloadAuthorizedEventDocument(f.admin,tenant,event,documentId)
  assert.equal(result.hashVerified,false)
})

test('different tenant and deleted event fail before contacting privileged storage',async()=>{
  const foreign=fixture()
  await assert.rejects(downloadAuthorizedEventDocument(foreign.admin,foreignTenant,event,documentId),
    (err:unknown)=>err instanceof DocumentAccessError&&err.code==='NOT_FOUND')
  assert.equal(foreign.audit.find(x=>x.op==='download'),undefined)
  const deleted=fixture({eventExists:false})
  await assert.rejects(downloadAuthorizedEventDocument(deleted.admin,tenant,event,documentId),
    (err:unknown)=>err instanceof DocumentAccessError&&err.code==='NOT_FOUND')
  assert.equal(deleted.audit.find(x=>x.op==='download'),undefined)
})

test('a mismatched document ID is not retrievable even within same event',async()=>{
  const f=fixture()
  await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,objectId),
    (err:unknown)=>err instanceof DocumentAccessError&&err.code==='NOT_FOUND')
  assert.equal(f.audit.find(x=>x.op==='download'),undefined)
})

test('wrong event path, unsupported MIME, or invalid byte length fails closed',async()=>{
  for(const setup of [
    {path:authId+'/events/'+foreignTenant+'/'+objectId+'.pdf'},
    {mime:'text/html'},
    {sizeBytes:11*1024*1024},
  ]) {
    const f=fixture(setup)
    await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,documentId),
      (err:unknown)=>err instanceof DocumentAccessError&&err.code==='INTEGRITY_MISMATCH')
    assert.equal(f.audit.find(x=>x.op==='download'),undefined)
  }
})

test('unexpected download size or altered hash fails instead of serving evidence',async()=>{
  for(const setup of [
    {content:new Uint8Array([37,80,68,70])},
    {content:new Uint8Array([37,80,68,70,45,49,46,56])},
    {sha256:'0'.repeat(64)},
  ]) {
    const f=fixture(setup)
    await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,documentId),
      (err:unknown)=>err instanceof DocumentAccessError&&err.code==='INTEGRITY_MISMATCH')
  }
})

test('Storage and SQL outages fail closed',async()=>{
  for(const setup of [{storageFails:true},{indexFails:true}]) {
    const f=fixture(setup)
    await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,documentId),
      (err:unknown)=>err instanceof DocumentAccessError&&err.code==='UNAVAILABLE')
  }
})

test('invalid UUIDs rejected without database or Storage reads',async()=>{
  const f=fixture()
  await assert.rejects(downloadAuthorizedEventDocument(f.admin,tenant,event,'../other'),
    (err:unknown)=>err instanceof DocumentAccessError&&err.code==='INVALID_ID')
  assert.equal(f.audit.length,0)
  assert.equal(isEventDocumentId(documentId),true)
  assert.equal(isEventDocumentId('not-a-uuid'),false)
})

test('Content-Disposition sanitizes CRLF, quotes, separators and supports Unicode',()=>{
  const h=safeDocumentContentDisposition('..\\folder/\r\n"x.pdf')
  assert.ok(h.startsWith('attachment; filename='))
  assert.ok(!h.includes('\r')&&!h.includes('\n'))
  assert.ok(!h.includes('folder'))
  assert.ok(h.includes('filename*=UTF-8'))
  const utf=safeDocumentContentDisposition('ação_de_segurança.pdf')
  assert.match(utf,/%C3%A7/)
})
