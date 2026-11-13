import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const route = readFileSync(new URL(
  '../src/app/api/events/[eventId]/documents/[documentId]/preview/route.ts',
  import.meta.url), 'utf8')
const source = readFileSync(new URL('../src/lib/server/event-source-preview.ts',
  import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/sera/EventDocumentsPanel.tsx',
  import.meta.url), 'utf8')
const ui = readFileSync(new URL('../src/components/sera/EventSourceTextPreview.tsx',
  import.meta.url), 'utf8')
const gate = readFileSync(new URL('../src/lib/server/document-extraction-gate.ts',
  import.meta.url), 'utf8')

test('bearer and authoritatively resolved admin/analyst precede any private reads', () => {
  assert.ok(route.indexOf('await requireBearerUser(req)') <
    route.indexOf('extractVerifiedEventSourcePreview({'))
  assert.match(route, /\['admin', 'analyst'\]/)
  assert.match(route, /await hasUnexpectedPreviewRequestBody\(req\)/)
  const bodyGuard = readFileSync(new URL('../src/lib/server/preview-request-body.ts',import.meta.url),'utf8')
  assert.match(bodyGuard, /req\.body/)
  assert.match(bodyGuard, /await reader\.read\(\)/)
  assert.doesNotMatch(route, /req\.json\(|req\.formData\(/)
  assert.match(route, /'Vary': 'Authorization'/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
})

test('extraction uses existing atomic distributed quota before Storage and PDF parser', () => {
  assert.ok(source.indexOf('dependencies.reserveQuota(') <
    source.indexOf('dependencies.download('))
  assert.ok(source.indexOf('dependencies.download(') <
    source.indexOf('dependencies.parse('))
  assert.match(gate, /hfa_reserve_document_extraction/)
  assert.match(source, /createHash\('sha256'\)\.update\(original\.bytes\)\.digest\('hex'\)/)
  assert.match(source, /source\.sha256/)
})

test('document-only preview makes no write to SERA analyses, no OCR and no third-party calls', () => {
  assert.match(source, /analysisChanged: false/)
  assert.match(source, /reviewedByHuman: false/)
  assert.match(source, /citationLevel: 'DOCUMENT_ONLY'/)
  assert.match(source, /externalProviderUsed: false/)
  assert.match(source, /MAX_PREVIEW_CHARS = 60_000/)
  assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\bfetch\(|new OpenAI\(|new Anthropic\(/)
})

test('UI always binds preview to exact source and keeps it temporary, not narrative-applied', () => {
  assert.match(panel, /EventSourceTextPreview/)
  assert.match(panel, /canAppend &&/)
  assert.match(ui, /result\.sha256 !== sha256/)
  assert.match(ui, /result\.documentId !== documentId/)
  assert.match(ui, /result\.sourceOrdinal !== sourceOrdinal/)
  assert.match(ui, /readOnly/)
  assert.match(ui, /setPreview\(null\)/)
  assert.doesNotMatch(ui, /localStorage|sessionStorage|indexedDB|\/api\/analyze|\/api\/events\/.*update/)
})

test('PDF page references must come from page-numbered parser; DOCX remains document-only',()=>{
  const pages = readFileSync(new URL('../src/lib/server/pdf-page-provenance.ts',import.meta.url),'utf8')
  assert.match(pages,/page\.pageNumber/)
  assert.match(pages,/ordered\.length !== parsed\.numpages/)
  assert.match(pages,/page\.pageNumber !== index\+1/)
  assert.match(pages,/MAX_PDF_PAGES_FOR_PREVIEW = 80/)
  assert.match(source,/citationLevel: pages \? 'PDF_PAGE_INDEXED' : 'DOCUMENT_ONLY'/)
  assert.match(source,/pages\.filter\(\(page\) => page\.text\)/)
  assert.match(ui,/preview\.pages\.map/)
  assert.match(ui,/sem camada de texto extraível/)
  assert.match(ui,/Documento DOCX ou TXT sem paginação verificável/)
  assert.doesNotMatch(pages,/openai|anthropic|fetch\(|\.insert\(|\.upsert\(/i)
})
