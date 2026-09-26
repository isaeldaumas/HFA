import type { SeraVNextEngineInput, SeraVNextEngineOutput } from '../../engine-contract'
import { isEvidenceUsableFor } from '../../evidence'
import { isPt, localizeActor } from '../localization'

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

function actorLabel(actor: string | null, locale: SeraVNextEngineInput['locale']): string {
  return localizeActor(actor, locale)?.trim() || (isPt(locale) ? 'ator direto' : 'direct actor')
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

  const locale = input.engineInput.locale
  const actor = actorLabel(input.directActor.actor, locale)

  const perceptionStatement = genericStatement(
    isPt(locale) ? `Estado perceptivo de ${actor} no ponto de fuga` : `Perceptual state of ${actor} at the escape point`,
    perceptionEvidence,
  )
  const objectiveStatement = genericStatement(
    isPt(locale) ? `Objetivo operacional de ${actor} no ponto de fuga` : `Operational objective of ${actor} at the escape point`,
    objectiveEvidence,
  )
  const actionStatement = genericStatement(
    isPt(locale) ? `Ação de ${actor} no ponto de fuga` : `Action of ${actor} at the escape point`,
    actionEvidence,
  )

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
