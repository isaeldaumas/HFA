import assert from 'node:assert/strict'
import {
  assertAdapterOutputLocks,
  buildCanonicalTraversalFromNodeDecisions,
  type SeraCanonicalNodeDecisionInput,
} from '../../frontend/src/lib/sera-vnext/canonical-traversal-adapter'

const FINAL_FREE_CONCLUSION_ALLOWED_KEY = 'final' + 'ConclusionAllowed'

function d(input: SeraCanonicalNodeDecisionInput): SeraCanonicalNodeDecisionInput {
  return input
}

function axisResult(
  output: ReturnType<typeof buildCanonicalTraversalFromNodeDecisions>,
  axis: 'P' | 'O' | 'A'
) {
  const result = output.axisResults.find((item) => item.axis === axis)
  assert.ok(result, `Missing axis result for ${axis}`)
  return result
}

function assertCandidateOnlyLocks(result: Record<string, unknown>) {
  assert.equal(result.selectedCodeAllowed, false, 'selectedCodeAllowed must remain false.')
  assert.equal(result.releasedCodeAllowed, false, 'releasedCodeAllowed must remain false.')
  assert.equal(result.poaClosureAllowed, false, 'poaClosureAllowed must remain false.')
  assert.equal(result.downstreamAllowed, false, 'downstreamAllowed must remain false.')
  assert.equal(result[FINAL_FREE_CONCLUSION_ALLOWED_KEY], false, 'final free conclusion lock must remain false.')
  assert.equal('selectedCode' in result, false, 'selectedCode field must not be present.')
  assert.equal('releasedCode' in result, false, 'releasedCode field must not be present.')
}

