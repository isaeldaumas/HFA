import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  attachmentErrorStatus,
  EventAttachmentError,
  persistEventAttachment,
  prepareEventAttachment,
  readBoundedEventJson,
} from '../src/lib/server/event-attachment'

const authUserId = '8407bf67-a710-423e-aefa-d975c81e32be'
const publicUserId = 'a166b0ed-ce14-4a9c-95cb-5e26dcc761fc'
const tenantId = '513d39e3-ae78-41e8-86c9-fde6fed24d42'
const eventId = '40b46fbb-0927-4d8a-ad70-a8470be9241f'
const mime = 'application/pdf'

const validPDF = () => new File([new Uint8Array([37,80,68,70,45,49,46,55])],
  'pilot-report.pdf', {type: mime})

test('only valid nonempty PDFs or DOCX extensions and signatures can be evidence', async () => {
  const ready = await prepareEventAttachment(validPDF())
  assert.equal(ready.kind, 'pdf')
  assert.equal(ready.mimeType, mime)
  assert.equal(ready.fileName, 'pilot-report.pdf')
  assert.equal(ready.data.toString('ascii',0,4), '%PDF')
  const unsupported = new File(['not-a-pdf'], 'report.pdf', {type:mime})
  await assert.rejects(prepareEventAttachment(unsupported),
    (e:unknown) => e instanceof EventAttachmentError && e.code === 'INVALID_TYPE')
  await assert.rejects(prepareEventAttachment(new File([''], 'report.pdf', {type:mime})),
    (e:unknown) => e instanceof EventAttachmentError && e.code === 'EMPTY_FILE')
  const mismatched = new File([new Uint8Array([37,80,68,70,45])],
    'report.docx', {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})
  await assert.rejects(prepareEventAttachment(mismatched), EventAttachmentError)
  const fakeMime = new File([new Uint8Array([37,80,68,70,45])],
    'report.pdf', {type:'image/jpeg'})
  await assert.rejects(prepareEventAttachment(fakeMime), EventAttachmentError)
  const big = new File([new Uint8Array(10*1024*1024+1)], 'huge.pdf', {type:mime})
  await assert.rejects(prepareEventAttachment(big))
})

type MockSituation = 'ok'|'upload-failed'|'index-failed'|'cleanup-failed'
function mockedAdmin(scenario:MockSituation) {
  const calls: Array<{op:string;path?:string;payload?:Record<string,unknown>}> = []
  const store = {
    upload: async (path:string,_data:unknown,opts:Record<string,unknown>)=>{
      calls.push({op:'upload',path,payload:opts})
      return {error: scenario==='upload-failed' ? new Error('provider says error') : null}
    },
    remove: async (paths:string[])=>{
      calls.push({op:'remove',path:paths[0]})
      return {error: scenario==='cleanup-failed' ? new Error('cannot remove') : null}
    },
  }
  const client = {
    storage:{from:(bucket:string)=>{ assert.equal(bucket,'analysis-documents');return store}},
    from:(table:string)=>{
      assert.equal(table,'event_documents')
      return {
        insert:async (payload:Record<string,unknown>)=>{
          calls.push({op:'index',payload})
          return {error: ['index-failed','cleanup-failed'].includes(scenario)
            ? new Error('DB index unavailable') : null}
        },
      }
    },
  } as unknown as SupabaseClient
  return {client,calls}
}
const params = async (admin:SupabaseClient)=>({
  admin, tenantId,eventId,authUserId,publicUserId,
  attachment:await prepareEventAttachment(validPDF()),
})

test('success writes unique scoped storage object and indexed evidence', async()=>{
  const m=mockedAdmin('ok')
  const path=await persistEventAttachment(await params(m.client))
  assert.equal(m.calls.length,2)
  assert.deepEqual(m.calls.map(c=>c.op),['upload','index'])
  assert.match(path,new RegExp('^'+authUserId+'/events/'+eventId+'/[0-9a-f-]+\\.pdf$'))
  assert.equal(m.calls[1].payload?.tenant_id,tenantId)
  assert.equal(m.calls[1].payload?.event_id,eventId)
  assert.equal(m.calls[1].payload?.uploaded_by,publicUserId)
  assert.equal(m.calls[1].payload?.storage_path,path)
  assert.equal(m.calls[1].payload?.size_bytes,8)
  assert.equal(m.calls[0].payload?.contentType,mime)
  assert.equal(m.calls[0].payload?.upsert,false)
})

test('failed storage upload is never indexed nor reported successful', async()=>{
  const m=mockedAdmin('upload-failed')
  await assert.rejects(persistEventAttachment(await params(m.client)),
    (e:unknown)=> e instanceof EventAttachmentError && e.code==='UPLOAD_FAILED')
  assert.deepEqual(m.calls.map(c=>c.op),['upload'])
})

test('failed DB index is compensated by removing the same just-uploaded object', async()=>{
  const m=mockedAdmin('index-failed')
  await assert.rejects(persistEventAttachment(await params(m.client)),
    (e:unknown)=>e instanceof EventAttachmentError && e.code==='DOCUMENT_INDEX_FAILED')
  assert.deepEqual(m.calls.map(c=>c.op),['upload','index','remove'])
  assert.equal(m.calls[0].path,m.calls[2].path)
})
test('failed compensation is explicitly unverified, not success', async()=>{
  const m=mockedAdmin('cleanup-failed')
  await assert.rejects(persistEventAttachment(await params(m.client)),
    (e:unknown)=>e instanceof EventAttachmentError &&
      e.code==='DOCUMENT_INDEX_CLEANUP_FAILED')
  assert.deepEqual(m.calls.map(c=>c.op),['upload','index','remove'])
})

test('JSON input is bounded even with absent or inaccurate Content-Length',async()=>{
  const makeReq=(body:string,headers?:Record<string,string>)=>new Request('https://hfa.invalid/api/events',{
    method:'POST',headers:{'content-type':'application/json',...(headers??{})},body,
  })
  const result=await readBoundedEventJson(makeReq('{"title":"ok","raw_input":"narrative"}'))
  assert.equal(result.title,'ok')
  await assert.rejects(readBoundedEventJson(makeReq('{"title":')),
    (e:unknown)=>e instanceof EventAttachmentError && e.code==='INVALID_BODY')
  await assert.rejects(readBoundedEventJson(makeReq('[]')),
    (e:unknown)=>e instanceof EventAttachmentError && e.code==='INVALID_BODY')
  await assert.rejects(readBoundedEventJson(makeReq('{"ok":true}',{'content-length':String(2*1024*1024+1)})),
    (e:unknown)=>e instanceof EventAttachmentError && e.code==='BODY_TOO_LARGE')
  await assert.rejects(readBoundedEventJson(makeReq('x'.repeat(2*1024*1024+1))),
    (e:unknown)=>e instanceof EventAttachmentError && e.code==='BODY_TOO_LARGE')
  assert.equal(attachmentErrorStatus(new EventAttachmentError('BODY_TOO_LARGE')),413)
  assert.equal(attachmentErrorStatus(new EventAttachmentError('INVALID_BODY')),400)
})
