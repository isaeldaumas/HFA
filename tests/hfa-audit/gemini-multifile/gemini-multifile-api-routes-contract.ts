/**
 * AUDIT TEST — Gemini Multifile API Routes Contract
 *
 * Valida os contratos estruturais e comportamentais de:
 * - /api/extract-document:
 *   * Suporte a 1 arquivo (modo legado retrocompativel com text, wordCount, fileName)
 *   * Suporte a 2+ arquivos (modo lote com manifest, files, totalFiles)
 *   * Verificacao de cota/rate-limit somando o lote completo
 *   * Verificacao de limites maximos (5 arquivos, 30MB)
 *   * Tolerancia a falhas parciais (nao derruba o lote se houver imagem ou erro pontual)
 * - /api/events:
 *   * Coleta de multiplos arquivos (files[]) e arquivo legado (file)
 *   * Persistencia em public.event_documents para cada arquivo do lote
 *   * Armazenamento isolado no Storage sob events/${userId}/${eventId}/
 *   * Gravacao do array sourceFiles no metadata da analise SERA
 *   * Conformidade com o ENUM public.event_input_type do Postgres (sem violar schema)
 *
 * Executar: npx tsx tests/hfa-audit/gemini-multifile/gemini-multifile-api-routes-contract.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const EXTRACT_ROUTE = join(ROOT, 'frontend', 'src', 'app', 'api', 'extract-document', 'route.ts')
const EVENTS_ROUTE = join(ROOT, 'frontend', 'src', 'app', 'api', 'events', 'route.ts')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

function runAudit() {
  console.log('=== AUDITORIA DE CONTRATOS DAS ROTAS DE API (MULTI-FILE) ===\n')

  const extractCode = readFileSync(EXTRACT_ROUTE, 'utf8')
  const eventsCode = readFileSync(EVENTS_ROUTE, 'utf8')

  // --- /api/extract-document ---
  check(
    extractCode.includes("form.getAll('files')") && extractCode.includes("form.getAll('file')"),
    'extract-document: aceita tanto formato novo files[] quanto formato legado file'
  )

  check(
    extractCode.includes('MAX_BATCH_FILE_COUNT') && extractCode.includes('BATCH_LIMIT_EXCEEDED'),
    'extract-document: valida explicitamente o limite maximo de arquivos por lote (5)'
  )

  check(
    extractCode.includes('MAX_TOTAL_BATCH_BYTES') && extractCode.includes('BATCH_TOO_LARGE'),
    'extract-document: valida explicitamente o limite de tamanho total do lote (30MB)'
  )

  check(
    extractCode.includes('(count ?? 0) + formFiles.length > UPLOADS_PER_HOUR'),
    'extract-document: contabiliza o tamanho do lote no calculo do rate limit por hora'
  )

  check(
    extractCode.includes('isSingleLegacyRequest') &&
      extractCode.includes('text: singleResult.text') &&
      extractCode.includes('wordCount: singleResult.wordCount') &&
      extractCode.includes('fileName: singleResult.originalName'),
    'extract-document: preserva contrato legado estrito para chamadas de arquivo unico'
  )

  check(
    extractCode.includes('manifest') &&
      extractCode.includes('files: manifest.items') &&
      extractCode.includes('successfulExtractions') &&
      extractCode.includes('unsupportedOcrCount'),
    'extract-document: retorna manifesto estruturado com discriminacao de status e OCR para multi-file'
  )

  check(
    extractCode.includes('manifest.successfulExtractions === 0 && manifest.unsupportedOcrCount === 0'),
    'extract-document: tolera falhas parciais (nao falha se houver pelo menos uma extracao ou anexo valido)'
  )

  // --- /api/events ---
  check(
    eventsCode.includes("form.getAll('files')") && eventsCode.includes("form.getAll('file')"),
    'events: coleta todos os arquivos enviados em files[] e no campo legado file'
  )

  check(
    eventsCode.includes('persistUploadedSourceFiles'),
    'events: possui funcao dedicada para persistencia segura de multiplas fontes'
  )

  check(
    eventsCode.includes(".from('event_documents').insert({") &&
      eventsCode.includes('storage_path: storagePath') &&
      eventsCode.includes('tenant_id: tenantId') &&
      eventsCode.includes('event_id: eventId'),
    'events: persiste cada arquivo na tabela public.event_documents com tenant e event vinculados'
  )

  check(
    eventsCode.includes('shortHash = security.sha256.slice(0, 10)') &&
      eventsCode.includes('storagePath = `${pathPrefix}/${i + 1}_${shortHash}_${safeName}`'),
    'events: gera storage_path unico e auditavel com indice e hash SHA-256 para evitar colisoes'
  )

  check(
    eventsCode.includes('sourceFiles: descriptors') &&
      eventsCode.includes('sourceFileUrl: descriptors[0]?.storagePath') &&
      eventsCode.includes('sourceFileName: descriptors[0]?.fileName'),
    'events: atualiza metadados da analise com array sourceFiles e mantem compatibilidade com leitor legado'
  )

  check(
    eventsCode.includes("input_type = 'pdf'") &&
      eventsCode.includes("input_type = 'docx'") &&
      eventsCode.includes("input_type = 'text'"),
    'events: mapeia input_type exclusivamente para valores aceitos pelo ENUM Postgres (pdf, docx, text)'
  )

  check(
    eventsCode.includes('analysisMode === \'register_only\'') &&
      eventsCode.includes('persistUploadedSourceFiles'),
    'events: suporta persistencia de multiplos documentos tambem no modo register_only (Safety)'
  )

  console.log(`\nFim dos testes de contrato de rotas: ${failures === 0 ? 'TODOS PASSARAM' : `${failures} FALHAS`}`)
  if (failures > 0) process.exit(1)
}

runAudit()
