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

function semanticEvidenceScore(use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', text: string): number {
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (use === 'PERCEPTION') {
    let score = 0
    if (/\b(identific|associ|acredit|entend|perceb|reconhec|confund|interpret)\w*/.test(t)) score += 6
    if (/\b(visao de tunel|tunnel vision|destino|unidade|plataforma|pista|helideck|warning|alerta)\b/.test(t)) score += 4
    return score
  }
  if (use === 'OBJECTIVE') {
    let score = 0
    if (/\b(objetiv|intenc|pretend|planej|meta|goal|intent|planned|planning)\w*/.test(t)) score += 6
    if (/\b(entendemos que|acreditava que|pouso seria|destino previsto|rota prevista|planned destination|planned route)\b/.test(t)) score += 5
    if (/\b(eficiencia|economia|prazo|schedule|productivity|produtividade|cost|custo)\b/.test(t)) score += 4
    return score
  }
  let score = 0
  if (/\b(aproxim|pous|decol|descend|subi|prosseg|continu|selecion|acion|execut|realiz|planej|conduz|virou|manteve|land|approach|descend|climb|continued|selected|executed)\w*/.test(t)) score += 6
  if (/\b(comando|controle de voo|flight control|checklist|switch|modo|mode)\b/.test(t)) score += 2
  return score
}

function primaryEvidence(use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', evidence: string[]): string | null {
  if (!evidence.length) return null
  return evidence
    .map((text, index) => ({ text, index, score: semanticEvidenceScore(use, text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.text ?? evidence[0]
}

function genericStatement(label: string, evidence: string[], use: 'PERCEPTION' | 'OBJECTIVE' | 'ACTION', override?: string | null): string | null {
  const primary = override?.trim() || primaryEvidence(use, evidence)
  if (!primary) return null
  return `${label}: ${primary}`
}

export function runStep07AxisStatements(input: {
  engineInput: SeraVNextEngineInput
  directActor: SeraVNextEngineOutput['directActor']
  unsafeActOrCondition: SeraVNextEngineOutput['unsafeActOrCondition']
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  escapePoint: SeraVNextEngineOutput['escapePoint']
}): SeraAxisStatementBundle {
  const anchorResolved =
    input.escapePoint.status !== 'INSUFFICIENT_EVIDENCE' &&
    input.escapePoint.status !== 'NO_HUMAN_ESCAPE_POINT' &&
    input.escapePoint.confidence !== 'LOW' &&
    input.directActor.status === 'IDENTIFIED'
  if (!anchorResolved) {
    return {
      perception: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'PERCEPTION'), alternativesConsidered: [] },
      objective: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'OBJECTIVE'), alternativesConsidered: [] },
      action: { statement: null, supportingEvidence: [], counterEvidence: counterEvidenceFor(input.factualExtraction, 'ACTION'), alternativesConsidered: [] },
    }
  }

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
    'PERCEPTION',
  )
  const objectiveStatement = genericStatement(
    isPt(locale) ? `Objetivo operacional de ${actor} no ponto de fuga` : `Operational objective of ${actor} at the escape point`,
    objectiveEvidence,
    'OBJECTIVE',
  )
  const actionStatement = genericStatement(
    isPt(locale) ? `Ação de ${actor} no ponto de fuga` : `Action of ${actor} at the escape point`,
    actionEvidence,
    'ACTION',
    input.unsafeActOrCondition.type === 'UNSAFE_ACT' ? input.unsafeActOrCondition.statement : null,
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
