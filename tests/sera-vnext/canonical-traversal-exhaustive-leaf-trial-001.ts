import assert from 'node:assert/strict'
import {
  assertNoFinalClassification,
  runCanonicalAxisTraversal,
  validateCanonicalTraversalAnswer,
} from '../../frontend/src/lib/sera-vnext/canonical-traversal'
import { isCanonicalSeraLeafCode } from '../../frontend/src/lib/sera-vnext/canonical-codes'
import type { CanonicalSeraAxis, CanonicalSeraLeafCode } from '../../frontend/src/lib/sera-vnext/types'

type ExhaustivePath = {
  axis: CanonicalSeraAxis
  expectedLeaf: CanonicalSeraLeafCode
  answers: Array<{ nodeId: string; answerValue: string }>
}

const EXHAUSTIVE_PATHS: ExhaustivePath[] = [
  // Perception (8)
  {
    axis: 'P',
    expectedLeaf: 'P-A',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'SIM' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-B',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'NÃO_SENSORIAL' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-C',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'NÃO_CONHECIMENTO' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-D',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'P_TIME_PRESSURE', answerValue: 'SIM_ATENCAO' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-E',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'P_TIME_PRESSURE', answerValue: 'SIM_GERENCIAMENTO' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-F',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'P_TIME_PRESSURE', answerValue: 'NÃO' },
      { nodeId: 'P_INFORMATION_AMBIGUOUS', answerValue: 'SIM' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-G',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'P_TIME_PRESSURE', answerValue: 'NÃO' },
      { nodeId: 'P_INFORMATION_AMBIGUOUS', answerValue: 'NÃO' },
      { nodeId: 'P_INFORMATION_AVAILABLE', answerValue: 'SIM' },
    ],
  },
  {
    axis: 'P',
    expectedLeaf: 'P-H',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'NÃO' },
      { nodeId: 'P_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'P_TIME_PRESSURE', answerValue: 'NÃO' },
      { nodeId: 'P_INFORMATION_AMBIGUOUS', answerValue: 'NÃO' },
      { nodeId: 'P_INFORMATION_AVAILABLE', answerValue: 'NÃO' },
    ],
  },
  // Objective (4)
  {
    axis: 'O',
    expectedLeaf: 'O-A',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START' },
      { nodeId: 'O_RULES', answerValue: 'SIM' },
      { nodeId: 'O_MANAGED_RISK', answerValue: 'NÃO' },
    ],
  },
  {
    axis: 'O',
    expectedLeaf: 'O-B',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START' },
      { nodeId: 'O_RULES', answerValue: 'NÃO' },
      { nodeId: 'O_ROUTINE', answerValue: 'SIM' },
    ],
  },
  {
    axis: 'O',
    expectedLeaf: 'O-C',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START' },
      { nodeId: 'O_RULES', answerValue: 'NÃO' },
      { nodeId: 'O_ROUTINE', answerValue: 'NÃO' },
    ],
  },
  {
    axis: 'O',
    expectedLeaf: 'O-D',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START' },
      { nodeId: 'O_RULES', answerValue: 'SIM' },
      { nodeId: 'O_MANAGED_RISK', answerValue: 'SIM' },
    ],
  },
  // Action (10)
  {
    axis: 'A',
    expectedLeaf: 'A-A',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'SIM' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-B',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'NÃO_DESLIZE_LAPSO_ERRO' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-C',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'NÃO_FEEDBACK' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-D',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'NÃO_INABILIDADE' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-E',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'NÃO_CONHECIMENTO' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-F',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'A_TIME_PRESSURE', answerValue: 'NÃO_SELECAO' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-G',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'A_TIME_PRESSURE', answerValue: 'NÃO_FEEDBACK' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-H',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'A_TIME_PRESSURE', answerValue: 'SIM_GERENCIAMENTO' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-I',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'A_TIME_PRESSURE', answerValue: 'SIM_SELECAO' },
    ],
  },
  {
    axis: 'A',
    expectedLeaf: 'A-J',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM' },
      { nodeId: 'A_CORRECT', answerValue: 'NÃO' },
      { nodeId: 'A_CAPABILITY', answerValue: 'SIM' },
      { nodeId: 'A_TIME_PRESSURE', answerValue: 'SIM_FEEDBACK' },
    ],
  },
]

function assertNoForbiddenOutputFields(record: Record<string, unknown>, label: string) {
  assert.equal('selectedCode' in record, false, `${label}: selectedCode must be absent.`)
  assert.equal('releasedCode' in record, false, `${label}: releasedCode must be absent.`)
  assert.equal('finalConclusion' in record, false, `${label}: finalConclusion must be absent.`)
  assert.equal('hfacs' in record, false, `${label}: HFACS output must be absent.`)
  assert.equal('risk' in record, false, `${label}: Risk/ERC output must be absent.`)
  assert.equal('armsErc' in record, false, `${label}: ARMS/ERC output must be absent.`)
  assert.equal('recommendations' in record, false, `${label}: recommendations must be absent.`)
  assert.notEqual(record.status, 'CLASSIFIED', `${label}: CLASSIFIED must be absent.`)
}

