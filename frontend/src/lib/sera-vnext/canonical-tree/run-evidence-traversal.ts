import { assertCanonicalSeraLeafCode } from '../canonical-codes'
import type { SeraCanonicalPath, SeraVNextEngineOutput } from '../engine-contract'
import type { SeraEvidenceItem } from '../evidence'
import type { CanonicalSeraAxis } from '../types'
import { SERA_PT_V1_TREE } from './sera-pt-v1'
import { validateCanonicalTree } from './validate-tree'
import { evaluateCanonicalNode } from './evaluate-node'
import type { SeraCanonicalNode } from './types'

validateCanonicalTree(SERA_PT_V1_TREE)

const ROOT_BY_AXIS: Record<CanonicalSeraAxis, string> = {
  P: 'P_ROOT',
  O: 'O_ROOT',
  A: 'A_ROOT',
}

function nodeById(): Map<string, SeraCanonicalNode> {
  return new Map(SERA_PT_V1_TREE.nodes.map((node) => [node.nodeId, node]))
}

function candidateStatus(code: string | null): SeraVNextEngineOutput['axes']['perception']['status'] {
  if (!code) return 'INSUFFICIENT_EVIDENCE'
  if (['P-A', 'O-A', 'A-A'].includes(code)) return 'NO_FAILURE'
  return 'CANDIDATE'
}

export function runEvidenceTraversal(args: {
  axis: CanonicalSeraAxis
  statementAtEscapePoint: string | null
  evidence: SeraEvidenceItem[]
  locale?: 'pt-BR' | 'en'
}): {
  candidateCode: string | null
  status: SeraVNextEngineOutput['axes']['perception']['status']
  path: SeraCanonicalPath
  unansweredQuestions: string[]
} {
  const nodes = nodeById()
  const trace: SeraCanonicalPath['answers'] = []
  let currentNodeId: string | null = ROOT_BY_AXIS[args.axis]
  let terminalCode: string | null = null
  let rootResponseText: string | null = null

  while (currentNodeId) {
    const node = nodes.get(currentNodeId)
    if (!node) break

    const answer = evaluateCanonicalNode({
      axis: args.axis,
      node,
      evidence: args.evidence,
      statementAtEscapePoint: args.statementAtEscapePoint,
      rootResponseText,
      locale: args.locale ?? 'pt-BR',
    })
    trace.push(answer)
    if (answer.nodeId.endsWith('_ROOT') && answer.responseText) rootResponseText = answer.responseText

    if (answer.terminalCode) {
      terminalCode = assertCanonicalSeraLeafCode(args.axis, answer.terminalCode)
      currentNodeId = null
    } else if (answer.nextNodeId) {
      currentNodeId = answer.nextNodeId
    } else {
      currentNodeId = null
    }
  }

  const nodeIds = trace.map((item) => item.nodeId)
  const questionPath = trace.map((item) => item.question)
  const isComplete = Boolean(terminalCode)
  const hasAnySupport = trace.some((item) => (item.supportingEvidence?.length ?? 0) > 0)
  const status: SeraCanonicalPath['status'] = isComplete
    ? 'COMPLETED_CANDIDATE_ONLY'
    : hasAnySupport
      ? 'PARTIAL'
      : 'INSUFFICIENT_EVIDENCE'

  const unansweredQuestions = isComplete
    ? []
    : trace.length
      ? [`${trace[trace.length - 1].nodeId}: ${trace[trace.length - 1].question}`]
      : [`${args.axis}: canonical root was not evaluated`]

  return {
    candidateCode: terminalCode,
    status: terminalCode ? candidateStatus(terminalCode) : hasAnySupport ? 'UNRESOLVED' : 'INSUFFICIENT_EVIDENCE',
    path: {
      axis: args.axis,
      candidateCode: terminalCode,
      status,
      nodeIds,
      questionPath,
      answers: trace,
    },
    unansweredQuestions,
  }
}
