/**
 * Runner principal da suite de testes de auditoria para Upload Multiplo (Issue #122)
 * Executado pelo AGENTE GEMINI 2.
 *
 * Executar: npx tsx tests/hfa-audit/gemini-multifile/run.ts
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const DIR = __dirname

const testSuites = [
  {
    name: 'Segurança, MIME, Path Traversal e Extração',
    file: join(DIR, 'gemini-multifile-security-and-extraction-contract.ts'),
  },
  {
    name: 'Contratos das Rotas de API (/api/extract-document e /api/events)',
    file: join(DIR, 'gemini-multifile-api-routes-contract.ts'),
  },
  {
    name: 'Contratos da Interface UI (DocumentUpload e /events/new)',
    file: join(DIR, 'gemini-multifile-ui-contract.ts'),
  },
]

console.log('===============================================================')
console.log(' HFA — SUÍTE DE TESTES EXECUTÁVEIS DO AGENTE GEMINI 2')
console.log(' Escopo: Issue #122 — Upload Múltiplo e Proveniência por Arquivo')
console.log('===============================================================\n')

let anyFailed = false

for (const suite of testSuites) {
  console.log(`\n▶ Executando: ${suite.name}...`)
  const result = spawnSync('npx', ['tsx', suite.file], {
    stdio: 'inherit',
    cwd: DIR,
    env: process.env,
  })

  if (result.status !== 0) {
    anyFailed = true
    console.error(`❌ Falha na suíte: ${suite.name}`)
  } else {
    console.log(`✅ Suíte concluída com sucesso: ${suite.name}`)
  }
}

console.log('\n===============================================================')
if (anyFailed) {
  console.error('RESULTADO: FALHA EM UMA OU MAIS SUÍTES')
  process.exit(1)
} else {
  console.log('RESULTADO GERAL: TODAS AS 3 SUÍTES PASSARAM COM SUCESSO')
  console.log('===============================================================')
}
