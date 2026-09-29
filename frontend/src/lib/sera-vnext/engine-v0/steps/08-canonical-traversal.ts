import {
  runEvidenceTraversal,
  SERA_PT_V1_TREE,
  validateCanonicalTree,
} from '../../canonical-tree/index'
import type { SeraAxisCandidate, SeraCanonicalPath, SeraConfidence, SeraVNextEngineOutput } from '../../engine-contract'
import type { SeraEvidenceItem } from '../../evidence'
import { axisToEvidenceUse, isEvidenceUsableFor } from '../../evidence'
import type { CanonicalSeraAxis } from '../../types'
import { localizeRationale } from '../localization'
import { confidenceFromCount } from '../utils'

validateCanonicalTree(SERA_PT_V1_TREE)

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function capConfidence(value: SeraConfidence, ceiling: SeraConfidence): SeraConfidence {
  const rank: Record<SeraConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }
  return rank[value] <= rank[ceiling] ? value : ceiling
}

function axisEvidence(args: {
  axis: CanonicalSeraAxis
  evidence: SeraEvidenceItem[]
  supplementalEvidence: string[]
}): string[] {
  const use = axisToEvidenceUse(args.axis)
  return unique([
    ...args.evidence.filter((item) => isEvidenceUsableFor(item, use)).map((item) => item.statement),
    ...args.supplementalEvidence,
  ])
}

function buildAxisCandidate(input: {
  axis: CanonicalSeraAxis
  statement: string | null
  actor: string | null
  locale: 'pt-BR' | 'en'
  supportingEvidence: string[]
  counterEvidence: string[]
  excludedPostEscapeEvidence: string[]
  evidence: SeraEvidenceItem[]
  confidenceCeiling: SeraConfidence
}): { axisCandidate: SeraAxisCandidate; path: SeraCanonicalPath; unansweredQuestions: string[] } {
  const allowedEvidenceStatements = new Set([...input.supportingEvidence, ...input.counterEvidence])
  const scopedEvidence = input.evidence
    .filter((item) => allowedEvidenceStatements.has(item.statement))
    .map((item) => {
      // Step 07 only admits another crewmember's perception statement when the direct actor
      // explicitly acknowledged that cue at the critical anchor. Rebind that selected cue to
      // the direct-actor perception lane for traversal; do not generalize context-actor evidence.
      if (input.axis === 'P' && input.supportingEvidence.includes(item.statement) && item.actorRelation === 'CONTEXT_ACTOR') {
        return { ...item, actorRelation: 'DIRECT_ACTOR' as const }
      }
      return item
    })
  const traversal = runEvidenceTraversal({
    axis: input.axis,
    statementAtEscapePoint: input.statement,
    evidence: scopedEvidence,
    locale: input.locale,
  })
  const nodes = new Map(SERA_PT_V1_TREE.nodes.map((node) => [node.nodeId, node]))
  const answers = traversal.path.answers.map((answer) => {
    const node = nodes.get(answer.nodeId)
    const question = input.locale === 'pt-BR'
      ? (node?.question ?? answer.question)
      : (node?.exactQuestionTextENAnchor ?? answer.exactQuestionTextENAnchor ?? answer.question)
    return {
      ...answer,
      question,
      rationale: answer.rationale ? localizeRationale(answer.rationale, input.locale) : answer.rationale,
    }
  })
  const path: SeraCanonicalPath = {
    ...traversal.path,
    questionPath: answers.map((answer) => answer.question),
    answers,
  }
  const unansweredQuestions = traversal.candidateCode
    ? []
    : answers.length
      ? [`${answers[answers.length - 1].nodeId}: ${answers[answers.length - 1].question}`]
      : [input.locale === 'pt-BR' ? `${input.axis}: o nó raiz canônico não foi avaliado` : `${input.axis}: canonical root was not evaluated`]

  const traversalSupport = unique(path.answers.flatMap((answer) => answer.supportingEvidence ?? []))
  const traversalCounter = unique(path.answers.flatMap((answer) => answer.counterEvidence ?? []))
  const supportingEvidence = axisEvidence({
    axis: input.axis,
    evidence: scopedEvidence,
    supplementalEvidence: traversalSupport.length ? traversalSupport : input.supportingEvidence,
  })
  const counterEvidence = unique([...input.counterEvidence, ...traversalCounter])

  return {
    axisCandidate: {
      axis: input.axis,
      proposedCode: traversal.candidateCode,
      status: traversal.status,
      actor: input.actor,
      statementAtEscapePoint: input.statement,
      supportingEvidence,
      counterEvidence,
      excludedPostEscapeEvidence: input.excludedPostEscapeEvidence,
      alternativesConsidered: path.answers.map((answer) => `${answer.nodeId}:${answer.answer}`),
      canonicalPath: path.nodeIds,
      confidence: capConfidence(confidenceFromCount(supportingEvidence.length), input.confidenceCeiling),
    },
    path,
    unansweredQuestions,
  }
}

function unresolvedAxisCandidate(input: {
  axis: CanonicalSeraAxis
  actor: string | null
  statement: string | null
  supportingEvidence: string[]
  counterEvidence: string[]
  excludedPostEscapeEvidence: string[]
}): SeraAxisCandidate {
  return {
    axis: input.axis,
    proposedCode: null,
    status: 'INSUFFICIENT_EVIDENCE',
    actor: input.actor,
    statementAtEscapePoint: input.statement,
    supportingEvidence: input.supportingEvidence,
    counterEvidence: input.counterEvidence,
    excludedPostEscapeEvidence: input.excludedPostEscapeEvidence,
    alternativesConsidered: [],
    canonicalPath: [],
    confidence: 'LOW',
  }
}

