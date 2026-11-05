/**
 * AUDIT TEST — Gemini Multifile Security & Extraction Contract
 *
 * Valida:
 * - Sanitizacao de nomes e protecao contra path traversal (../, ..\, null bytes)
 * - Calculo deterministico de hash SHA-256 por arquivo
 * - Deteccao de tipos reais por magic bytes (PDF, DOCX, TXT, JPEG, PNG, WebP)
 * - Deteccao de MIME spoofing (extensao incompativel com assinatura binaria)
 * - Limites por arquivo (10MB) e limites de lote (5 arquivos, 30MB)
 * - Extracao real de texto (TXT, PDF)
 * - Comportamento explicito para imagens (JPEG, PNG, WebP): NAO SUPORTADO / OCR PENDENTE FASE 2
 * - Tolerancia a falhas parciais (arquivos validos mantidos na presenca de invalidos)
 * - Composicao estruturada do relato factual com proveniencia e hashes
 *
 * Executar: npx tsx tests/hfa-audit/gemini-multifile/gemini-multifile-security-and-extraction-contract.ts
 */

import {
  sanitizeFileName,
  computeSha256,
  detectBufferKind,
  validateFileSecurity,
  validateBatchLimits,
} from '../../../frontend/src/lib/gemini-multifile-security'
import {
  extractSingleFile,
  processBatchFiles,
  composeMultiFileNarrative,
  OCR_UNSUPPORTED_NOTICE,
} from '../../../frontend/src/lib/gemini-multifile-extractor'
import {
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BATCH_BYTES,
  MAX_BATCH_FILE_COUNT,
  MultiFileItemResult,
} from '../../../frontend/src/lib/gemini-multifile-types'

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

