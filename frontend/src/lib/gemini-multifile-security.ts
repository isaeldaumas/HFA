import { createHash } from 'node:crypto'
import {
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BATCH_BYTES,
  MAX_BATCH_FILE_COUNT,
  SupportedDocumentKind,
  MultiFileExtractionStatus,
} from './gemini-multifile-types'

/**
 * Remove sequencias perigosas de path traversal, caracteres de controle
 * e normaliza o nome do arquivo para armazenamento seguro.
 */
export function sanitizeFileName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return 'anexo_sem_nome'

  // Remove caracteres de controle e nulos
  let name = rawName.replace(/[\x00-\x1f\x7f]/g, '').trim()

  // Remove caminhos relativos ou absolutos (Unix e Windows)
  name = name.replace(/\\/g, '/').split('/').pop() || 'anexo'

  // Remove tentativas de directory traversal repetidas tipo "../" ou "..\"
  name = name.replace(/\.{2,}/g, '.')

  // Substitui caracteres nao alfanumericos exceto ponto, traco e underline
  name = name.replace(/[^a-zA-Z0-9.\-_]/g, '_')

  // Evita arquivo oculto comecando com ponto
  if (name.startsWith('.')) {
    name = `arquivo_${name}`
  }

  // Limita tamanho total preservando a extensao se houver
  if (name.length > 150) {
    const extIndex = name.lastIndexOf('.')
    if (extIndex > 0 && extIndex > name.length - 15) {
      const ext = name.slice(extIndex)
      const base = name.slice(0, 150 - ext.length)
      name = `${base}${ext}`
    } else {
      name = name.slice(0, 150)
    }
  }

  return name || 'anexo_valido'
}

/**
 * Calcula impressao digital criptografica SHA-256 do arquivo.
 */
export function computeSha256(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Inspeciona os magic bytes (assinatura binaria) do buffer para determinar
 * o tipo real do documento, protegendo contra MIME spoofing.
 */
export function detectBufferKind(buffer: Buffer): {
  kind: SupportedDocumentKind
  canonicalMime: string
} | null {
  if (!buffer || buffer.length === 0) return null

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { kind: 'pdf', canonicalMime: 'application/pdf' }
  }

  // DOCX: ZIP container PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
    (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
  ) {
    return {
      kind: 'docx',
      canonicalMime:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  }

  // PNG: 0x89 P N G \r \n 0x1A \n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { kind: 'png', canonicalMime: 'image/png' }
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { kind: 'jpeg', canonicalMime: 'image/jpeg' }
  }

  // WebP: RIFF....WEBP (0x52 0x49 0x46 0x46 .... 0x57 0x45 0x42 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { kind: 'webp', canonicalMime: 'image/webp' }
  }

  // TXT (UTF-8 sem caracteres binarios nulos):
  if (isUtf8Text(buffer)) {
    return { kind: 'txt', canonicalMime: 'text/plain; charset=utf-8' }
  }

  return null
}

/**
 * Verifica se um buffer e texto UTF-8 valido e nao contem bytes nulos binarios.
 */
function isUtf8Text(buf: Buffer): boolean {
  if (buf.length === 0) return true
  let text: string
  try {
    // Buffer.toString silently replaces malformed UTF-8. Fatal decoding
    // prevents binary payloads from being misclassified as TXT.
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return false
  }
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      || (code >= 0x7f && code <= 0x9f)) {
      return false
    }
  }
  return true
}

export interface FileSecurityCheckResult {
  valid: boolean
  status: MultiFileExtractionStatus
  sanitizedName: string
  sha256: string
  detectedKind: SupportedDocumentKind
  canonicalMime: string
  error?: string
}

/**
 * Valida integridade, tamanho, nome e detecta spoofing MIME.
 */
export function validateFileSecurity(
  file: { name: string; size: number; buffer: Buffer; declaredMime?: string }
): FileSecurityCheckResult {
  const sanitizedName = sanitizeFileName(file.name)
  const sha256 = computeSha256(file.buffer)

  if (file.size > MAX_SINGLE_FILE_BYTES) {
    return {
      valid: false,
      status: 'too_large',
      sanitizedName,
      sha256,
      detectedKind: 'unknown',
      canonicalMime: 'application/octet-stream',
      error: `O arquivo ${sanitizedName} (${(file.size / (1024 * 1024)).toFixed(1)}MB) ultrapassa o limite individual de 10MB`,
    }
  }

  if (file.buffer.length === 0) {
    return {
      valid: false,
      status: 'corrupt',
      sanitizedName,
      sha256,
      detectedKind: 'unknown',
      canonicalMime: 'application/octet-stream',
      error: `O arquivo ${sanitizedName} esta vazio (0 bytes)`,
    }
  }

  const detection = detectBufferKind(file.buffer)
  if (!detection) {
    return {
      valid: false,
      status: 'invalid_type',
      sanitizedName,
      sha256,
      detectedKind: 'unknown',
      canonicalMime: 'application/octet-stream',
      error: `Tipo nao suportado para ${sanitizedName}. Tipos aceitos: PDF, DOCX, TXT, JPEG, PNG, WebP`,
    }
  }

  // Verificacao contra spoofing de extensao / MIME
  const lowerName = file.name.toLowerCase()
  const expectedExts: Record<SupportedDocumentKind, string[]> = {
    pdf: ['.pdf'],
    docx: ['.docx'],
    txt: ['.txt', '.text', '.log', '.csv'],
    jpeg: ['.jpg', '.jpeg'],
    png: ['.png'],
    webp: ['.webp'],
    unknown: [],
  }

  const exts = expectedExts[detection.kind]
  const hasMatchingExt = exts.some((ext) => lowerName.endsWith(ext))

  if (!hasMatchingExt) {
    // Alerta de extensao inconsistente com o conteudo real do arquivo
    return {
      valid: false,
      status: 'mime_spoofing',
      sanitizedName,
      sha256,
      detectedKind: detection.kind,
      canonicalMime: detection.canonicalMime,
      error: `Possivel adulteracao detectada (spoofing): o arquivo ${sanitizedName} nao corresponde a extensao declarada para o formato detectado (${detection.kind.toUpperCase()}).`,
    }
  }

  return {
    valid: true,
    status: detection.kind === 'jpeg' || detection.kind === 'png' || detection.kind === 'webp'
      ? 'unsupported_ocr'
      : 'extracted',
    sanitizedName,
    sha256,
    detectedKind: detection.kind,
    canonicalMime: detection.canonicalMime,
  }
}

/**
 * Valida se um lote de arquivos respeita o limite de quantidade e tamanho total.
 */
export function validateBatchLimits(files: Array<{ size: number }>): {
  valid: boolean
  error?: string
} {
  if (files.length > MAX_BATCH_FILE_COUNT) {
    return {
      valid: false,
      error: `Limite de arquivos excedido: maximo de ${MAX_BATCH_FILE_COUNT} arquivos por evento (enviados: ${files.length}).`,
    }
  }

  const totalBytes = files.reduce((acc, f) => acc + f.size, 0)
  if (totalBytes > MAX_TOTAL_BATCH_BYTES) {
    return {
      valid: false,
      error: `Tamanho total do lote ultrapassa 30MB (${(totalBytes / (1024 * 1024)).toFixed(1)}MB). Reduza o tamanho ou numero de arquivos.`,
    }
  }

  return { valid: true }
}
