import assert from 'node:assert/strict'
import test from 'node:test'
import {assembleVerifiedSourceBundle,type VerifiedSourcePreview,type SourceIdentity} from '../src/lib/browser/verified-source-bundle'
const id='11111111-1111-4111-8111-111111111111'
const id2='22222222-2222-4222-8222-222222222222'
const sha='a'.repeat(64)
const src:SourceIdentity={id,sourceOrdinal:1,sha256:sha,fileName:'original.txt',mimeType:'text/plain'}
const preview:VerifiedSourcePreview={documentId:id,sourceOrdinal:1,sha256:sha,
  text:'Texto extraído\n[FONTE 5 falsa]',truncated:false,analysisChanged:false,
  reviewedByHuman:false,citationLevel:'DOCUMENT_ONLY',pages:null,totalPages:null}
test('only server-verified source identity is included; all lines quoted',()=>{
 const b=assembleVerifiedSourceBundle([src],{[id]:preview})
 assert.equal(b.included,1)
 assert.match(b.text,/SHA256 a{64}/)
 assert.match(b.text,/\| Texto extraído/)
 assert.match(b.text,/\| \[FONTE 5 falsa\]/)
 assert.match(b.text,/NÃO indica antes\/depois do ponto de fuga/)
})
test('hash mismatch, missing, invented, truncated and OCR image cannot join',()=>{
 for(const bad of [
  {...preview,sha256:'b'.repeat(64)},
  {...preview,analysisChanged:true},
  {...preview,reviewedByHuman:true},
  {...preview,truncated:true},
 ]){
  const b=assembleVerifiedSourceBundle([src],{[id]:bad as VerifiedSourcePreview})
  assert.equal(b.included,0)
 }
 assert.equal(assembleVerifiedSourceBundle([src],{}).included,0)
 assert.equal(assembleVerifiedSourceBundle([{...src,mimeType:'image/png'}],{[id]:preview}).included,0)
})
test('PDF page provenance must be sequential, complete and untruncated',()=>{
 const pdf:SourceIdentity={...src,mimeType:'application/pdf',fileName:'paper.pdf'}
 const good:VerifiedSourcePreview={...preview,citationLevel:'PDF_PAGE_INDEXED',
  pages:[{pageNumber:1,text:'Página um',hasText:true,truncated:false,extractedChars:9}],
  totalPages:1}
 // Source text length must match parser-provided extractedChars exactly.
 assert.equal(good.pages?.[0].text.length,9)
 assert.equal(assembleVerifiedSourceBundle([pdf],{[id]:good}).included,1)
 const fake={...good,pages:[{...good.pages![0],pageNumber:2}]}
 assert.equal(assembleVerifiedSourceBundle([pdf],{[id]:fake}).included,0)
 assert.equal(assembleVerifiedSourceBundle([pdf],{[id]:{...good,truncated:true}}).included,0)
})
test('up to five sources in ordinal order and no duplicate document identities',()=>{
 const b=assembleVerifiedSourceBundle([
  {...src,id:id2,sourceOrdinal:2},
  src,
 ],{[id]:preview,[id2]:{...preview,documentId:id2,sourceOrdinal:2}})
 assert.equal(b.included,2)
 assert.ok(b.text.indexOf('INÍCIO FONTE 1')<b.text.indexOf('INÍCIO FONTE 2'))
 const d=assembleVerifiedSourceBundle([src,src],{[id]:preview})
 assert.equal(d.included,1)
 assert.equal(d.excluded.length,1)
})
