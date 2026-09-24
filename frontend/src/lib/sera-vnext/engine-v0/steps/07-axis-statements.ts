import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { isEvidenceUsableFor } from '../../evidence'

export type SeraAxisStatementBundle = {
  perception: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
  objective: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
  action: {
    statement: string | null
    supportingEvidence: string[]
    counterEvidence: string[]
    alternativesConsidered: string[]
  }
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function evidenceFor(
  factualExtraction: SeraVNextEngineOutput['factualExtraction'],
  escapePoint: SeraVNextEngineOutput['escapePoint'],
  use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION',
): string[] {
  const escapeSupport = new Set(escapePoint.supportingEvidence)
  const ranked = factualExtraction.evidence
    .filter((item) => isEvidenceUsableFor(item, use))
    .sort((a, b) => {
      const rank = (item: typeof a): number => {
        if (item.temporalRelation === 'AT_ESCAPE') return 0
        if (escapeSupport.has(item.statement)) return 1
        if (item.temporalRelation === 'PRE_ESCAPE') return 2
        return 3
      }
      const delta = rank(a) - rank(b)
      if (delta !== 0) return delta
      // Within pre-escape evidence, prefer the item temporally closest to the escape.
      return b.sourceSentenceIndex - a.sourceSentenceIndex
    })
  return unique(ranked.map((item) => item.statement)).slice(0, 10)
}

function counterEvidenceFor(
  factualExtraction: SeraVNextEngineOutput['factualExtraction'],
  use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION',
): string[] {
  return unique(
    factualExtraction.evidence
      .filter((item) => item.contradicts.includes(use) || (item.assertionStatus === 'REJECTED_AS_FACTOR' && item.supports.includes(use)))
      .map((item) => item.statement),
  ).slice(0, 6)
}

function wrongTargetContext(input: {
  engineInput: SeraVNextEngineInput
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): boolean {
  const text = normalize(`${input.escapePoint.statement ?? ''} ${input.engineInput.narrative}`)
  return /\b(wrong deck|wrong destination|wrong runway|wrong surface|pouso (?:em )?(?:unidade|plataforma|pista) (?:errada|nao prevista)|unidade nao prevista|plataforma nao prevista|destino diferente)\b/.test(text)
    || /\b(identificou|reconheceu|interpretou|interpretaram|confundiu|associou|entendeu|acreditou|tratou|trat[aá]-?la|trat[aá]-?lo|passou a tratar|tomou)\b.{0,180}\b(como|seria|por|pela|pelo)\b.{0,120}\b(primeiro pouso|destino|unidade|plataforma|pista|helideck)\b/.test(text)
    || /\bassociou\b.{0,120}\b(unit-[a-z0-9-]+|pcp-?[0-9]+|unidade|plataforma|pista|helideck)\b.{0,120}\b(ao|a|com o|com a)\b.{0,80}\b(destino|pouso|unidade|plataforma|pista|helideck)\b/.test(text)
}

function actorLabel(actor: string | null): string {
  return actor?.trim() || 'ator direto'
}

function genericStatement(label: string, evidence: string[]): string | null {
  if (!evidence.length) return null
  return `${label}: ${evidence.slice(0, 2).join(' ')}`
}

export function runStep07AxisStatements(input: {
  engineInput: SeraVNextEngineInput
  directActor: SeraVNextEngineOutput['directActor']
  unsafeActOrCondition: SeraVNextEngineOutput['unsafeActOrCondition']
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraAxisStatementBundle {
  const perceptionEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'PERCEPTION')
  const objectiveEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'OBJECTIVE')
  const actionEvidence = evidenceFor(input.factualExtraction, input.escapePoint, 'ACTION')

  const perceptionCounter = counterEvidenceFor(input.factualExtraction, 'PERCEPTION')
  const objectiveCounter = counterEvidenceFor(input.factualExtraction, 'OBJECTIVE')
  const actionCounter = counterEvidenceFor(input.factualExtraction, 'ACTION')

  const isWrongTarget = wrongTargetContext(input)
  const actor = actorLabel(input.directActor.actor)

  const perceptionStatement = isWrongTarget
    ? `No ponto de fuga, ${actor} mantinha uma identificação equivocada do alvo operacional, tratando a unidade, pista ou destino observado como correspondente ao destino previsto.`
    : genericStatement(`Estado perceptivo de ${actor} no ponto de fuga`, perceptionEvidence)

  const objectiveStatement = isWrongTarget
    ? `No ponto de fuga, ${actor} pretendia cumprir o pouso ou destino previsto no planejamento operacional; não há evidência factual de intenção consciente de escolher um destino diferente.`
    : genericStatement(`Objetivo operacional de ${actor} no ponto de fuga`, objectiveEvidence)

  const actionStatement = isWrongTarget
    ? `No ponto de fuga, ${actor} conduzia a aproximação de forma coerente com a identificação equivocada que mantinha do destino; não há evidência de falha independente de implementação ou seleção da ação antes desse ponto.`
    : genericStatement(`Ação de ${actor} no ponto de fuga`, actionEvidence)

  return {
    perception: {
      statement: perceptionStatement,
      supportingEvidence: perceptionEvidence,
      counterEvidence: perceptionCounter,
      alternativesConsidered: ['P-A', 'P-B', 'P-C', 'P-D', 'P-E', 'P-F', 'P-G', 'P-H'],
    },
    objective: {
      statement: objectiveStatement,
      supportingEvidence: objectiveEvidence,
      counterEvidence: objectiveCounter,
      alternativesConsidered: ['O-A', 'O-B', 'O-C', 'O-D'],
    },
    action: {
      statement: actionStatement,
      supportingEvidence: actionEvidence,
      counterEvidence: actionCounter,
      alternativesConsidered: ['A-A', 'A-B', 'A-C', 'A-D', 'A-E', 'A-F', 'A-G', 'A-H', 'A-I', 'A-J'],
    },
  }
}
