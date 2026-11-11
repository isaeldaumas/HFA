import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ExtractionPayloadTooLarge,
  MAX_EXTRACTION_MULTIPART_BYTES,
  readBoundedExtractionForm,
  reserveDocumentExtractionQuota,
} from '../src/lib/server/document-extraction-gate'

const validUserId = 'c1d8d37b-d104-45da-a093-b5065e1be921'

test('normal multipart form is parsed after bounded stream consumption', async () => {
  const form = new FormData()
  const raw = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])
  form.set('file', new File([raw], 'report.pdf', { type: 'application/pdf' }))
  const req = new Request('https://hfa.example.invalid/api/extract-document', {
    method: 'POST', body: form,
  })
  const parsed = await readBoundedExtractionForm(req)
  const f = parsed.get('file')
  assert.ok(f instanceof File)
  assert.equal(f.name, 'report.pdf')
  assert.deepEqual(new Uint8Array(await f.arrayBuffer()), raw)
})

test('malicious Content-Length is rejected before parsing', async () => {
  const req = new Request('https://hfa.example.invalid/api/extract-document', {
    method: 'POST',
    headers: {
      'content-type': 'multipart/form-data; boundary=foo',
      'content-length': String(MAX_EXTRACTION_MULTIPART_BYTES + 1),
    },
    body: '--foo--',
  })
  await assert.rejects(readBoundedExtractionForm(req), ExtractionPayloadTooLarge)
})

test('actual multipart stream larger than cap is rejected without trusting content length', async () => {
  const req = new Request('https://hfa.example.invalid/api/extract-document', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=foo' },
    body: new Uint8Array(MAX_EXTRACTION_MULTIPART_BYTES + 1),
  })
  await assert.rejects(readBoundedExtractionForm(req), ExtractionPayloadTooLarge)
})

function fakeClient(result: boolean | null | 'throw') {
  const calls: Array<{ fn: string; params: Record<string, unknown> }> = []
  const rpc = async (fn: string, params: Record<string, unknown>) => {
    calls.push({ fn, params })
    if (result === 'throw') throw new Error('Synthetic DB error, never log')
    if (result === null) return { data: null, error: { code: 'PGRST116' } }
    return { data: result, error: null }
  }
  return { admin: { rpc } as unknown as SupabaseClient, calls }
}

test('only an explicit successful atomic RPC grants extraction', async () => {
  const allow = fakeClient(true)
  assert.equal(await reserveDocumentExtractionQuota(allow.admin, validUserId), 'allowed')
  assert.deepEqual(allow.calls, [{
    fn: 'hfa_reserve_document_extraction',
    params: { p_user_id: validUserId },
  }])
  const deny = fakeClient(false)
  assert.equal(await reserveDocumentExtractionQuota(deny.admin, validUserId), 'limited')
  const fail = fakeClient(null)
  assert.equal(await reserveDocumentExtractionQuota(fail.admin, validUserId), 'unavailable')
  const thrown = fakeClient('throw')
  assert.equal(await reserveDocumentExtractionQuota(thrown.admin, validUserId), 'unavailable')
  const invalid = fakeClient(true)
  assert.equal(await reserveDocumentExtractionQuota(invalid.admin, 'injected-non-uuid'), 'unavailable')
  assert.deepEqual(invalid.calls, [])
})