export function runStep08CanonicalTraversal(input: {
  factualExtraction: SeraVNextEngineOutput['factualExtraction']
  axisStatements: {
    perception: { statement: string | null; supportingEvidence: string[]; counterEvidence: string[] }
    objective: { statement: string | null; supportingEvidence: string[]; counterEvidence: string[] }
    action: { statement: string | null; supportingEvidence: string[]; counterEvidence: string[] }
  }
  directActor: SeraVNextEngineOutput['directActor']
  escapePoint: SeraVNextEngineOutput['escapePoint']
  locale: 'pt-BR' | 'en'
}): {
  axes: SeraVNextEngineOutput['axes']
  canonicalTraversal: SeraVNextEngineOutput['canonicalTraversal']
} {
  if (
    input.escapePoint.status === 'INSUFFICIENT_EVIDENCE'
    || input.escapePoint.status === 'NO_HUMAN_ESCAPE_POINT'
    || input.escapePoint.confidence === 'LOW'
    || input.directActor.status !== 'IDENTIFIED'
  ) {
    const perception = unresolvedAxisCandidate({ axis: 'P', actor: input.directActor.actor, statement: input.axisStatements.perception.statement, supportingEvidence: input.axisStatements.perception.supportingEvidence, counterEvidence: input.axisStatements.perception.counterEvidence, excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence })
    const objective = unresolvedAxisCandidate({ axis: 'O', actor: input.directActor.actor, statement: input.axisStatements.objective.statement, supportingEvidence: input.axisStatements.objective.supportingEvidence, counterEvidence: input.axisStatements.objective.counterEvidence, excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence })
    const action = unresolvedAxisCandidate({ axis: 'A', actor: input.directActor.actor, statement: input.axisStatements.action.statement, supportingEvidence: input.axisStatements.action.supportingEvidence, counterEvidence: input.axisStatements.action.counterEvidence, excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence })
    return {
      axes: { perception, objective, action },
      canonicalTraversal: {
        status: 'INSUFFICIENT_EVIDENCE',
        paths: [],
        unansweredQuestions: [input.locale === 'pt-BR'
          ? (input.directActor.status !== 'IDENTIFIED'
              ? 'P/O/A não percorridos: ator direto não resolvido no ponto de fuga.'
              : 'P/O/A não percorridos: ponto de fuga da operação segura não estabelecido com evidência/confiança suficiente.')
          : (input.directActor.status !== 'IDENTIFIED'
              ? 'P/O/A not traversed: the direct actor is unresolved at the escape point.'
              : 'P/O/A not traversed: the safe-operation escape point lacks sufficient evidence/confidence.')],
      },
    }
  }
  const perception = buildAxisCandidate({
    axis: 'P',
    statement: input.axisStatements.perception.statement,
    actor: input.directActor.actor,
    locale: input.locale,
    supportingEvidence: input.axisStatements.perception.supportingEvidence,
    counterEvidence: input.axisStatements.perception.counterEvidence,
    excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence,
    evidence: input.factualExtraction.evidence,
    confidenceCeiling: input.escapePoint.confidence,
  })
  const objective = buildAxisCandidate({
    axis: 'O',
    statement: input.axisStatements.objective.statement,
    actor: input.directActor.actor,
    locale: input.locale,
    supportingEvidence: input.axisStatements.objective.supportingEvidence,
    counterEvidence: input.axisStatements.objective.counterEvidence,
    excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence,
    evidence: input.factualExtraction.evidence,
    confidenceCeiling: input.escapePoint.confidence,
  })
  const action = buildAxisCandidate({
    axis: 'A',
    statement: input.axisStatements.action.statement,
    actor: input.directActor.actor,
    locale: input.locale,
    supportingEvidence: input.axisStatements.action.supportingEvidence,
    counterEvidence: input.axisStatements.action.counterEvidence,
    excludedPostEscapeEvidence: input.escapePoint.excludedPostEscapeEvidence,
    evidence: input.factualExtraction.evidence,
    confidenceCeiling: input.escapePoint.confidence,
  })

  const maintenancePreflightContext =
    /\bmaintenance|manuten[cç][aã]o\b/i.test(input.directActor.actor ?? '') &&
    /\b(pre[- ]?flight|pr[eé][ -]?voo|inspe[cç][aã]o)\b/i.test(`${input.escapePoint.firstDepartureCandidate ?? input.escapePoint.statement ?? input.escapePoint.earliestCandidate ?? input.escapePoint.criticalUnsafeActCandidate ?? input.escapePoint.latestCandidate ?? ''}`)
  if (maintenancePreflightContext && !perception.axisCandidate.proposedCode) {
    perception.axisCandidate.alternativesConsidered = [...new Set([...perception.axisCandidate.alternativesConsidered, 'P-F', 'P-G'])]
  }
  if (maintenancePreflightContext && !action.axisCandidate.proposedCode) {
    action.axisCandidate.alternativesConsidered = [...new Set([...action.axisCandidate.alternativesConsidered, 'A-B', 'A-C', 'A-G'])]
  }

  const paths = [perception.path, objective.path, action.path]
  const unansweredQuestions = [
    ...perception.unansweredQuestions,
    ...objective.unansweredQuestions,
    ...action.unansweredQuestions,
  ]

  return {
    axes: {
      perception: perception.axisCandidate,
      objective: objective.axisCandidate,
      action: action.axisCandidate,
    },
    canonicalTraversal: {
      status: paths.every((path) => path.status === 'COMPLETED_CANDIDATE_ONLY')
        ? 'COMPLETED_CANDIDATE_ONLY'
        : paths.some((path) => path.status === 'PARTIAL')
          ? 'PARTIAL'
          : 'INSUFFICIENT_EVIDENCE',
      paths,
      unansweredQuestions,
    },
  }
}
