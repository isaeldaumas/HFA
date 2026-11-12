import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
const src=readFileSync(new URL('../src/app/api/events/route.ts',import.meta.url),'utf8')
const ui=readFileSync(new URL('../src/app/(dashboard)/events/new/page.tsx',import.meta.url),'utf8')
const audit=readFileSync(new URL('../src/lib/observability/audit.ts',import.meta.url),'utf8')

test('attachment verification happens before record creation and credit debit',()=>{
  const prepare=src.indexOf('await prepareEventAttachment(sourceFile)')
  const insertEvent=src.indexOf("stage = 'insert-event'")
  const persist=src.indexOf('await persistEventAttachment({')
  const debit=src.indexOf('await debitCreditForEvent({')
  const engine=src.indexOf('await createCanonicalEventAnalysis({')
  assert.ok(prepare>0 && prepare<insertEvent)
  assert.ok(persist>insertEvent && persist<debit && debit<engine)
  assert.doesNotMatch(src,/if \(!uploadError\)\s*\{\s*await admin/)
})
test('attachment failure retains event ID and emits non-success, no duplicate blind resubmit',()=>{
  assert.match(src,/eventType: 'event_attachment_failed'/)
  assert.match(src,/attachment_status: documentError/)
  assert.match(src,/event_id: eventId/)
  assert.match(src,/status: 502, headers:/)
  assert.match(ui,/setIncompleteEventId\(data.event_id\)/)
  assert.match(ui,/Abrir o evento registrado e tentar novamente sem duplicar/)
  assert.match(audit,/'event_attachment_failed'/)
})
test('multipart and JSON parsing use explicit bounded readers and prevent silent multiple files',()=>{
  assert.match(src,/readBoundedExtractionForm\(req\)/)
  assert.match(src,/form\.getAll\('file'\)\.length > 1/)
  assert.match(src,/readBoundedEventJson\(req\)/)
  assert.match(src,/status === 413/)
})
test('analysis metadata update must confirm an indexed row; never silently ignore errors',()=>{
  assert.match(src, /\.select\('id'\)\s*\.maybeSingle\(\)/)
  assert.match(src, /if \(patch\.error \|\| !patch\.data\?\.id\)/)
  assert.match(src,/persistedAttachmentPath/)
  assert.match(src,/PRIMARY_SERA_DOCUMENT_METADATA_UPDATE_FAILED/)
})
