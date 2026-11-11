import type { SupabaseClient } from '@supabase/supabase-js'

export const MAX_EXTRACTION_MULTIPART_BYTES = 11 * 1024 * 1024
export type ExtractionQuota = 'allowed' | 'limited' | 'unavailable'

export class ExtractionPayloadTooLarge extends Error {
  constructor() {
    super('Limite de tamanho da requisição excedido.')
  }
}

/** Bound the entire multipart upload even without Content-Length. */
export async function readBoundedExtractionForm(req: Request): Promise<FormData> {
  const length = req.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) ||
      Number(length) > MAX_EXTRACTION_MULTIPART_BYTES)) {
    throw new ExtractionPayloadTooLarge()
  }
  const reader = req.body?.getReader()
  if (!reader) throw new Error('Missing multipart body')
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_EXTRACTION_MULTIPART_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new ExtractionPayloadTooLarge()
    }
    chunks.push(Buffer.from(value))
  }
  // Next.js FormData needs a complete body. Construct it only AFTER enforcing
  // a strict total cap, including multipart boundary overhead.
  const copy = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': req.headers.get('content-type') ?? '' },
    body: Buffer.concat(chunks),
  })
  return copy.formData()
}

/** DB transaction serializes count + insert. Errors must never fail open. */
export async function reserveDocumentExtractionQuota(
  admin: SupabaseClient,
  authUserId: string,
): Promise<ExtractionQuota> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authUserId)) {
    return 'unavailable'
  }
  try {
    const { data, error } = await admin.rpc('hfa_reserve_document_extraction', {
      p_user_id: authUserId,
    })
    if (error || typeof data !== 'boolean') return 'unavailable'
    return data ? 'allowed' : 'limited'
  } catch {
    return 'unavailable'
  }
}
