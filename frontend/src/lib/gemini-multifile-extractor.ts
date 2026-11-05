import mammoth from 'mammoth'
// @ts-expect-error No typings for this forked package
import PDFParse from 'pdf-parse-fork'
import {
  cleanExtractedText,
  countWords,
} from '@/lib/sera/document-extraction'
import {
  MultiFileItemResult,
  MultiFileManifest,
} from './gemini-multifile-types'
import {
  validateBatchLimits,
  validateFileSecurity,
} from './gemini-multifile-security'

export const OCR_UNSUPPORTED_NOTICE =
  'EXTRAÇÃO NÃO VERIFICADA: OCR de imagens não está implementado no extrator atual (planejado para fase 2). Arquivo anexado e preservado como evidência documental.'

/**
 * Processa a extracao textual e auditoria de seguranca de um unico arquivo.
 * Garante que imagens nunca declarem falsamente OCR disponivel.
 */
export async function extractSingleFile(file: {
  name: string
  size: number
  buffer: Buffer
  declaredMime?: string
}): Promise<MultiFileItemResult> {
  const security = validateFileSecurity(file)
  const id = `doc_${security.sha256.slice(0, 12)}_${Date.now()}`

  if (!security.valid) {
    return {
      id,
      originalName: file.name,
      sanitizedName: security.sanitizedName,
      clientMimeType: file.declaredMime || security.canonicalMime,
      detectedKind: security.detectedKind,
      sizeBytes: file.size,
      sha256: security.sha256,
      status: security.status,
      text: '',
      wordCount: 0,
      warningOrError: security.error,
    }
  }

  // Tratamento especifico por tipo
  switch (security.detectedKind) {
    case 'pdf': {
      try {
        const result = await PDFParse(file.buffer)
        const raw = (result?.text || '').trim()
        if (!raw || raw.length < 25) {
          return {
            id,
            originalName: file.name,
            sanitizedName: security.sanitizedName,
            clientMimeType: security.canonicalMime,
            detectedKind: 'pdf',
            sizeBytes: file.size,
            sha256: security.sha256,
            status: 'corrupt',
            text: '',
            wordCount: 0,
            warningOrError:
              'Este PDF contém apenas imagens digitalizadas sem camada de texto extraível ou está vazio.',
          }
        }
        const text = cleanExtractedText(raw)
        const wordCount = countWords(text)
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'pdf',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'extracted',
          text,
          wordCount,
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message.toLowerCase() : ''
        if (msg.includes('password') || msg.includes('encrypt')) {
          return {
            id,
            originalName: file.name,
            sanitizedName: security.sanitizedName,
            clientMimeType: security.canonicalMime,
            detectedKind: 'pdf',
            sizeBytes: file.size,
            sha256: security.sha256,
            status: 'password_protected',
            text: '',
            wordCount: 0,
            warningOrError: 'Este PDF está protegido por senha. Remova a senha antes do envio.',
          }
        }
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'pdf',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'parse_failed',
          text: '',
          wordCount: 0,
          warningOrError: 'Não foi possível processar o PDF. Verifique se o arquivo está corrompido.',
        }
      }
    }

    case 'docx': {
      try {
        const { value } = await mammoth.extractRawText({ buffer: file.buffer })
        const text = cleanExtractedText(value || '')
        const wordCount = countWords(text)
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'docx',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'extracted',
          text,
          wordCount,
        }
      } catch {
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'docx',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'corrupt',
          text: '',
          wordCount: 0,
          warningOrError: 'Não foi possível ler o documento DOCX. Verifique se está corrompido.',
        }
      }
    }

    case 'txt': {
      try {
        const raw = file.buffer.toString('utf8')
        const text = cleanExtractedText(raw)
        const wordCount = countWords(text)
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'txt',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'extracted',
          text,
          wordCount,
        }
      } catch {
        return {
          id,
          originalName: file.name,
          sanitizedName: security.sanitizedName,
          clientMimeType: security.canonicalMime,
          detectedKind: 'txt',
          sizeBytes: file.size,
          sha256: security.sha256,
          status: 'parse_failed',
          text: '',
          wordCount: 0,
          warningOrError: 'Falha ao decodificar arquivo TXT em UTF-8.',
        }
      }
    }

    case 'jpeg':
    case 'png':
    case 'webp': {
      // NÃO declara OCR falso. Preserva o arquivo como anexo documental de evidência.
      return {
        id,
        originalName: file.name,
        sanitizedName: security.sanitizedName,
        clientMimeType: security.canonicalMime,
        detectedKind: security.detectedKind,
        sizeBytes: file.size,
        sha256: security.sha256,
        status: 'unsupported_ocr',
        text: '',
        wordCount: 0,
        warningOrError: OCR_UNSUPPORTED_NOTICE,
        isOcrPending: true,
      }
    }

    default: {
      return {
        id,
        originalName: file.name,
        sanitizedName: security.sanitizedName,
        clientMimeType: 'application/octet-stream',
        detectedKind: 'unknown',
        sizeBytes: file.size,
        sha256: security.sha256,
        status: 'invalid_type',
        text: '',
        wordCount: 0,
        warningOrError: 'Tipo de arquivo não reconhecido.',
      }
    }
  }
}

