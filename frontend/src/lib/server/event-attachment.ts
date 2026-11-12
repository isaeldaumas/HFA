import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertFileSize,
  detectDocumentKind,
  DocumentExtractError,
} from '@/lib/sera/document-extraction'

const DOCUMENT_BUCKET = 'analysis-documents'

export type PreparedAttachment = {
  data: Buffer
  kind: 'pdf' | 'docx'
  fileName: string
  mimeType: string
}

export class EventAttachmentError extends Error {
  constructor(public readonly code:
    | 'INVALID_TYPE'
    | 'EMPTY_FILE'
    | 'UPLOAD_FAILED'
    | 'DOCUMENT_INDEX_FAILED'
    | 'DOCUMENT_INDEX_CLEANUP_FAILED'
    | 'BODY_TOO_LARGE'
    | 'INVALID_BODY',
  ) {
    super(code)
    this.name = 'EventAttachmentError'
  }
}

/** Verify actual signature, extension, MIME, and bytes before event creation. */
export async function prepareEventAttachment(file: File): Promise<PreparedAttachment> {
  if (file.size <= 0) throw new EventAttachmentError('EMPTY_FILE')
  assertFileSize(file.size)
  const lower = file.name.toLowerCase()
  const declaredKind = lower.endsWith('.pdf') ? 'pdf'
    : lower.endsWith('.docx') ? 'docx' : null
  if (!declaredKind) throw new EventAttachmentError('INVALID_TYPE')
  const data = Buffer.from(await file.arrayBuffer())
  const kind = detectDocumentKind(data)
  if (!kind || kind !== declaredKind) throw new EventAttachmentError('INVALID_TYPE')
  const mimeType = kind === 'pdf' ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (file.type && file.type !== mimeType &&
    !(kind === 'docx' && file.type === 'application/octet-stream')) {
    throw new EventAttachmentError('INVALID_TYPE')
  }
  return { data, kind, fileName: file.name.slice(0, 255), mimeType }
}

/**
 * Cross-system write cannot be atomic. A successful storage upload with a
 * failed DB index insert is compensated by removing that exact new object.
 * Never report a successful attachment when either operation fails.
 */
export async function persistEventAttachment(params: {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  authUserId: string
  publicUserId: string
  attachment: PreparedAttachment
  sourceOrdinal?: number
}): Promise<string> {
  const { admin, tenantId, eventId, authUserId, publicUserId, attachment } = params
  const ordinal = params.sourceOrdinal ?? 1
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 5) {
    throw new EventAttachmentError('INVALID_BODY')
  }
  const path = authUserId + '/events/' + eventId + '/' + randomUUID() + '.' + attachment.kind
  const store = admin.storage.from(DOCUMENT_BUCKET)
  try {
    const { error } = await store.upload(path, attachment.data, {
      contentType: attachment.mimeType,
      upsert: false,
    })
    if (error) throw new EventAttachmentError('UPLOAD_FAILED')
  } catch {
    throw new EventAttachmentError('UPLOAD_FAILED')
  }
  try {
    const { error } = await admin.from('event_documents').insert({
      tenant_id: tenantId,
      event_id: eventId,
      uploaded_by: publicUserId,
      file_name: attachment.fileName,
      storage_path: path,
      mime_type: attachment.mimeType,
      size_bytes: attachment.data.length,
      content_sha256: createHash('sha256').update(attachment.data).digest('hex'),
      source_ordinal: ordinal,
    })
    if (error) throw new EventAttachmentError('DOCUMENT_INDEX_FAILED')
  } catch {
    try {
      const { error } = await store.remove([path])
      if (error) throw error
    } catch {
      throw new EventAttachmentError('DOCUMENT_INDEX_CLEANUP_FAILED')
    }
    throw new EventAttachmentError('DOCUMENT_INDEX_FAILED')
  }
  return path
}

/** Never parse large JSON bodies before checking bytes, even without length. */
export async function readBoundedEventJson(req: Request): Promise<Record<string, unknown>> {
  const maxBytes = 2 * 1024 * 1024
  const length = req.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new EventAttachmentError('BODY_TOO_LARGE')
  }
  const reader = req.body?.getReader()
  if (!reader) throw new EventAttachmentError('INVALID_BODY')
  const chunks: Buffer[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new EventAttachmentError('BODY_TOO_LARGE')
    }
    chunks.push(Buffer.from(value))
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // The client may provide malformed JSON; do not log its content.
  }
  throw new EventAttachmentError('INVALID_BODY')
}

export function attachmentErrorStatus(error: unknown): number {
  if (error instanceof DocumentExtractError && error.code === 'TOO_LARGE') return 413
  if (error instanceof EventAttachmentError && error.code === 'BODY_TOO_LARGE') return 413
  if (error instanceof EventAttachmentError && error.code === 'INVALID_BODY') return 400
  if (error instanceof EventAttachmentError &&
    (error.code === 'INVALID_TYPE' || error.code === 'EMPTY_FILE')) return 400
  return 502
}
