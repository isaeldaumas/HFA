import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
const append=readFileSync(new URL('../src/lib/server/event-document-append.ts',import.meta.url),'utf8')
const route=readFileSync(new URL('../src/app/api/events/[eventId]/documents/route.ts',import.meta.url),'utf8')
const index=readFileSync(new URL('../src/lib/server/event-attachment.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/components/sera/EventDocumentsPanel.tsx',import.meta.url),'utf8')
const download=readFileSync(new URL('../src/app/api/events/[eventId]/documents/[documentId]/route.ts',import.meta.url),'utf8')
const sql=readFileSync(new URL('../../supabase/migrations/20261112213000_event_document_sha256_unique.sql',import.meta.url),'utf8')
test('route validates bearer/role before reading bounded multipart and any service-role storage',()=>{
  assert.ok(route.indexOf('requireBearerUser(req)')<route.indexOf('readBoundedDocumentAppendForm(req)'))
  assert.match(route,/\['admin','analyst'\]/)
  assert.match(route,/form\.getAll\('file'\)\.length !== 1/)
  assert.match(route,/\.keys\(\)/)
  assert.match(route,/202/) // persisted but audit unverified, not false success
  assert.match(route,/extractionStatus:'NOT_EXTRACTED',analysisChanged:false/)
})
test('single-file write verifies tenant and event before hash and Storage with compensation',()=>{
  assert.ok(append.indexOf('.eq(\'tenant_id\',tenantId)')<append.indexOf('prepareEventAttachment(file)'))
  assert.match(append,/MAX_APPEND_MULTIPART_BYTES = 4_000_000/)
  assert.match(append,/MAX_APPEND_FILE_BYTES = 3_800_000/)
  assert.match(append,/MAX_EVENT_SOURCES = 5/)
  assert.match(index,/sourceOrdinal\?: number/)
  assert.match(index,/upsert: false/)
  assert.match(index,/store\.remove\(\[path\]\)/)
})
test('DB hash uniqueness handles concurrent duplicate and original ordinal collisions',()=>{
  assert.match(sql,/UNIQUE INDEX/)
  assert.match(sql,/\(tenant_id, event_id, content_sha256\)/)
  assert.match(sql,/WHERE content_sha256 IS NOT NULL/)
  assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|UPDATE public\./)
})
test('UI uploads queued files sequentially and does not reanalyze existing event',()=>{
  assert.match(ui,/for \(const item of pending\)/)
  assert.match(ui,/body\.set\('file',item\.file\)/)
  assert.match(ui,/result\.status === 'audit_unverified'/)
  assert.match(ui,/multiple disabled=\{uploadBusy\}/)
  assert.doesNotMatch(ui,/\/api\/analyze|run-primary-sera-engine|set.*perception_code/)
})
test('large original download uses byte ranges, never sends >4MB through Vercel',()=>{
  assert.match(download,/resolveAuthorizedDocumentRange/)
  assert.match(download,/status: range\.partial \? 206 : 200/)
  assert.match(download,/Content-Range/)
  assert.match(ui,/DOWNLOAD_PART_BYTES = 3_800_000/)
  assert.match(ui,/crypto\.subtle\.digest\('SHA-256'/)
})

test('initial document extraction cannot bind an unextracted replacement file or oversized function payload',()=>{
  const upload=readFileSync(new URL('../src/components/sera/DocumentUpload.tsx',import.meta.url),'utf8')
  const page=readFileSync(new URL('../src/app/(dashboard)/events/new/page.tsx',import.meta.url),'utf8')
  assert.match(upload,/onFileReady\?\.\(null\)/)
  assert.match(upload,/file\.size > 3_800_000/)
  assert.ok(upload.indexOf('onFileReady?.(file)')>upload.indexOf('onExtracted(text'))
  assert.match(page,/tab === 'upload' && \(!sourceFile \|\| !sourceMeta\)/)
  assert.match(page,/if \(!file\) setSourceMeta\(null\)/)
})