async function runTests() {
  console.log('=== TESTES DE SEGURANÇA E EXTRAÇÃO MULTI-FILE ===\n')

  // 1. Sanitizacao contra Path Traversal e Injeção
  const dirty1 = '../../../../etc/passwd'
  const sanitized1 = sanitizeFileName(dirty1)
  check(
    !sanitized1.includes('/') && !sanitized1.includes('..') && sanitized1 === 'passwd',
    'sanitizeFileName: bloqueia path traversal Unix (../../../../etc/passwd)'
  )

  const dirty2 = '..\\..\\windows\\system32\\cmd.exe'
  const sanitized2 = sanitizeFileName(dirty2)
  check(
    !sanitized2.includes('\\') && !sanitized2.includes('..') && sanitized2 === 'cmd.exe',
    'sanitizeFileName: bloqueia path traversal Windows (..\\..\\windows\\system32\\cmd.exe)'
  )

  const dirty3 = 'relatorio\x00_malicioso.pdf'
  const sanitized3 = sanitizeFileName(dirty3)
  check(
    !sanitized3.includes('\x00') && sanitized3 === 'relatorio_malicioso.pdf',
    'sanitizeFileName: remove caracteres nulos binarios e de controle'
  )

  const dirty4 = '.arquivo_oculto.txt'
  const sanitized4 = sanitizeFileName(dirty4)
  check(
    !sanitized4.startsWith('.'),
    'sanitizeFileName: evita criacao de arquivos ocultos iniciados com ponto'
  )

  // 2. Hash SHA-256 Deterministico
  const bufA = Buffer.from('Relato de teste da ocorrencia aeronautica no pouso', 'utf8')
  const shaA1 = computeSha256(bufA)
  const shaA2 = computeSha256(bufA)
  check(shaA1 === shaA2 && shaA1.length === 64, 'computeSha256: gera fingerprint SHA-256 valido e reproduzivel')

  // 3. Deteccao por Magic Bytes
  const pdfMagic = Buffer.from('%PDF-1.4\n%teste', 'utf8')
  const pdfKind = detectBufferKind(pdfMagic)
  check(pdfKind?.kind === 'pdf', 'detectBufferKind: detecta PDF autentico via magic bytes %PDF')

  const docxMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
  const docxKind = detectBufferKind(docxMagic)
  check(docxKind?.kind === 'docx', 'detectBufferKind: detecta DOCX autentico via assinatura PK zip')

  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  const pngKind = detectBufferKind(pngMagic)
  check(pngKind?.kind === 'png', 'detectBufferKind: detecta PNG autentico via magic bytes 0x89PNG')

  const jpegMagic = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
  const jpegKind = detectBufferKind(jpegMagic)
  check(jpegKind?.kind === 'jpeg', 'detectBufferKind: detecta JPEG autentico via magic bytes 0xFFD8FF')

  const webpMagic = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // length
    0x57, 0x45, 0x42, 0x50, // WEBP
  ])
  const webpKind = detectBufferKind(webpMagic)
  check(webpKind?.kind === 'webp', 'detectBufferKind: detecta WebP autentico via RIFF....WEBP')

  const txtBuf = Buffer.from('Relato operacional de voo em UTF-8 sem bytes nulos', 'utf8')
  const txtKind = detectBufferKind(txtBuf)
  check(txtKind?.kind === 'txt', 'detectBufferKind: detecta TXT UTF-8 sem bytes nulos')

  // 4. Detecção de MIME Spoofing
  // Arquivo com nome .pdf mas conteudo e imagem PNG
  const spoofedPdf = validateFileSecurity({
    name: 'documento_falso.pdf',
    size: pngMagic.length,
    buffer: pngMagic,
    declaredMime: 'application/pdf',
  })
  check(
    !spoofedPdf.valid && spoofedPdf.status === 'mime_spoofing',
    'validateFileSecurity: detecta e rejeita MIME spoofing (.pdf com conteudo PNG)'
  )

  // Arquivo com nome .docx mas conteudo e texto simples
  const spoofedDocx = validateFileSecurity({
    name: 'relatorio.docx',
    size: txtBuf.length,
    buffer: txtBuf,
    declaredMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  check(
    !spoofedDocx.valid && spoofedDocx.status === 'mime_spoofing',
    'validateFileSecurity: detecta e rejeita MIME spoofing (.docx com conteudo TXT)'
  )

  // 5. Limites de Tamanho e Lote
  const tooLargeFile = validateFileSecurity({
    name: 'arquivo_enorme.pdf',
    size: MAX_SINGLE_FILE_BYTES + 1,
    buffer: Buffer.alloc(100),
  })
  check(
    !tooLargeFile.valid && tooLargeFile.status === 'too_large',
    'validateFileSecurity: rejeita arquivo acima de 10MB'
  )

  const emptyFile = validateFileSecurity({
    name: 'arquivo_vazio.pdf',
    size: 0,
    buffer: Buffer.alloc(0),
  })
  check(
    !emptyFile.valid && emptyFile.status === 'corrupt',
    'validateFileSecurity: detecta arquivo vazio (0 bytes) como corrupt'
  )

  const batchCountExceeded = validateBatchLimits(new Array(MAX_BATCH_FILE_COUNT + 1).fill({ size: 1000 }))
  check(
    !batchCountExceeded.valid && (batchCountExceeded.error?.includes('Limite de arquivos') ?? false),
    'validateBatchLimits: rejeita lote com mais de 5 arquivos'
  )

  const batchBytesExceeded = validateBatchLimits([
    { size: 15 * 1024 * 1024 },
    { size: 16 * 1024 * 1024 },
  ])
  check(
    !batchBytesExceeded.valid && (batchBytesExceeded.error?.includes('30MB') ?? false),
    'validateBatchLimits: rejeita lote total acima de 30MB'
  )

  // 6. Extracao de Texto Real para TXT
  const sampleNarrative = 'Durante a aproximação final para a pista 15, a aeronave encontrou tesoura de vento severa com perda de sustentação.'
  const txtResult = await extractSingleFile({
    name: 'relato_piloto.txt',
    size: Buffer.byteLength(sampleNarrative),
    buffer: Buffer.from(sampleNarrative, 'utf8'),
  })
  check(
    txtResult.status === 'extracted' &&
      txtResult.text.includes('tesoura de vento') &&
      txtResult.wordCount > 10,
    'extractSingleFile: extrai texto real e calcula contagem de palavras de arquivo TXT'
  )

  // 7. Não-Confusão de Extração de Imagem com OCR
  const imageResult = await extractSingleFile({
    name: 'foto_painel.png',
    size: pngMagic.length,
    buffer: pngMagic,
    declaredMime: 'image/png',
  })
  check(
    imageResult.status === 'unsupported_ocr' &&
      imageResult.text === '' &&
      imageResult.wordCount === 0 &&
      imageResult.isOcrPending === true &&
      (imageResult.warningOrError?.includes('EXTRAÇÃO NÃO VERIFICADA') ?? false),
    'extractSingleFile: imagens retornam unsupported_ocr SEM declarar falsamente OCR disponivel'
  )

  // 8. Tolerância a Falha Parcial no Lote
  const batchResult = await processBatchFiles([
    {
      name: 'narrativa_oficial.txt',
      size: Buffer.byteLength(sampleNarrative),
      buffer: Buffer.from(sampleNarrative, 'utf8'),
    },
    {
      name: 'foto_evidencia.png',
      size: pngMagic.length,
      buffer: pngMagic,
    },
    {
      name: 'arquivo_falso.pdf',
      size: pngMagic.length,
      buffer: pngMagic, // spoofing proposital
    },
  ])

  check(
    batchResult.manifest?.totalFiles === 3 &&
      batchResult.manifest.successfulExtractions === 1 &&
      batchResult.manifest.unsupportedOcrCount === 1 &&
      batchResult.manifest.failedFilesCount === 1,
    'processBatchFiles: falha parcial tolera arquivo invalido e preserva fontes validas e anexos'
  )

  // 9. Composição Estruturada de Múltiplas Fontes
  const mockItems: MultiFileItemResult[] = [
    {
      id: 'doc1',
      originalName: 'relatorio.pdf',
      sanitizedName: 'relatorio.pdf',
      clientMimeType: 'application/pdf',
      detectedKind: 'pdf',
      sizeBytes: 15000,
      sha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
      status: 'extracted',
      text: 'Texto do relatório técnico do CENIPA.',
      wordCount: 6,
    },
    {
      id: 'doc2',
      originalName: 'foto_cockpit.jpg',
      sanitizedName: 'foto_cockpit.jpg',
      clientMimeType: 'image/jpeg',
      detectedKind: 'jpeg',
      sizeBytes: 45000,
      sha256: '9988776655440000000000000000000000000000000000000000000000000000',
      status: 'unsupported_ocr',
      text: '',
      wordCount: 0,
      isOcrPending: true,
    },
  ]

  const composite = composeMultiFileNarrative(mockItems)
  check(
    composite.includes('=== FONTE 1: relatorio.pdf') &&
      composite.includes('SHA-256: a1b2c3d4e5f6') &&
      composite.includes('=== FONTE 2: foto_cockpit.jpg') &&
      composite.includes('OCR NÃO SUPORTADO'),
    'composeMultiFileNarrative: compõe narrativa estruturada com proveniência e integridade claras'
  )

  console.log(`\nFim dos testes de segurança: ${failures === 0 ? 'TODOS PASSARAM' : `${failures} FALHAS`}`)
  if (failures > 0) process.exit(1)
}

runTests().catch((e) => {
  console.error('Erro inesperado no teste:', e)
  process.exit(1)
})