/**
 * Monta o relato composto a partir das multiplas fontes, identificando claramente
 * a proveniencia, metadados e estado de cada arquivo individual.
 */
export function composeMultiFileNarrative(items: MultiFileItemResult[]): string {
  if (!items || items.length === 0) return ''

  // Se houver apenas 1 arquivo com texto extraido, mantem formato direto e limpo
  if (items.length === 1) {
    if (items[0].status === 'extracted') {
      return items[0].text
    }
    if (items[0].status === 'unsupported_ocr') {
      return `[ANEXO DOCUMENTAL: ${items[0].sanitizedName} (SHA-256: ${items[0].sha256.slice(0, 16)}) - Extração de texto não verificada (OCR pendente). Digite o relato da ocorrência manualmente.]`
    }
    return ''
  }

  // Composicao estruturada de multiplas fontes com demarcadores claros
  const parts: string[] = []
  items.forEach((item, idx) => {
    const num = idx + 1
    const shortHash = item.sha256.slice(0, 16)
    if (item.status === 'extracted') {
      parts.push(
        `=== FONTE ${num}: ${item.sanitizedName} (${item.wordCount} palavras, SHA-256: ${shortHash}) ===\n${item.text}`
      )
    } else if (item.status === 'unsupported_ocr') {
      parts.push(
        `=== FONTE ${num}: ${item.sanitizedName} (EVIDÊNCIA VISUAL ANEXADA - OCR NÃO SUPORTADO, SHA-256: ${shortHash}) ===\n[Arquivo anexado ao evento como evidência documental. O extrator não realiza OCR automático nesta fase.]`
      )
    } else {
      parts.push(
        `=== FONTE ${num}: ${item.sanitizedName} (FALHA NA EXTRAÇÃO: ${item.status.toUpperCase()}, SHA-256: ${shortHash}) ===\n[Aviso: ${item.warningOrError || 'Não foi possível extrair texto desta fonte.'}]`
      )
    }
  })

  return parts.join('\n\n')
}

/**
 * Processa um lote de arquivos, aplicando verificacao de limites de lote,
 * extracao individual concorrente e consolidacao do manifesto de proveniencia.
 */
export async function processBatchFiles(
  files: Array<{
    name: string
    size: number
    buffer: Buffer
    declaredMime?: string
  }>
): Promise<{
  manifest?: MultiFileManifest
  batchError?: string
}> {
  const batchLimits = validateBatchLimits(files)
  if (!batchLimits.valid) {
    return { batchError: batchLimits.error }
  }

  const items = await Promise.all(files.map(extractSingleFile))

  const successfulExtractions = items.filter((i) => i.status === 'extracted').length
  const unsupportedOcrCount = items.filter((i) => i.status === 'unsupported_ocr').length
  const failedFilesCount = items.filter(
    (i) => i.status !== 'extracted' && i.status !== 'unsupported_ocr'
  ).length

  const totalSizeBytes = items.reduce((acc, i) => acc + i.sizeBytes, 0)
  const totalWordCount = items.reduce((acc, i) => acc + i.wordCount, 0)
  const combinedText = composeMultiFileNarrative(items)

  return {
    manifest: {
      totalFiles: items.length,
      successfulExtractions,
      unsupportedOcrCount,
      failedFilesCount,
      totalSizeBytes,
      totalWordCount,
      items,
      combinedText,
    },
  }
}
