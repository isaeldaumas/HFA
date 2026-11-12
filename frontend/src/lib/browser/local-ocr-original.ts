/**
 * Browser-only retrieval of an original indexed for the authorized tenant/event.
 * Never trust a filename, content type or response alone as proof of integrity.
 */
export const OCR_MAX_ORIGINAL_BYTES = 10 * 1024 * 1024
export const OCR_RANGE_BYTES = 3_800_000
export const OCR_MAX_RENDER_PIXELS = 8_000_000
export const OCR_MAX_TEXT_CHARS = 60_000
export class LocalOcrError extends Error {
  constructor(public readonly code:
    'INVALID_SOURCE' | 'DOWNLOAD_FAILED' | 'INTEGRITY_MISMATCH' |
    'UNSUPPORTED_SOURCE' | 'RENDER_LIMIT' | 'OCR_EMPTY' | 'OCR_FAILED') {
    super(code)
    this.name = 'LocalOcrError'
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA = /^[a-f0-9]{64}$/
const ALLOWED = new Set(['image/png','image/jpeg','image/webp','application/pdf'])
export type OcrSourceIdentity = {
  eventId: string
  documentId: string
  sourceOrdinal: number
  sha256: string
  mimeType: string
  sizeBytes: number
}
function fail(code: LocalOcrError['code']): never { throw new LocalOcrError(code) }
export function validateLocalOcrSource(source: OcrSourceIdentity, token: string) {
  if (!UUID.test(source.eventId) || !UUID.test(source.documentId) ||
      !Number.isInteger(source.sourceOrdinal) || source.sourceOrdinal < 1 ||
      source.sourceOrdinal > 5 || !SHA.test(source.sha256) ||
      !ALLOWED.has(source.mimeType) || !token ||
      !Number.isSafeInteger(source.sizeBytes) || source.sizeBytes < 1 ||
      source.sizeBytes > OCR_MAX_ORIGINAL_BYTES ||
      (source.mimeType !== 'application/pdf' && source.sizeBytes > OCR_RANGE_BYTES)) {
    fail('INVALID_SOURCE')
  }
}
const asHex = (bytes: Uint8Array) =>
  [...bytes].map((n)=>n.toString(16).padStart(2,'0')).join('')
/** Strict range, size, hash and Content-Type checks; redirects disabled. */
export async function downloadVerifiedOcrOriginal(
  source: OcrSourceIdentity,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<Blob> {
  validateLocalOcrSource(source, token)
  const url='/api/events/'+source.eventId+'/documents/'+source.documentId
  const parts: Uint8Array<ArrayBuffer>[]=[]
  let total=0
  for(let start=0;start<source.sizeBytes;start+=OCR_RANGE_BYTES) {
    const end=Math.min(source.sizeBytes-1,start+OCR_RANGE_BYTES-1)
    const ranged=source.sizeBytes>OCR_RANGE_BYTES
    const response=await fetcher(url,{
      method:'GET',
      headers:{
        Authorization:'Bearer '+token,
        ...(ranged?{Range:'bytes='+start+'-'+end}:{}),
      },
      redirect:'error',cache:'no-store',credentials:'omit',
    }).catch(()=>fail('DOWNLOAD_FAILED'))
    if(response.status !== (ranged?206:200)) fail('DOWNLOAD_FAILED')
    if(response.headers.get('content-length')!==String(end-start+1) ||
        (ranged && response.headers.get('content-range')!==
          'bytes '+start+'-'+end+'/'+source.sizeBytes)) fail('INTEGRITY_MISMATCH')
    const mime=response.headers.get('content-type')?.split(';')[0]?.trim()
    if(mime!==source.mimeType) fail('INTEGRITY_MISMATCH')
    const arr=await response.arrayBuffer().catch(()=>fail('DOWNLOAD_FAILED'))
    if(arr.byteLength!==end-start+1) fail('INTEGRITY_MISMATCH')
    total+=arr.byteLength
    if(total>OCR_MAX_ORIGINAL_BYTES) fail('INTEGRITY_MISMATCH')
    parts.push(new Uint8Array(arr))
  }
  if(total!==source.sizeBytes) fail('INTEGRITY_MISMATCH')
  const data=new Uint8Array(total)
  let offset=0
  for(const part of parts) {data.set(part,offset);offset+=part.byteLength}
  const hash=asHex(new Uint8Array(await crypto.subtle.digest('SHA-256',data)))
  if(hash!==source.sha256) fail('INTEGRITY_MISMATCH')
  return new Blob([data],{type:source.mimeType})
}
export function prepareOcrText(raw: unknown): {text:string;truncated:boolean} {
  if(typeof raw!=='string') fail('OCR_FAILED')
  // OCR output is untrusted evidence and must never feed SERA automatically.
  const normalized=raw.replace(/\u0000/g,'').replace(/[\u202a-\u202e\u2066-\u2069]/g,'').trim()
  if(!normalized) fail('OCR_EMPTY')
  return {
    text:normalized.slice(0,OCR_MAX_TEXT_CHARS),
    truncated:normalized.length>OCR_MAX_TEXT_CHARS,
  }
}
