/**
 * File validation and persistence boundary for an HFA event.
 * A failed Storage/DB insert is never reported as persisted. Storage and
 * public.event_documents have no shared transaction; compensate failures.
 */
import type { getSupabaseAdmin } from './server/supabase-admin'
import type { FileSecurityCheckResult } from './gemini-multifile-security'
import { validateFileSecurity } from './gemini-multifile-security'
import {
  MAX_BATCH_FILE_COUNT,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BATCH_BYTES,
  type StoredDocumentDescriptor,
} from './gemini-multifile-types'

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>

export class UploadValidationError extends Error {
  readonly status = 400
  constructor(readonly code: string, detail: string) {
    super(detail)
    this.name = 'UploadValidationError'
  }
}

export interface PreparedSourceFile {
  readonly name: string
  readonly size: number
  readonly mimeType: string
  readonly bytes: Buffer
  readonly security: FileSecurityCheckResult
}

export async function prepareValidatedSourceFiles(files: readonly File[]): Promise<PreparedSourceFile[]> {
  if (files.length > MAX_BATCH_FILE_COUNT) {
    throw new UploadValidationError('TOO_MANY_FILES',
      'São permitidos no máximo ' + MAX_BATCH_FILE_COUNT + ' arquivos por evento.')
  }
  if (files.some(f => f.size > MAX_SINGLE_FILE_BYTES)) {
    throw new UploadValidationError('FILE_TOO_LARGE',
      'Um dos arquivos ultrapassa o limite individual de 10 MB.')
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_BATCH_BYTES) {
    throw new UploadValidationError('BATCH_TOO_LARGE',
      'O tamanho total dos arquivos ultrapassa 30 MB.')
  }

  const prepared: PreparedSourceFile[] = []
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer())
    if (bytes.length !== file.size) {
      throw new UploadValidationError('FILE_SIZE_MISMATCH', 'O tamanho de um arquivo está inconsistente.')
    }
    const security = validateFileSecurity({
      name: file.name,
      size: bytes.length,
      buffer: bytes,
      declaredMime: file.type,
    })
    if (!security.valid) {
      throw new UploadValidationError('INVALID_DOCUMENT',
        security.error || 'Arquivo inválido: ' + security.sanitizedName)
    }
    prepared.push({
      name: file.name, size: bytes.length, mimeType: file.type,
      bytes, security,
    })
  }
  return prepared
}

export interface DocumentPersistenceFailure {
  fileName: string
  reason: 'STORAGE_FAILED' | 'METADATA_FAILED' | 'METADATA_FAILED_CLEANUP_FAILED'
}

export interface DocumentPersistenceReport {
  descriptors: StoredDocumentDescriptor[]
  failures: DocumentPersistenceFailure[]
  requested: number
  persisted: number
  complete: boolean
}

export async function persistUploadedSourceFiles(params: {
  admin: SupabaseAdmin
  tenantId: string
  submittedById: string
  authUserId: string
  eventId: string
  files: readonly PreparedSourceFile[]
  analysisId?: string
}): Promise<DocumentPersistenceReport> {
  const { admin, tenantId, submittedById, authUserId, eventId, files, analysisId } = params
  // Storage RLS compares foldername(name)[1] with auth.uid(). An untrusted
  // string must never determine another tenant's Storage prefix under service_role.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authUserId)) {
    throw new UploadValidationError('INVALID_AUTH_IDENTITY', 'Identidade autenticada inválida para armazenamento.')
  }
  const descriptors: StoredDocumentDescriptor[] = []
  const failures: DocumentPersistenceFailure[] = []
  const storage = admin.storage.from('analysis-documents')

  for (const [index, file] of files.entries()) {
    const { security } = file
    if (!security.valid) {
      // Prevent bypass of the preparation step by another code path.
      throw new UploadValidationError('INVALID_DOCUMENT', 'Documento sem validação obrigatória.')
    }
    const safeName = security.sanitizedName
    const shortHash = security.sha256.slice(0, 10)
    // Storage RLS uses first path segment == auth.uid(). Public users IDs
    // may differ from auth.users IDs on legacy accounts.
    const pathPrefix = analysisId
      ? authUserId + '/' + analysisId
      : authUserId + '/events/' + eventId
    const storagePath = pathPrefix + '/' + (index + 1) + '_' + shortHash + '_' + safeName

    try {
      const result = await storage.upload(storagePath, file.bytes, {
        // Supabase bucket allows exact MIME names, not charset parameters.
        contentType: security.canonicalMime.split(';')[0].trim(),
        upsert: false,
      })
      if (result.error) throw new Error('STORAGE_FAILED')
    } catch {
      failures.push({ fileName: safeName, reason: 'STORAGE_FAILED' })
      continue
    }

    try {
      const inserted = await admin.from('event_documents').insert({
        tenant_id: tenantId,
        event_id: eventId,
        uploaded_by: submittedById,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: security.canonicalMime,
        size_bytes: file.size,
      })
      if (inserted.error) throw new Error('METADATA_FAILED')
    } catch {
      let cleaned = false
      try {
        const removed = await storage.remove([storagePath])
        cleaned = !removed.error
      } catch {
        cleaned = false
      }
      failures.push({
        fileName: safeName,
        reason: cleaned ? 'METADATA_FAILED' : 'METADATA_FAILED_CLEANUP_FAILED',
      })
      continue
    }

    descriptors.push({
      fileName: file.name,
      sanitizedName: safeName,
      storagePath,
      mimeType: security.canonicalMime,
      sizeBytes: file.size,
      sha256: security.sha256,
      // Upload success does not prove extraction of PDF/DOCX/TXT text.
      status: security.status === 'unsupported_ocr' ? 'unsupported_ocr' : 'stored_unprocessed',
      wordCount: 0,
    })
  }

  return {
    descriptors,
    failures,
    requested: files.length,
    persisted: descriptors.length,
    complete: failures.length === 0 && descriptors.length === files.length,
  }
}