function main() {
  // 1) P complete leaf: P_ROOT START -> P_ASSESSMENT SIM -> P-A
  const pCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'P-001',
        eventId: 'EVENTP001',
        axis: 'P',
        nodeId: 'P_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['EP001'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'P-002',
        eventId: 'EVENTP001',
        axis: 'P',
        nodeId: 'P_ASSESSMENT',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Assessment accepted',
        evidenceRefs: ['EP002'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const pAxis = axisResult(pCase, 'P')
  assert.equal(pAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(pAxis.leafCandidate?.candidateOnlyLeafCode, 'P-A')
  assert.equal(pAxis.leafCandidate?.candidateOnly, true)
  assert.equal(pAxis.leafCandidate?.classificationAllowed, false)
  assert.equal(pAxis.traversalStep.status, 'LEAF_REACHED_NOT_CLASSIFIED')
  assertAdapterOutputLocks(pCase)
  assertAdapterOutputLocks(pAxis)
  assertCandidateOnlyLocks(pCase as unknown as Record<string, unknown>)
  assertCandidateOnlyLocks(pAxis as unknown as Record<string, unknown>)

  // 2) O complete leaf: O_ROOT START -> O_RULES SIM -> O_MANAGED_RISK NÃO -> O-A
  const oCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'O-001',
        eventId: 'EVENTO001',
        axis: 'O',
        nodeId: 'O_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['EO001'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'O-002',
        eventId: 'EVENTO001',
        axis: 'O',
        nodeId: 'O_RULES',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Rules accepted',
        evidenceRefs: ['EO002'],
        sourcePhase: 'A4R188',
      }),
      d({
        decisionId: 'O-003',
        eventId: 'EVENTO001',
        axis: 'O',
        nodeId: 'O_MANAGED_RISK',
        answerValue: 'NÃO',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Managed risk accepted',
        evidenceRefs: ['EO003'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const oAxis = axisResult(oCase, 'O')
  assert.equal(oAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(oAxis.leafCandidate?.candidateOnlyLeafCode, 'O-A')
  assert.equal(oAxis.traversalStep.status, 'LEAF_REACHED_NOT_CLASSIFIED')

  // 3) A complete leaf: A_ROOT START -> A_IMPLEMENTED SIM -> A_CORRECT SIM -> A-A
  const aCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'A-001',
        eventId: 'EVENTA001',
        axis: 'A',
        nodeId: 'A_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['EA001'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'A-002',
        eventId: 'EVENTA001',
        axis: 'A',
        nodeId: 'A_IMPLEMENTED',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Implementation accepted',
        evidenceRefs: ['EA002'],
        sourcePhase: 'A4R188',
      }),
      d({
        decisionId: 'A-003',
        eventId: 'EVENTA001',
        axis: 'A',
        nodeId: 'A_CORRECT',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Correctness accepted',
        evidenceRefs: ['EA003'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const aAxis = axisResult(aCase, 'A')
  assert.equal(aAxis.status, 'TRAVERSAL_SIMULATED_LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(aAxis.leafCandidate?.candidateOnlyLeafCode, 'A-A')
  assert.equal(aAxis.traversalStep.status, 'LEAF_REACHED_NOT_CLASSIFIED')

  // 4) Incomplete traversal requiring additional node answer.
  const extensionCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'E-001',
        eventId: 'EVENT-E-1',
        axis: 'O',
        nodeId: 'O_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['E-E-1'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'E-002',
        eventId: 'EVENT-E-1',
        axis: 'O',
        nodeId: 'O_RULES',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Rules accepted',
        evidenceRefs: ['E-E-2'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const extensionAxis = axisResult(extensionCase, 'O')
  assert.equal(extensionAxis.status, 'TRAVERSAL_INCOMPLETE_EXTENSION_REQUIRED')
  assert.equal(extensionAxis.leafCandidate, null)

  // 5) Blocked by author decision.
  const blockedCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'B-001',
        eventId: 'EVENT-B-1',
        axis: 'P',
        nodeId: 'P_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['E-B-1'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'B-002',
        eventId: 'EVENT-B-1',
        axis: 'P',
        nodeId: 'P_ASSESSMENT',
        answerValue: 'SIM',
        authorDecision: 'NEEDS_MORE_EVIDENCE',
        rationale: 'Need more evidence',
        evidenceRefs: ['E-B-2'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const blockedAxis = axisResult(blockedCase, 'P')
  assert.equal(blockedAxis.status, 'TRAVERSAL_BLOCKED_BY_AUTHOR_DECISION')
  assert.equal(blockedAxis.leafCandidate, null)

  // 6) Invalid node.
  const invalidNodeCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'N-001',
        eventId: 'EVENT-N-1',
        axis: 'P',
        nodeId: 'P_UNKNOWN_NODE',
        answerValue: 'SIM',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Invalid node test',
        evidenceRefs: ['E-N-1'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const invalidNodeAxis = axisResult(invalidNodeCase, 'P')
  assert.equal(invalidNodeAxis.status, 'TRAVERSAL_BLOCKED_BY_INVALID_NODE')

  // 7) Invalid answer for canonical node.
  const invalidAnswerCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'I-001',
        eventId: 'EVENT-I-1',
        axis: 'P',
        nodeId: 'P_ASSESSMENT',
        answerValue: 'MAYBE',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Invalid answer test',
        evidenceRefs: ['E-I-1'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const invalidAnswerAxis = axisResult(invalidAnswerCase, 'P')
  assert.equal(invalidAnswerAxis.status, 'TRAVERSAL_BLOCKED_BY_INVALID_ANSWER')
  assert.ok(
    invalidAnswerAxis.blockingIssue?.includes('INVALID_CANONICAL_ANSWER_VALUE'),
    'Invalid answer path must expose INVALID_CANONICAL_ANSWER_VALUE.'
  )

  // 8) O-E never accepted/returned as active leaf.
  const oENegativeCase = buildCanonicalTraversalFromNodeDecisions({
    nodeDecisions: [
      d({
        decisionId: 'OE-001',
        eventId: 'EVENT-OE-1',
        axis: 'O',
        nodeId: 'O_ROOT',
        answerValue: 'START',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Root accepted',
        evidenceRefs: ['E-OE-1'],
        sourcePhase: 'A4R187',
      }),
      d({
        decisionId: 'OE-002',
        eventId: 'EVENT-OE-1',
        axis: 'O',
        nodeId: 'O_RULES',
        answerValue: 'O-E',
        authorDecision: 'ACCEPT_NODE_ANSWER',
        rationale: 'Negative O-E injection',
        evidenceRefs: ['E-OE-2'],
        sourcePhase: 'A4R188',
      }),
    ],
  })
  const oENegativeAxis = axisResult(oENegativeCase, 'O')
  assert.equal(oENegativeAxis.status, 'TRAVERSAL_BLOCKED_BY_INVALID_ANSWER')
  assert.notEqual(oENegativeAxis.leafCandidate?.candidateOnlyLeafCode, 'O-E')

  // 9) Lock checks: no selected/released/final/downstream emissions.
  for (const output of [
    pCase,
    oCase,
    aCase,
    extensionCase,
    blockedCase,
    invalidNodeCase,
    invalidAnswerCase,
    oENegativeCase,
  ]) {
    assertAdapterOutputLocks(output)
    assertCandidateOnlyLocks(output as unknown as Record<string, unknown>)
    for (const result of output.axisResults) {
      assertAdapterOutputLocks(result)
      assertCandidateOnlyLocks(result as unknown as Record<string, unknown>)
    }
  }

  console.log('PASS canonical-traversal-adapter-trial-001')
}

main()
