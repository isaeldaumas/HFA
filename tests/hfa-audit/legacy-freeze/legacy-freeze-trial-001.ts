// AUDIT TEST — não faz parte do manifesto oficial.
// Tripwire de congelamento do motor legado (docs/auditoria-hfa/terceira-etapa/04-congelamento-legado.md).
// Falha se alguém expandir silenciosamente a matriz ERC hardcoded ou remover os avisos de
// congelamento sem decisão formal (D3/D4).
// Executar: npx tsx tests/hfa-audit/legacy-freeze/legacy-freeze-trial-001.ts

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const FRONTEND_SRC = join(__dirname, '../../../frontend/src')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

const pipelineSrc = readFileSync(join(FRONTEND_SRC, 'lib/sera/pipeline.ts'), 'utf8')
const allStepsSrc = readFileSync(join(FRONTEND_SRC, 'lib/sera/all-steps.ts'), 'utf8')
const ercSrc = readFileSync(join(FRONTEND_SRC, 'lib/risk-profile/erc.ts'), 'utf8')

check(pipelineSrc.includes('MOTOR LEGADO EM MANUTENÇÃO RESTRITA'), 'pipeline.ts declara congelamento do motor legado')
check(allStepsSrc.includes('MOTOR LEGADO EM MANUTENÇÃO RESTRITA'), 'all-steps.ts declara congelamento do motor legado')
check(ercSrc.includes('MECANISMO ERC EM MANUTENÇÃO RESTRITA'), 'risk-profile/erc.ts declara congelamento do mecanismo ERC')

// Tripwire: a matriz ARMS×código deve ter exatamente 16 entradas (4 severidades × 4 barreiras).
// Se este número mudar, alguém alterou a fórmula sem passar pela decisão D3.
const armsMatches = ercSrc.match(/[ABCD][1-4]:\s*\d/g) ?? []
check(armsMatches.length === 16, `matriz ARMS_ERC continua com 16 entradas (encontrado: ${armsMatches.length})`)

// Tripwire: número de códigos canônicos P/O/A não deve crescer sem decisão D4.
const canonicalCodesSrc = readFileSync(join(FRONTEND_SRC, 'lib/sera-vnext/canonical-codes.ts'), 'utf8')
const pCodes = (canonicalCodesSrc.match(/'P-[A-Z]'/g) ?? new Set()) as unknown as string[]
const uniqueP = new Set(canonicalCodesSrc.match(/'P-[A-H]'/g) ?? [])
const uniqueO = new Set(canonicalCodesSrc.match(/'O-[A-D]'/g) ?? [])
const uniqueA = new Set(canonicalCodesSrc.match(/'A-[A-J]'/g) ?? [])
check(uniqueP.size === 8, `8 códigos canônicos de percepção (P-A..P-H) — encontrado ${uniqueP.size}`)
check(uniqueO.size === 4, `4 códigos canônicos de objetivo (O-A..O-D) — encontrado ${uniqueO.size}`)
check(uniqueA.size === 10, `10 códigos canônicos de ação (A-A..A-J) — encontrado ${uniqueA.size}`)

console.log(failures === 0 ? 'LEGACY_FREEZE_TRIAL_OK' : `LEGACY_FREEZE_TRIAL_FAILED (${failures} falhas)`)
process.exit(failures === 0 ? 0 : 1)
