import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8')
const migration=read('../../supabase/migrations/20261112221735_event_documents_raster_allowlist.sql')
const attachment=read('../src/lib/server/event-attachment.ts')
const append=read('../src/lib/server/event-document-append.ts')
const access=read('../src/lib/server/event-document-access.ts')
const preview=read('../src/lib/server/event-source-preview.ts')
const panel=read('../src/components/sera/EventDocumentsPanel.tsx')
test('raster migration checks exact private preimage and does not change RLS or limits',()=>{
  assert.match(migration,/is_public IS DISTINCT FROM false/)
  assert.match(migration,/max_bytes IS DISTINCT FROM 10485760/)
  assert.match(migration,/cardinality\(types\) <> cardinality\(expected\)/)
  for(const mime of ['image/png','image/jpeg','image/webp','text/plain','application/pdf'])
    assert.ok(migration.includes(mime))
  assert.doesNotMatch(migration,/DROP |DELETE |TRUNCATE |CREATE POLICY|ALTER TABLE.*RLS/i)
})
test('images only enter supplemental path and have no parser or SERA side effects',()=>{
  assert.match(attachment,/options: \{allowText\?: boolean;allowImages\?: boolean\}/)
  assert.match(append,/prepareEventAttachment\(file,\{allowText:true,allowImages:true\}\)/)
  assert.match(attachment,/verifyRasterOriginal\(data, declaredKind\)/)
  assert.match(preview,/original\.mimeType\.startsWith\('image\/'\)/)
  assert.match(preview,/throw new EventSourcePreviewError\('NO_TEXT'\)/)
  assert.doesNotMatch(append,/runSeraPipeline|analyze\/route|perception_code/)
})
test('image originals remain protected downloads and not text previews',()=>{
  for(const mime of ['image/png','image/jpeg','image/webp'])assert.ok(access.includes(mime))
  assert.match(panel,/!item\.mimeType\?\.startsWith\('image\/'\)/)
  assert.match(panel,/OCR indisponível/)
  assert.match(panel,/\.png,.jpg,.jpeg,.webp/)
  assert.match(access,/createHash\('sha256'\)/)
})
