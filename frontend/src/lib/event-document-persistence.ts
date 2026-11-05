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
  constructor(
    readonly code: string,
    detail: string,
    readonly status: 400 | 415 | 503 = 400,
  ) {
    super(detail)
    this.name = 'UploadValidationError'
  }
}

/** The only MIME types the protected HFA document pipeline supports. */
export const HFA_DOCUMENT_BUCKET_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export const HFA_DOCUMENT_BUCKET_ID = 'analysis-documents'
export const HFA_DOCUMENT_BUCKET_LIMIT = MAX_SINGLE_FILE_BYTES
export const HFA_DOCUMENT_BUCKET_INITIAL_MIME_TYPES = HFA_DOCUMENT_BUCKET_MIME_TYPES.slice(0, 2)

/** Check provider settings, not only the file's magic bytes, before creating an event. */
export function checkDocumentBucketPolicy(bucket: {
  public: boolean
  file_size_limit?: number
  allowed_mime_types?: string[] | null
}, requiredMimeTypes: readonly string[]): void {
  if (bucket.public !== false ||
      bucket.file_size_limit !== HFA_DOCUMENT_BUCKET_LIMIT ||
      !Array.isArray(bucket.allowed_mime_types) ||
      bucket.allowed_mime_types.length === 0) {
    throw new UploadValidationError(
      'STORAGE_BUCKET_POLICY_UNVERIFIED',
      'Configuração de armazenamento não verificada; nenhum evento foi criado.',
      503,
    )
  }
  const approved = new Set<string>(HFA_DOCUMENT_BUCKET_MIME_TYPES)
  const configured = bucket.allowed_mime_types
  if (configured.some((mime) => !approved.has(mime))) {
    throw new UploadValidationError(
      'STORAGE_BUCKET_POLICY_UNVERIFIED',
      'Configuração de armazenamento não verificada; nenhum evento foi criado.',
      503,
    )
  }
  if (requiredMimeTypes.some((mime) => !configured.includes(mime))) {
    throw new UploadValidationError(
      'STORAGE_MIME_NOT_ENABLED',
      'Um dos formatos ainda não está habilitado no armazenamento. Nenhum evento foi criado.',
      415,
    )
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

/** Read actual Supabase bucket policy before insertion, credit debit or LLM use. */
export async function assertStorageBucketSupportsSourceFiles(
  admin: SupabaseAdmin,
  files: readonly PreparedSourceFile[],
): Promise<void> {
  if (files.length === 0) return
  let bucket: Awaited<ReturnType<typeof admin.storage.getBucket>>
  try {
    bucket = await admin.storage.getBucket(HFA_DOCUMENT_BUCKET_ID)
  } catch {
    throw new UploadValidationError(
      'STORAGE_BUCKET_UNAVAILABLE',
      'Não foi possível validar o armazenamento. Nenhum evento foi criado.',
      503,
    )
  }
  if (bucket.error || !bucket.data) {
    throw new UploadValidationError(
      'STORAGE_BUCKET_UNAVAILABLE',
      'Não foi possível validar o armazenamento. Nenhum evento foi criado.',
      503,
    )
  }
  checkDocumentBucketPolicy(bucket.data, files.map((file) =>
    file.security.canonicalMime.split(';')[0].trim()))
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