function assertLeafPath(path: ExhaustivePath) {
  const output = runCanonicalAxisTraversal({
    axis: path.axis,
    answers: path.answers.map((answer) => ({
      nodeId: answer.nodeId,
      answerValue: answer.answerValue,
      answerSource: 'TEST_FIXTURE',
    })),
  })

  assert.equal(output.status, 'LEAF_REACHED_NOT_CLASSIFIED', `${path.expectedLeaf}: leaf status mismatch.`)
  assert.equal(output.leafCandidate?.candidateOnlyLeafCode, path.expectedLeaf, `${path.expectedLeaf}: leaf code mismatch.`)
  assert.equal(output.leafCandidate?.candidateOnly, true, `${path.expectedLeaf}: candidateOnly must be true.`)
  assert.equal(output.leafCandidate?.classificationAllowed, false, `${path.expectedLeaf}: classificationAllowed must be false.`)
  assert.equal(output.leafCandidate?.notFinalClassification, true, `${path.expectedLeaf}: notFinalClassification must be true.`)
  assert.equal(output.leafCandidate?.selectedCodeAllowed, false, `${path.expectedLeaf}: selectedCodeAllowed must be false.`)
  assert.equal(output.leafCandidate?.releasedCodeAllowed, false, `${path.expectedLeaf}: releasedCodeAllowed must be false.`)

  assert.equal(output.selectedCodeAllowed, false, `${path.expectedLeaf}: output selectedCodeAllowed must be false.`)
  assert.equal(output.releasedCodeAllowed, false, `${path.expectedLeaf}: output releasedCodeAllowed must be false.`)
  assert.equal(output.notFinalClassification, true, `${path.expectedLeaf}: output notFinalClassification must be true.`)

  assertNoFinalClassification(output)
  assertNoForbiddenOutputFields(output as unknown as Record<string, unknown>, path.expectedLeaf)
}

function assertLeafCodeAsAnswerBlocked() {
  const checks: Array<{ axis: CanonicalSeraAxis; nodeId: string; answerValue: string }> = [
    { axis: 'P', nodeId: 'P_ASSESSMENT', answerValue: 'P-A' },
    { axis: 'O', nodeId: 'O_RULES', answerValue: 'O-A' },
    { axis: 'A', nodeId: 'A_CORRECT', answerValue: 'A-A' },
  ]

  for (const check of checks) {
    const output = runCanonicalAxisTraversal({
      axis: check.axis,
      answers: [
        {
          nodeId: check.nodeId,
          answerValue: check.answerValue,
          answerSource: 'TEST_FIXTURE',
        },
      ],
    })

    assert.equal(output.status, 'AXIS_TRAVERSAL_BLOCKED')
    assert.ok(output.blockingIssue?.includes('expected answer for node'))

    const validation = validateCanonicalTraversalAnswer(check.nodeId, check.answerValue)
    assert.equal(validation.valid, false)
    assert.equal(validation.status, 'INVALID_ANSWER')
  }
}

function assertCrossAxisAnswerInjectionBlocked() {
  const checks: Array<{ axis: CanonicalSeraAxis; nodeId: string; answerValue: string }> = [
    { axis: 'P', nodeId: 'P_ASSESSMENT', answerValue: 'O-A' },
    { axis: 'O', nodeId: 'O_RULES', answerValue: 'A-A' },
    { axis: 'A', nodeId: 'A_CORRECT', answerValue: 'P-A' },
  ]

  for (const check of checks) {
    const output = runCanonicalAxisTraversal({
      axis: check.axis,
      answers: [
        {
          nodeId: check.nodeId,
          answerValue: check.answerValue,
          answerSource: 'TEST_FIXTURE',
        },
      ],
    })

    assert.equal(output.status, 'AXIS_TRAVERSAL_BLOCKED')
    assert.ok(output.blockingIssue?.includes('expected answer for node'))

    const validation = validateCanonicalTraversalAnswer(check.nodeId, check.answerValue)
    assert.equal(validation.valid, false)
    assert.equal(validation.status, 'INVALID_ANSWER')
  }
}

function assertLowercaseBlocked() {
  const lowercase = runCanonicalAxisTraversal({
    axis: 'O',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'O_RULES', answerValue: 'sim', answerSource: 'TEST_FIXTURE' },
    ],
  })

  assert.equal(lowercase.status, 'INVALID_ANSWER')
  assert.ok(lowercase.blockingIssue?.includes('INVALID_CANONICAL_ANSWER_VALUE'))
}

function assertOeNonExistent() {
  assert.equal(isCanonicalSeraLeafCode('O', 'O-E'), false, 'O-E must remain non-existent.')

  const validation = validateCanonicalTraversalAnswer('O_RULES', 'O-E')
  assert.equal(validation.valid, false)
  assert.equal(validation.status, 'INVALID_ANSWER')

  const blocked = runCanonicalAxisTraversal({
    axis: 'O',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'O_RULES', answerValue: 'O-E', answerSource: 'TEST_FIXTURE' },
    ],
  })

  assert.equal(blocked.status, 'INVALID_ANSWER')
  assert.ok(blocked.blockingIssue?.includes('INVALID_CANONICAL_ANSWER_VALUE'))
}

function assertAllLeavesCoveredExactlyOnce() {
  const leaves = EXHAUSTIVE_PATHS.map((item) => item.expectedLeaf)
  const uniqueLeaves = new Set(leaves)
  assert.equal(leaves.length, 22, 'Exhaustive trial must declare 22 active leaf paths.')
  assert.equal(uniqueLeaves.size, 22, 'Exhaustive trial must cover each active leaf exactly once.')
}

function main() {
  assertAllLeavesCoveredExactlyOnce()

  for (const path of EXHAUSTIVE_PATHS) {
    assertLeafPath(path)
  }

  assertOeNonExistent()
  assertLeafCodeAsAnswerBlocked()
  assertCrossAxisAnswerInjectionBlocked()
  assertLowercaseBlocked()

  console.log('PASS canonical-traversal-exhaustive-leaf-trial-001')
}

main()
