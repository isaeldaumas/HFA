import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'

const attachment=readFileSync(new URL('../src/lib/server/event-attachment.ts',import.meta.url),'utf8')
const append=readFileSync(new URL('../src/lib/server/event-document-append.ts',import.meta.url),'utf8')
const text=readFileSync(new URL('../src/lib/server/event-plain-text.ts',import.meta.url),'utf8')
const download=readFileSync(new URL('../src/lib/server/event-document-access.ts',import.meta.url),'utf8')
const preview=readFileSync(new URL('../src/lib/server/event-source-preview.ts',import.meta.url),'utf8')
const panel=readFileSync(new URL('../src/components/sera/EventDocumentsPanel.tsx',import.meta.url),'utf8')
const sql=readFileSync(new URL('../../supabase/migrations/20261112213954_event_documents_text_plain_allowlist.sql',import.meta.url),'utf8')
test('TXT is supplemental only; initial event route remains PDF/DOCX by default',()=>{
  assert.match(attachment,/options: \{allowText\?: boolean;allowImages\?: boolean\} = \{\}/)
  assert.match(attachment,/lower\.endsWith\('\.txt'\) && options\.allowText/)
  assert.match(append,/prepareEventAttachment\(file,\{allowText:true,allowImages:true\}\)/)
})
test('TXT bytes are strictly validated; mismatch, NUL and bidi override disallowed',()=>{
  assert.match(text,/new TextDecoder\('utf-8', \{ fatal: true/)
  assert.match(text,/PlainTextOriginalError/)
  assert.match(text,/\\u0000|\\u001f/)
  assert.match(text,/\\u202a-\\u202e/)
  assert.match(text,/prefix\.startsWith\('%PDF-'\)/)
})
test('private download remains tenant/event/path scoped with canonical MIME',()=>{
  assert.match(download,/'text\/plain'/)
  assert.match(download,/suffix === 'txt'/)
  assert.match(download,/\.eq\('tenant_id', tenantId\)/)
  assert.match(download,/createHash\('sha256'\)\.update\(bytes\)/)
  assert.doesNotMatch(download,/createSignedUrl|getPublicUrl/)
})
test('verified TXT previews never call OCR or change SERA analysis',()=>{
  assert.match(preview,/decodeStrictUtf8TextOriginal\(original.bytes\)/)
  assert.match(preview,/analysisChanged: false/)
  assert.match(preview,/reviewedByHuman: false/)
  assert.match(preview,/citationLevel: pages \? 'PDF_PAGE_INDEXED' : 'DOCUMENT_ONLY'/)
  assert.match(panel,/pdf\|docx\|txt/)
  assert.doesNotMatch(preview,/new OpenAI|new Anthropic|\.insert\(|\.upsert\(/)
})
test('only private document bucket allowlist is extended; no relaxation of policies',()=>{
  assert.match(sql,/WHERE id = 'analysis-documents'/)
  assert.match(sql,/current_public IS DISTINCT FROM false/)
  assert.match(sql,/current_limit IS DISTINCT FROM 10485760/)
  assert.match(sql,/array_append\(current_types, 'text\/plain'\)/)
  assert.doesNotMatch(sql,/DROP TABLE|CREATE POLICY|ALTER TABLE|public\s*=\s*true/i)
})
