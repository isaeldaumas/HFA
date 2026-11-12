import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DocumentAccessError,
  downloadAuthorizedEventDocument,
  isEventDocumentId,
  listEventDocumentManifest,
} from './event-document-access'
import { reserveDocumentExtractionQuota } from './document-extraction-gate'
import {
  extractPdfPageProvenance, PdfPageProvenanceError,
  type PdfTextPage,
} from './pdf-page-provenance'
import {
  cleanExtractedText,
  countWords,
  detectDocumentKind,
  DocumentExtractError,
  extractTextFromBuffer,
} from '../sera/document-extraction'

const MAX_PREVIEW_CHARS = 60_000
const MAX_PARSER_INPUT_BYTES = 10 * 1024 * 1024

export class EventSourcePreviewError extends Error {
  constructor(
    public readonly code:
      | 'NO_VERIFIED_HASH'
      | 'RATE_LIMIT'
      | 'RATE_LIMIT_UNAVAILABLE'
      | 'NO_TEXT'
      | 'FORMAT_MISMATCH'
      | 'PREVIEW_UNAVAILABLE'
      | 'PAGE_LIMIT'
      | 'PAGE_EXTRACTION_INCOMPLETE',
  ) {
    super(code)
    this.name = 'EventSourcePreviewError'
  }
}

export type EventSourceTextPreview = {
  documentId: string
  sourceOrdinal: number
  fileName: string
  sha256: string
  text: string
  previewChars: number
  truncated: boolean
  wordCountInPreview: number
  extractionStatus: 'TEXT_PREVIEW' | 'TEXT_PREVIEW_TRUNCATED'
  reviewedByHuman: false
  analysisChanged: false
  citationLevel: 'DOCUMENT_ONLY' | 'PDF_PAGE_INDEXED'
  pages: PdfTextPage[] | null
  totalPages: number | null
  externalProviderUsed: false
}

type Context = {
  admin: SupabaseClient
  tenantId: string
  eventId: string
  documentId: string
  authUserId: string
}

/** Only injectable from server tests; never user-controlled. */
type Dependencies = {
  reserveQuota: typeof reserveDocumentExtractionQuota
  listManifest: typeof listEventDocumentManifest
  download: typeof downloadAuthorizedEventDocument
  parse: typeof extractTextFromBuffer
  parsePdfPages?: typeof extractPdfPageProvenance
}

const defaults: Dependencies = {
  reserveQuota: reserveDocumentExtractionQuota,
  listManifest: listEventDocumentManifest,
  download: downloadAuthorizedEventDocument,
  parse: extractTextFromBuffer,
  parsePdfPages: extractPdfPageProvenance,
}

/**
 * Explicit user-triggered read-only preview. Does not persist extracted text,
 * trigger SERA classification, change narrative or produce page-level claims.
 */
export async function extractVerifiedEventSourcePreview(
  args: Context,
  dependencies: Dependencies = defaults,
): Promise<EventSourceTextPreview> {
  const { admin, tenantId, eventId, documentId, authUserId } = args
  if (!isEventDocumentId(documentId) || !isEventDocumentId(eventId)) {
    throw new DocumentAccessError('INVALID_ID')
  }
  const manifest = await dependencies.listManifest(admin, tenantId, eventId)
  const source = manifest.find((item) => item.id === documentId)
  if (!source) throw new DocumentAccessError('NOT_FOUND')
  // Legacy documents with no verifiable original hash are read-only originals,
  // but cannot qualify for the verified-extraction preview.
  if (!source.sha256 || !/^[a-f0-9]{64}$/.test(source.sha256)) {
    throw new EventSourcePreviewError('NO_VERIFIED_HASH')
  }
  const quota = await dependencies.reserveQuota(admin, authUserId)
  if (quota !== 'allowed') {
    throw new EventSourcePreviewError(
      quota === 'limited' ? 'RATE_LIMIT' : 'RATE_LIMIT_UNAVAILABLE',
    )
  }

  const original = await dependencies.download(admin, tenantId, eventId, documentId)
  if (!original.hashVerified ||
      original.bytes.byteLength < 1 ||
      original.bytes.byteLength > MAX_PARSER_INPUT_BYTES ||
      createHash('sha256').update(original.bytes).digest('hex') !== source.sha256) {
    throw new DocumentAccessError('INTEGRITY_MISMATCH')
  }
  const kind = detectDocumentKind(original.bytes)
  if ((kind !== 'pdf' && kind !== 'docx') ||
      (kind === 'pdf' && (original.mimeType !== 'application/pdf' ||
        !original.fileName.toLowerCase().endsWith('.pdf'))) ||
      (kind === 'docx' && (original.mimeType !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        !original.fileName.toLowerCase().endsWith('.docx')))) {
    throw new EventSourcePreviewError('FORMAT_MISMATCH')
  }
  let text: string
  let truncated: boolean
  let pages: PdfTextPage[] | null = null
  let totalPages: number | null = null
  if (kind === 'pdf' && dependencies.parsePdfPages) {
    // Page number comes ONLY from PDFJS page.pageNumber. An incomplete
    // multi-page extraction never receives verified page references.
    const result = await dependencies.parsePdfPages(Buffer.from(original.bytes))
    pages = result.pages
    totalPages = result.totalPages
    truncated = result.truncated
    text = cleanExtractedText(
      pages.filter((page) => page.text).map((page) =>
        '[Página ' + page.pageNumber + ']\\n' + page.text,
      ).join('\\n\\n'),
    )
  } else {
    const raw = await dependencies.parse(
      Buffer.from(original.bytes), kind, original.fileName,
    )
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new EventSourcePreviewError('NO_TEXT')
    }
    truncated = raw.length > MAX_PREVIEW_CHARS
    text = cleanExtractedText(raw.slice(0, MAX_PREVIEW_CHARS))
  }
  if (!text) throw new EventSourcePreviewError('NO_TEXT')
  return {
    documentId,
    sourceOrdinal: source.sourceOrdinal,
    fileName: original.fileName,
    sha256: source.sha256,
    text,
    previewChars: text.length,
    truncated,
    wordCountInPreview: countWords(text),
    extractionStatus: truncated ? 'TEXT_PREVIEW_TRUNCATED' : 'TEXT_PREVIEW',
    reviewedByHuman: false,
    analysisChanged: false,
    citationLevel: pages ? 'PDF_PAGE_INDEXED' : 'DOCUMENT_ONLY',
    pages,
    totalPages,
    externalProviderUsed: false,
  }
}

