import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  EventAttachmentError,
  persistEventAttachment,
  prepareEventAttachment,
} from './event-attachment'
import { DocumentAccessError } from './event-document-access'

export const MAX_APPEND_FILE_BYTES = 3_800_000
export const MAX_APPEND_MULTIPART_BYTES = 4_000_000
export const MAX_EVENT_SOURCES = 5
export const MAX_EVENT_TOTAL_BYTES = 30_000_000

export type AppendResult = {
  status: 'created' | 'already_present'
  sourceOrdinal: number
  sha256: string
}

/** One file per request because Vercel Functions limit payloads to 4.5 MB. */
export async function readBoundedDocumentAppendForm(req: Request): Promise<FormData> {
  const rawLength = req.headers.get('content-length')
  if (rawLength !== null &&
    (!/^[0-9]+$/.test(rawLength) || Number(rawLength) > MAX_APPEND_MULTIPART_BYTES)) {
    throw new EventAttachmentError('BODY_TOO_LARGE')
  }
  const contentType = req.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType)) {
    throw new EventAttachmentError('INVALID_BODY')
  }
  const reader = req.body?.getReader()
  if (!reader) throw new EventAttachmentError('INVALID_BODY')
  const chunks: Buffer[] = []
  let received = 0
  while (true) {
    const {done,value} = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_APPEND_MULTIPART_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new EventAttachmentError('BODY_TOO_LARGE')
    }
    chunks.push(Buffer.from(value))
  }
  const copy = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: Buffer.concat(chunks),
  })
  try {
    return await copy.formData()
  } catch {
    throw new EventAttachmentError('INVALID_BODY')
  }
}

export class AppendDocumentError extends Error {
  constructor(
    public readonly code: 'LIMIT_REACHED' | 'DUPLICATE_FILES' | 'LOOKUP_UNAVAILABLE' |
      'INVALID_UPLOAD' | 'UPLOAD_TOO_LARGE' | 'STORAGE_FAILED',
  ) {
    super(code)
    this.name = 'AppendDocumentError'
  }
}

/**
 * Adds a supplementary original source without changing the event narrative,
 * engine output, conclusion, risk score or analysis metadata.
 *
 * Requests can race. A unique (tenant,event,ordinal) DB constraint fails closed
 * and persistEventAttachment removes the just-uploaded object when its index
 * insert fails. No "success" is returned for an unverified upload.
 */
export async function appendOriginalEventDocument(params: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  authUserId: string
  publicUserId: string
  file: File
}): Promise<AppendResult> {
  const {admin, tenantId, eventId, authUserId, publicUserId, file} = params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    throw new DocumentAccessError('INVALID_ID')
  }
  if (!(file instanceof File) || file.size <= 0) {
    throw new AppendDocumentError('INVALID_UPLOAD')
  }
  if (file.size > MAX_APPEND_FILE_BYTES) {
    throw new AppendDocumentError('UPLOAD_TOO_LARGE')
  }
  // This checks the actual event/tenant association before any privileged
  // Storage read/write. Never derive tenantId from any multipart field.
  const {data:event, error:eventError} = await admin.from('events')
    .select('id')
    .eq('id',eventId)
    .eq('tenant_id',tenantId)
    .is('deleted_at',null)
    .neq('deletion_status','PURGED')
    .maybeSingle()
  if (eventError) throw new DocumentAccessError('UNAVAILABLE')
  if (!event?.id) throw new DocumentAccessError('NOT_FOUND')

  const attachment = await prepareEventAttachment(file,{allowText:true})
  const sha256 = createHash('sha256').update(attachment.data).digest('hex')
  const {data:existing,error:lookupError} = await admin.from('event_documents')
    .select('id,source_ordinal,content_sha256,size_bytes')
    .eq('tenant_id',tenantId)
    .eq('event_id',eventId)
    .order('source_ordinal',{ascending:true})
    .limit(MAX_EVENT_SOURCES)
  if (lookupError || !existing) throw new AppendDocumentError('LOOKUP_UNAVAILABLE')
  if (existing.length > MAX_EVENT_SOURCES) throw new AppendDocumentError('LOOKUP_UNAVAILABLE')
  const same = existing.find((row) => row.content_sha256 === sha256)
  if (same) {
    return {status:'already_present',sourceOrdinal:Number(same.source_ordinal),sha256}
  }
  if (existing.length >= MAX_EVENT_SOURCES) throw new AppendDocumentError('LIMIT_REACHED')
  const accumulated = existing.reduce((sum,row) => sum + Number(row.size_bytes || 0),0)
  if (!Number.isSafeInteger(accumulated) || accumulated < 0 ||
    accumulated + attachment.data.length > MAX_EVENT_TOTAL_BYTES) {
    throw new AppendDocumentError('LIMIT_REACHED')
  }
  const occupied = new Set(existing.map((row) => Number(row.source_ordinal)))
  const ordinal = Array.from({length:MAX_EVENT_SOURCES},(_,index)=>index+1)
    .find((position)=>!occupied.has(position))
  if (!ordinal) throw new AppendDocumentError('LIMIT_REACHED')

  try {
    await persistEventAttachment({
      admin, tenantId, eventId, authUserId, publicUserId,
      attachment, sourceOrdinal:ordinal,
    })
  } catch (error) {
    if (error instanceof EventAttachmentError) {
      throw new AppendDocumentError('STORAGE_FAILED')
    }
    throw error
  }
  return {status:'created',sourceOrdinal:ordinal,sha256}
}
