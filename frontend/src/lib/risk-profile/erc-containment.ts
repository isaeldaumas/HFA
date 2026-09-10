/**
 * ERC containment layer — RISK v0.9-F (auditoria HFA, terceira etapa)
 *
 * Contexto: a auditoria HFA (docs/auditoria-hfa/, F-04/F-05/F-08) encontrou múltiplos
 * mecanismos ERC incompatíveis coexistindo no sistema (escalas invertidas, matrizes
 * duplicadas, uma família de código morta). Nenhum foi declarado canônico (decisão D3
 * pendente — docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md).
 *
 * Esta contenção NÃO escolhe uma fórmula canônica. Ela obriga qualquer valor ERC exibido
 * a se identificar (mecanismo + versão + direção de escala) e impede que dois mecanismos
 * diferentes sejam apresentados como se fossem o mesmo indicador ou somados/consolidados.
 *
 * Não apaga nem reinterpreta dados históricos — apenas rotula corretamente sua origem.
 */

import { computeHfaErcCategoryFromCodes, describeHfaErcCategory } from './erc'
import { coerceMotorErcToHfaCategory, type HfaErcCategory } from '@/lib/sera/erc-conversion'

export type ErcScaleDirection = '1_IS_CRITICAL' | '5_IS_CRITICAL'

export type ErcMechanismId = 'MOTOR_HEURISTIC_V1' | 'ARMS_CODE_MATRIX_V1'

export type ErcMechanismDescriptor = {
  id: ErcMechanismId
  version: string
  shortLabel: string
  description: string
  scaleDirection: ErcScaleDirection
  sourceStatus: 'HEURISTIC_NOT_VALIDATED'
  inputs: string
}

/**
 * Registro fechado dos mecanismos ERC atualmente vivos no sistema.
 * Ver docs/auditoria-hfa/segunda-etapa/05-auditoria-erc.md para o catálogo completo
 * (inclui mecanismos hoje não utilizados em produção, marcados como DEPRECATED nos
 * próprios arquivos — risk-quality-trend.ts e erc-modal.ts — e que não devem ser
 * reintroduzidos sem passar por esta camada de contenção).
 */
export const ERC_MECHANISMS: Record<ErcMechanismId, ErcMechanismDescriptor> = {
  MOTOR_HEURISTIC_V1: {
    id: 'MOTOR_HEURISTIC_V1',
    version: 'v0.1',
    shortLabel: 'Estimativa heurística do motor',
    description:
      'Valor produzido pelo LLM e por heurísticas de palavra-chave do motor legado ' +
      '(analyses.erc_level). Escala 1=crítico … 5=mínimo. Não validado cientificamente.',
    scaleDirection: '1_IS_CRITICAL',
    sourceStatus: 'HEURISTIC_NOT_VALIDATED',
    inputs: 'narrativa (texto) + códigos P/O/A',
  },
  ARMS_CODE_MATRIX_V1: {
    id: 'ARMS_CODE_MATRIX_V1',
    version: 'v0.1',
    shortLabel: 'Matriz ARMS a partir dos códigos',
    description:
      'Valor recomputado a partir de uma matriz de severidade×barreira inspirada no ARMS, ' +
      'aplicada apenas aos códigos P/O/A (risk-profile/erc.ts). Escala 5=crítico … 1=aceitável. ' +
      'Matriz hardcoded sem fonte metodológica validada declarada.',
    scaleDirection: '5_IS_CRITICAL',
    sourceStatus: 'HEURISTIC_NOT_VALIDATED',
    inputs: 'apenas códigos P/O/A',
  },
}

export type DescribedErcValue = {
  mechanismId: ErcMechanismId
  mechanismVersion: string
  scaleDirection: ErcScaleDirection
  category: HfaErcCategory | null
  rawValue: unknown
  label: string
  caveat: string
}

const SHARED_CAVEAT =
  'Estimativa heurística não validada cientificamente. Não representa probabilidade ' +
  'operacional nem conclusão de risco isolada. Consulte docs/auditoria-hfa/segunda-etapa/' +
  '08-decisao-d3-erc.md antes de qualquer uso decisório.'

/**
 * Descreve um valor ERC bruto identificando explicitamente seu mecanismo de origem.
 * Nunca retorna um valor "consolidado" — cada chamada corresponde a um único mecanismo.
 */
export function describeErcValue(
  mechanismId: 'MOTOR_HEURISTIC_V1',
  rawMotorErcLevel: unknown
): DescribedErcValue
export function describeErcValue(
  mechanismId: 'ARMS_CODE_MATRIX_V1',
  codes: { p: string | null | undefined; o: string | null | undefined; a: string | null | undefined }
): DescribedErcValue
export function describeErcValue(
  mechanismId: ErcMechanismId,
  input: unknown
): DescribedErcValue {
  const mechanism = ERC_MECHANISMS[mechanismId]

  let category: HfaErcCategory | null
  if (mechanismId === 'MOTOR_HEURISTIC_V1') {
    category = coerceMotorErcToHfaCategory(input)
  } else {
    const codes = input as { p: string | null | undefined; o: string | null | undefined; a: string | null | undefined }
    category = computeHfaErcCategoryFromCodes(codes.p, codes.o, codes.a)
  }

  const described = describeHfaErcCategory(category)
  const label = category != null
    ? `${mechanism.shortLabel} (${mechanism.id} ${mechanism.version}): ${described.label ?? described.code ?? category}`
    : `${mechanism.shortLabel} (${mechanism.id} ${mechanism.version}): não disponível`

  return {
    mechanismId,
    mechanismVersion: mechanism.version,
    scaleDirection: mechanism.scaleDirection,
    category,
    rawValue: input,
    label,
    caveat: SHARED_CAVEAT,
  }
}

/**
 * Modo de contenção. Enquanto DESLIGADO (padrão), o sistema não deve apresentar um único
 * "ERC consolidado" quando mais de um mecanismo incompatível está em jogo. Ligar esta flag
 * exige decisão D3 formal registrada — não deve ser ativada apenas para conveniência de UI.
 */
export function isErcConsolidatedViewEnabled(): boolean {
  return process.env.SERA_ERC_CONSOLIDATED_VIEW_ENABLED?.trim().toLowerCase() === 'true'
}

export function buildErcContainmentNotice(): string {
  return (
    'Indicador de risco (ERC) temporariamente apresentado apenas por mecanismo individual, ' +
    'para revisão metodológica (decisão D3 pendente). Os valores abaixo vêm de mecanismos ' +
    'diferentes e não devem ser somados, comparados diretamente ou tratados como um único ' +
    'índice consolidado. Ver docs/auditoria-hfa/segunda-etapa/08-decisao-d3-erc.md.'
  )
}

/**
 * Guarda de desenvolvimento: garante que uma lista de valores ERC descritos não está sendo
 * silenciosamente tratada como um único indicador quando os mecanismos divergem. Lança erro
 * em vez de permitir a criação de uma UI "consolidada" acidental.
 */
export function assertNoSilentErcConsolidation(values: DescribedErcValue[]): void {
  const mechanisms = new Set(values.map((v) => v.mechanismId))
  if (mechanisms.size > 1 && !isErcConsolidatedViewEnabled()) {
    throw new Error(
      'assertNoSilentErcConsolidation: tentativa de tratar múltiplos mecanismos ERC ' +
      `(${[...mechanisms].join(', ')}) como indicador único sem SERA_ERC_CONSOLIDATED_VIEW_ENABLED=true.`
    )
  }
}
