// AUDIT TEST — não faz parte do manifesto oficial.
// Contrato estático: as funções ERC "MOTOR_HEURISTIC_V1" marcadas DEPRECATED não podem ser
// religadas a nenhuma tela/rota fora da própria definição, sem passar pela contenção
// (erc-containment.ts). Falha se alguém reintroduzir o F-04 (mecanismos misturados).
// Executar: npx tsx tests/hfa-audit/erc-containment/erc-containment-trial-002-static.ts

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const FRONTEND_SRC = join(__dirname, '../../../frontend/src')

const FORBIDDEN_IMPORTS_OUTSIDE_OWN_FILE = [
  { symbol: 'buildRiskQualityTrend', definedIn: 'lib/sera/risk-quality-trend.ts' },
  { symbol: 'calculateModalHfaErcCategory', definedIn: 'lib/sera/erc-modal.ts' },
]

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full)
  }
  return files
}

let failures = 0
const allFiles = walk(FRONTEND_SRC)

for (const { symbol, definedIn } of FORBIDDEN_IMPORTS_OUTSIDE_OWN_FILE) {
  const violators: string[] = []
  for (const file of allFiles) {
    if (file.endsWith(definedIn.replace(/\//g, require('node:path').sep))) continue
    const content = readFileSync(file, 'utf8')
    if (content.includes(symbol)) violators.push(file)
  }
  const ok = violators.length === 0
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${symbol} (mecanismo MOTOR_HEURISTIC_V1 deprecated) não é usado fora de ${definedIn}`)
  if (!ok) {
    failures++
    for (const v of violators) console.log(`  usado em: ${v}`)
  }
}

// Verifica que o relatório de evento e a tela de evento passam pela contenção.
const reportPage = readFileSync(join(FRONTEND_SRC, 'app/(dashboard)/reports/event/[id]/page.tsx'), 'utf8')
const usesContainment = reportPage.includes('erc-containment') && reportPage.includes('describeErcValue')
console.log(`${usesContainment ? 'PASS' : 'FAIL'} — relatório de evento usa describeErcValue (erc-containment.ts)`)
if (!usesContainment) failures++

const eventsPage = readFileSync(join(FRONTEND_SRC, 'app/(dashboard)/events/[id]/page.tsx'), 'utf8')
const noDuplicateMatrix = !eventsPage.includes('EV_ARMS_ERC') && !eventsPage.includes('EV_ARMS_SEV_ROW')
console.log(`${noDuplicateMatrix ? 'PASS' : 'FAIL'} — events/[id] não contém mais cópia hardcoded duplicada da matriz ARMS`)
if (!noDuplicateMatrix) failures++
const importsSharedMatrix = eventsPage.includes("from '@/lib/risk-profile/erc'")
console.log(`${importsSharedMatrix ? 'PASS' : 'FAIL'} — events/[id] importa a matriz ARMS da fonte única (lib/risk-profile/erc.ts)`)
if (!importsSharedMatrix) failures++

console.log(failures === 0 ? 'ERC_CONTAINMENT_STATIC_TRIAL_OK' : `ERC_CONTAINMENT_STATIC_TRIAL_FAILED (${failures} falhas)`)
process.exit(failures === 0 ? 0 : 1)
