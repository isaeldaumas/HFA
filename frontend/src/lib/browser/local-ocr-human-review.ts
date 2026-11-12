import {OCR_MAX_TEXT_CHARS,type OcrSourceIdentity} from './local-ocr-original'

const SHA256=/^[a-f0-9]{64}$/
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export const LOCAL_OCR_REVIEW_VERSION='HFA_OCR_LOCAL_REVIEW_V1'
export class LocalOcrReviewError extends Error {
  constructor(public readonly code:
    'INVALID_SOURCE'|'INVALID_PAGE'|'INCOMPLETE_OCR'|
    'MISSING_REVIEW'|'INVALID_TRANSCRIPTION') {
    super(code);this.name='LocalOcrReviewError'
  }
}
export type LocalOcrReviewInput={
  source:OcrSourceIdentity
  pageNumber:number|null
  originalText:string
  correctedText:string
  ocrTruncated:boolean
  comparedToOriginal:boolean
  checkedCorrections:boolean
}
export type LocalOcrReviewRecord={
  schema:typeof LOCAL_OCR_REVIEW_VERSION
  eventId:string
  documentId:string
  sourceOrdinal:number
  originalSha256:string
  originalMimeType:string
  pageNumber:number|null
  ocrText:string
  humanCorrectedText:string
  declaration:'COMPARISON_WITH_ORIGINAL_DECLARED_IN_THIS_BROWSER_SESSION'
  reviewedByHuman:'SELF_DECLARED_LOCAL_ONLY'
  reviewPersisted:false
  reviewSignatureVerified:false
  scientificallyValidated:false
  analysisChanged:false
  externalProviderUsed:false
}
/** Local self-declaration is not a signed/durable audit record. */
export function buildLocalOcrReviewRecord(input:LocalOcrReviewInput):LocalOcrReviewRecord {
  const {source,pageNumber,originalText,correctedText,ocrTruncated,
    comparedToOriginal,checkedCorrections}=input
  if(!UUID.test(source.eventId)||!UUID.test(source.documentId)||
     !SHA256.test(source.sha256)||!Number.isInteger(source.sourceOrdinal)||
     source.sourceOrdinal<1||source.sourceOrdinal>5||
     !['image/png','image/jpeg','image/webp','application/pdf'].includes(source.mimeType)) {
    throw new LocalOcrReviewError('INVALID_SOURCE')
  }
  if(source.mimeType==='application/pdf'
    ? (!Number.isInteger(pageNumber)||pageNumber===null||pageNumber<1||pageNumber>80)
    : pageNumber!==null) {
    throw new LocalOcrReviewError('INVALID_PAGE')
  }
  if(ocrTruncated) throw new LocalOcrReviewError('INCOMPLETE_OCR')
  if(!comparedToOriginal||!checkedCorrections)
    throw new LocalOcrReviewError('MISSING_REVIEW')
  if(typeof originalText!=='string'||!originalText.trim()||
     originalText.length>OCR_MAX_TEXT_CHARS||
     typeof correctedText!=='string'||!correctedText.trim()||
     correctedText.length>OCR_MAX_TEXT_CHARS||correctedText.includes('\u0000')) {
    throw new LocalOcrReviewError('INVALID_TRANSCRIPTION')
  }
  return {
    schema:LOCAL_OCR_REVIEW_VERSION,
    eventId:source.eventId,documentId:source.documentId,
    sourceOrdinal:source.sourceOrdinal,originalSha256:source.sha256,
    originalMimeType:source.mimeType,pageNumber,
    ocrText:originalText,humanCorrectedText:correctedText.trim(),
    declaration:'COMPARISON_WITH_ORIGINAL_DECLARED_IN_THIS_BROWSER_SESSION',
    reviewedByHuman:'SELF_DECLARED_LOCAL_ONLY',
    reviewPersisted:false,reviewSignatureVerified:false,
    scientificallyValidated:false,analysisChanged:false,externalProviderUsed:false,
  }
}
export function localOcrReviewFileName(record:LocalOcrReviewRecord):string {
  const page=record.pageNumber===null?'image':'page-'+record.pageNumber
  return 'hfa-ocr-local-review-'+record.documentId+'-'+page+'.json'
}
