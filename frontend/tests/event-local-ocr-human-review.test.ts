import assert from 'node:assert/strict'
import {test} from 'node:test'
import {
  buildLocalOcrReviewRecord,localOcrReviewFileName,LocalOcrReviewError,
} from '../src/lib/browser/local-ocr-human-review'
const SOURCE={
  eventId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sourceOrdinal:2,sha256:'b'.repeat(64),
  mimeType:'image/png',sizeBytes:100,
}
const BASE={
  source:SOURCE,
  pageNumber:null,
  originalText:'SEGURANCA DE VOO',
  correctedText:'SEGURANÇA DE VOO',
  ocrTruncated:false,
  comparedToOriginal:true,
  checkedCorrections:true,
}
function denies(patch:Record<string,unknown>,code:LocalOcrReviewError['code']) {
  assert.throws(()=>buildLocalOcrReviewRecord({...BASE,...patch} as typeof BASE),
    (e:unknown)=>e instanceof LocalOcrReviewError&&e.code===code)
}
test('explicit local corrected transcription retains source identity and no SERA side effects',()=>{
  const record=buildLocalOcrReviewRecord(BASE)
  assert.equal(record.originalSha256,SOURCE.sha256)
  assert.equal(record.ocrText,'SEGURANCA DE VOO')
  assert.equal(record.humanCorrectedText,'SEGURANÇA DE VOO')
  assert.equal(record.sourceOrdinal,2)
  assert.equal(record.reviewedByHuman,'SELF_DECLARED_LOCAL_ONLY')
  assert.equal(record.reviewPersisted,false)
  assert.equal(record.reviewSignatureVerified,false)
  assert.equal(record.scientificallyValidated,false)
  assert.equal(record.analysisChanged,false)
  assert.equal(record.externalProviderUsed,false)
  assert.match(localOcrReviewFileName(record),/^hfa-ocr-local-review-[a-f0-9-]+-image\.json$/)
})
test('PDF review cites ONLY a verified selected page, never invents a page',()=>{
  const pdfSource={...SOURCE,mimeType:'application/pdf'}
  const valid=buildLocalOcrReviewRecord({...BASE,source:pdfSource,pageNumber:7})
  assert.equal(valid.pageNumber,7)
  assert.match(localOcrReviewFileName(valid),/-page-7\.json$/)
  for(const page of [null,-1,0,1.5,81,NaN])
    denies({source:pdfSource,pageNumber:page},'INVALID_PAGE')
  denies({pageNumber:1},'INVALID_PAGE')
})
test('empty, forged and oversized transcription fail closed',()=>{
  for(const correctedText of ['', ' \n ', 'hello\u0000evil','x'.repeat(60001)])
    denies({correctedText},'INVALID_TRANSCRIPTION')
  denies({originalText:''},'INVALID_TRANSCRIPTION')
  denies({originalText:'x'.repeat(60001)},'INVALID_TRANSCRIPTION')
})
test('user must declare BOTH comparison and correction separately',()=>{
  denies({comparedToOriginal:false},'MISSING_REVIEW')
  denies({checkedCorrections:false},'MISSING_REVIEW')
  denies({comparedToOriginal:false,checkedCorrections:false},'MISSING_REVIEW')
})
test('truncated OCR cannot be declared reviewed',()=>{
  denies({ocrTruncated:true},'INCOMPLETE_OCR')
})
test('identity spoof and cross-source label fail before exporting',()=>{
  denies({source:{...SOURCE,sha256:'0'}},'INVALID_SOURCE')
  denies({source:{...SOURCE,eventId:'../foreign'}},'INVALID_SOURCE')
  denies({source:{...SOURCE,sourceOrdinal:9}},'INVALID_SOURCE')
  denies({source:{...SOURCE,mimeType:'text/plain'}},'INVALID_SOURCE')
})
