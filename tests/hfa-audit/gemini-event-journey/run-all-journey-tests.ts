/**
 * ORQUESTRADOR GLOBAL DE TESTES DA JORNADA DE EVENTOS E ANÁLISE HFA
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Executar: NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/run-all-journey-tests.ts
 */

import { runRegistrationTests } from './01-event-registration.test'
import { runDocumentExtractionTests } from './02-document-extraction.test'
import { runDuplicateTests } from './03-duplicate-detection.test'
import { runTenantIsolationTests } from './04-tenant-isolation.test'
import { runPartialFailureTests } from './05-partial-failure-resilience.test'
import { runGovernanceTests } from './06-governance-and-completion-lock.test'

export async function runAllJourneyAuditTests() {
  console.log('======================================================================')
  console.log('  HFA AUDIT: JORNADA MÍNIMA DE REGISTRO E ANÁLISE DE EVENTOS')
  console.log('  AGENTE GEMINI 1 — CONVERSA 1 (Data: 05/11/2026)')
  console.log('======================================================================')

  const start = Date.now()
  let totalPassed = 0
  let totalFailed = 0

  const s1 = await runRegistrationTests()
  totalPassed += s1.passed
  totalFailed += s1.failed

  const s2 = await runDocumentExtractionTests()
  totalPassed += s2.passed
  totalFailed += s2.failed

  const s3 = await runDuplicateTests()
  totalPassed += s3.passed
  totalFailed += s3.failed

  const s4 = await runTenantIsolationTests()
  totalPassed += s4.passed
  totalFailed += s4.failed

  const s5 = await runPartialFailureTests()
  totalPassed += s5.passed
  totalFailed += s5.failed

  const s6 = await runGovernanceTests()
  totalPassed += s6.passed
  totalFailed += s6.failed

  const elapsed = ((Date.now() - start) / 1000).toFixed(2)

  console.log('======================================================================')
  console.log('  RESUMO CONSOLIDADO DA AUDITORIA EXECUTÁVEL')
  console.log('======================================================================')
  console.log(`  Total de testes executados : ${totalPassed + totalFailed}`)
  console.log(`  Testes com sucesso (PASS)  : ${totalPassed}`)
  console.log(`  Testes com falha   (FAIL)  : ${totalFailed}`)
  console.log(`  Tempo total de execução    : ${elapsed}s`)
  console.log('======================================================================')

  if (totalFailed > 0) {
    console.error(`\n❌ AUDITORIA FALHOU com ${totalFailed} erro(s).`)
    process.exit(1)
  } else {
    console.log('\n✅ TODAS AS SUÍTES DA JORNADA PASSARAM COM SUCESSO.')
  }
}

if (process.argv[1]?.endsWith('run-all-journey-tests.ts')) {
  runAllJourneyAuditTests()
}