export function mapSourcePreviewError(error: unknown): {
  status: number
  code: string
  message: string
} {
  if (error instanceof DocumentAccessError) {
    if (error.code === 'NOT_FOUND') return {
      status: 404, code: 'NOT_FOUND', message: 'Documento ou evento não encontrado.',
    }
    if (error.code === 'INVALID_ID') return {
      status: 400, code: 'INVALID_ID', message: 'Identificador inválido.',
    }
    if (error.code === 'INTEGRITY_MISMATCH') return {
      status: 409, code: 'INTEGRITY_MISMATCH',
      message: 'A integridade do documento original não foi confirmada.',
    }
    return {
      status: 503, code: 'DOCUMENT_UNAVAILABLE',
      message: 'Documento temporariamente indisponível.',
    }
  }
  if (error instanceof EventSourcePreviewError) {
    switch (error.code) {
      case 'NO_VERIFIED_HASH':
        return { status: 409, code: error.code,
          message: 'Documento legado sem SHA-256 verificado. Extração não autorizada.' }
      case 'RATE_LIMIT':
        return { status: 429, code: error.code,
          message: 'Limite de dez tentativas de extração por hora atingido.' }
      case 'RATE_LIMIT_UNAVAILABLE':
      case 'PREVIEW_UNAVAILABLE':
        return { status: 503, code: error.code,
          message: 'Serviço de extração indisponível no momento.' }
      case 'NO_TEXT':
        return { status: 422, code: error.code,
          message: 'Nenhum texto extraível foi confirmado. OCR não está disponível.' }
      case 'FORMAT_MISMATCH':
        return { status: 422, code: error.code,
          message: 'Extensão, formato e assinatura do documento não coincidem.' }
    }
  }
  if (error instanceof PdfPageProvenanceError) {
    return {
      status: error.code === 'PAGE_LIMIT' ? 413 : 422,
      code: error.code,
      message: error.code === 'PAGE_LIMIT'
        ? 'PDF acima de 80 páginas. Divida o arquivo antes de solicitar a prévia.'
        : 'Não foi possível comprovar a leitura de todas as páginas do PDF.',
    }
  }
  if (error instanceof DocumentExtractError) {
    switch (error.code) {
      case 'PDF_NO_TEXT':
        return { status: 422, code: 'NO_TEXT',
          message: 'PDF sem texto extraível. Não houve OCR ou leitura da imagem.' }
      case 'PDF_PASSWORD':
      case 'CORRUPT':
      case 'INVALID_TYPE':
      case 'TOO_LARGE':
        return { status: 422, code: error.code,
          message: 'Documento ilegível, protegido ou incompatível.' }
      default:
        return { status: 422, code: 'PARSE_FAILED',
          message: 'Falha ao extrair texto deste documento.' }
    }
  }
  return {
    status: 503,
    code: 'PREVIEW_UNAVAILABLE',
    message: 'Não foi possível obter o texto do documento.',
  }
}
