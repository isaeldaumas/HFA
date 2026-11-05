/**
 * Contratos e tipos para upload de multiplas fontes e proveniencia por arquivo.
 * Atende a issue #122 no escopo do AGENTE GEMINI 2.
 */

export type SupportedDocumentKind = 'pdf' | 'docx' | 'txt' | 'jpeg' | 'png' | 'webp' | 'unknown'

export type MultiFileExtractionStatus =
  | 'extracted'
  | 'unsupported_ocr'
  | 'stored_unprocessed'
  | 'corrupt'
  | 'password_protected'
  | 'invalid_type'
  | 'too_large'
  | 'mime_spoofing'
  | 'parse_failed'

export const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_TOTAL_BATCH_BYTES = 30 * 1024 * 1024 // 30 MB
export const MAX_BATCH_FILE_COUNT = 5 // Maximo de 5 arquivos por evento

export interface MultiFileItemResult {
  id: string
  originalName: string
  sanitizedName: string
  clientMimeType: string
  detectedKind: SupportedDocumentKind
  sizeBytes: number
  sha256: string
  status: MultiFileExtractionStatus
  text: string
  wordCount: number
  warningOrError?: string
  isOcrPending?: boolean
}

export interface MultiFileManifest {
  totalFiles: number
  successfulExtractions: number
  unsupportedOcrCount: number
  failedFilesCount: number
  totalSizeBytes: number
  totalWordCount: number
  items: MultiFileItemResult[]
  combinedText: string
}

export interface StoredDocumentDescriptor {
  fileName: string
  sanitizedName: string
  storagePath: string
  mimeType: string | null
  sizeBytes: number
  sha256: string
  status: MultiFileExtractionStatus
  wordCount: number
}
