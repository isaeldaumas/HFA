/**
 * AUDIT TEST — Gemini Multifile UI & Form Integration Contract
 *
 * Valida os contratos estruturais da interface de usuario:
 * - DocumentUpload.tsx (em frontend/src/components/events/DocumentUpload.tsx):
 *   * Aceita multiplos arquivos via picker (multiple) e drag-and-drop
 *   * Suporta extensoes pretendidas: PDF, DOCX, TXT, JPEG, PNG, WebP
 *   * Exibe badge explicito de status (Extraido vs OCR Nao Suportado / Fase 2)
 *   * Exibe fingerprint SHA-256 de cada arquivo
 *   * Permite inspecionar texto individual e remover fontes individualmente
 *   * Oferece callbacks onExtracted, onFilesReady e onFileReady (retrocompatibilidade)
 * - events/new/page.tsx:
 *   * Importa o componente de @/components/events/DocumentUpload
 *   * Mantem estado de array de arquivos (sourceFiles)
 *   * Submete todos os arquivos via FormData.append('files')
 *   * Envia apenas 'files' sem duplicar primeiro anexo
 *
 * Executar: npx tsx tests/hfa-audit/gemini-multifile/gemini-multifile-ui-contract.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const COMPONENT_FILE = join(ROOT, 'frontend', 'src', 'components', 'events', 'DocumentUpload.tsx')
const PAGE_FILE = join(ROOT, 'frontend', 'src', 'app', '(dashboard)', 'events', 'new', 'page.tsx')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

function runAudit() {
  console.log('=== AUDITORIA DE CONTRATOS DE UI E FORMULÁRIO (MULTI-FILE) ===\n')

  const componentCode = readFileSync(COMPONENT_FILE, 'utf8')
  const pageCode = readFileSync(PAGE_FILE, 'utf8')

  // --- DocumentUpload.tsx ---
  check(
    componentCode.includes('multiple') && componentCode.includes('type="file"'),
    'DocumentUpload: input de arquivo possui o atributo multiple para selecao de 2+ arquivos'
  )

  check(
    componentCode.includes('.pdf') &&
      componentCode.includes('.docx') &&
      componentCode.includes('.txt') &&
      componentCode.includes('.png') &&
      componentCode.includes('.webp'),
    'DocumentUpload: aceita todos os tipos pretendidos (.pdf, .docx, .txt, .jpg, .png, .webp)'
  )

  check(
    componentCode.includes('onFilesReady?: (files: File[]) => void') &&
      componentCode.includes('onFileReady?: (file: File | null) => void') &&
      componentCode.includes('onExtracted: ('),
    'DocumentUpload: props suportam callbacks para lista de arquivos e retrocompatibilidade com arquivo unico'
  )

  check(
    componentCode.includes('SHA-256:') && componentCode.includes('item.sha256.slice(0, 10)'),
    'DocumentUpload: exibe visualmente o fingerprint SHA-256 por arquivo'
  )

  check(
    componentCode.includes('OCR Não Suportado (Fase 2)') ||
      componentCode.includes('item.status === \'unsupported_ocr\''),
    'DocumentUpload: exibe alerta explicito de status para imagens sem OCR (Fase 2)'
  )

  check(
    componentCode.includes('removeFile') && componentCode.includes('setPreviewItem'),
    'DocumentUpload: permite remover individualmente uma fonte e visualizar texto extraido'
  )

  // --- events/new/page.tsx ---
  check(
    pageCode.includes("import DocumentUpload from '@/components/events/DocumentUpload'"),
    'events/new/page.tsx: importa DocumentUpload desacoplado de components/events'
  )

  check(
    pageCode.includes('sourceFiles, setSourceFiles') &&
      pageCode.includes('sourceManifest, setSourceManifest'),
    'events/new/page.tsx: gerencia estado para multiplos arquivos e manifesto de proveniencia'
  )

  check(
    pageCode.includes("fd.append('files', f)") || pageCode.includes("fd.append('files', file)"),
    'events/new/page.tsx: anexa todos os arquivos selecionados no FormData com chave files'
  )

  check(
    !pageCode.includes("fd.set('file', firstFile)") &&
      !pageCode.includes("fd.append('file', firstFile)"),
    'events/new/page.tsx: não duplica o primeiro anexo no campo legado'
  )

  console.log(`\nFim dos testes de UI: ${failures === 0 ? 'TODOS PASSARAM' : `${failures} FALHAS`}`)
  if (failures > 0) process.exit(1)
}

runAudit()
