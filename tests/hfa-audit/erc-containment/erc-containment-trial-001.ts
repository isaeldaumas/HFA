// AUDIT TEST — não faz parte do manifesto oficial (tests/sera-vnext/test-manifest.json).
// Reproduz e valida a contenção do F-04 (mecanismos ERC incompatíveis exibidos sem rótulo).
// Executar: npx tsx tests/hfa-audit/erc-containment/erc-containment-trial-001.ts

import {
  ERC_MECHANISMS,
  describeErcValue,
  buildErcContainmentNotice,
  isErcConsolidatedViewEnabled,
} from '../../../frontend/src/lib/risk-profile/erc-containment'

let failures = 0
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`)
  if (!ok) {
    failures++
    console.log(`  esperado: ${JSON.stringify(expected)}`)
    console.log(`  obtido:   ${JSON.stringify(actual)}`)
  }
}
function assertTrue(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

// 1. Registro de mecanismos deve conter os dois mecanismos ERC vivos, cada um com versão e direção de escala.
assertTrue(
  Object.keys(ERC_MECHANISMS).length >= 2,
  'registro contém ao menos os 2 mecanismos ERC ativos conhecidos'
)
assertTrue(
  ERC_MECHANISMS.MOTOR_HEURISTIC_V1.scaleDirection === '1_IS_CRITICAL',
  'MOTOR_HEURISTIC_V1 documenta escala 1=crítico'
)
assertTrue(
  ERC_MECHANISMS.ARMS_CODE_MATRIX_V1.scaleDirection === '5_IS_CRITICAL',
  'ARMS_CODE_MATRIX_V1 documenta escala 5=crítico'
)

// 2. Caso reproduzido na 2ª etapa: P-A/O-A/A-A ("sem falha") não pode aparecer, sem rótulo, como
//    contraditório entre os dois mecanismos. describeErcValue deve sempre incluir o mecanismo e a versão.
const motorSemFalha = describeErcValue('MOTOR_HEURISTIC_V1', 2) // valor motor default (pipeline.ts:301)
const armsSemFalha = describeErcValue('ARMS_CODE_MATRIX_V1', { p: 'P-A', o: 'O-A', a: 'A-A' })

assertTrue(!!motorSemFalha.mechanismId && !!motorSemFalha.mechanismVersion, 'valor motor traz mechanismId+version')
assertTrue(!!armsSemFalha.mechanismId && !!armsSemFalha.mechanismVersion, 'valor ARMS traz mechanismId+version')
assertTrue(motorSemFalha.mechanismId !== armsSemFalha.mechanismId, 'os dois valores vêm de mecanismos distintos e identificáveis')

// 3. Nunca comparar/apresentar como consolidado quando os mecanismos diferem.
assertTrue(
  motorSemFalha.category !== undefined && armsSemFalha.category !== undefined,
  'ambos os valores expõem uma categoria HFA normalizada para inspeção'
)
// Os números brutos DIVERGEM propositalmente (motor=2 heurístico vs P-A/O-A/A-A sem falha) —
// o contrato exigido é que NUNCA sejam exibidos como o mesmo indicador sem identificação de mecanismo.
assertTrue(
  motorSemFalha.label.includes(ERC_MECHANISMS.MOTOR_HEURISTIC_V1.shortLabel),
  'label do valor motor cita o mecanismo de origem'
)
assertTrue(
  armsSemFalha.label.includes(ERC_MECHANISMS.ARMS_CODE_MATRIX_V1.shortLabel),
  'label do valor ARMS cita o mecanismo de origem'
)

// 4. Contenção desligada por padrão -> exibição consolidada de card único permanece DESABILITADA.
assertTrue(isErcConsolidatedViewEnabled() === false, 'visão consolidada de ERC permanece desabilitada por padrão')

// 5. Aviso de contenção deve existir e não pode ser vazio.
const notice = buildErcContainmentNotice()
assertTrue(notice.length > 20, 'mensagem de contenção presente e não vazia')
assertTrue(/mecanismo/i.test(notice), 'mensagem de contenção menciona "mecanismo"')

console.log(failures === 0 ? 'ERC_CONTAINMENT_TRIAL_OK' : `ERC_CONTAINMENT_TRIAL_FAILED (${failures} falhas)`)
process.exit(failures === 0 ? 0 : 1)
