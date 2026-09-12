import assert from 'node:assert/strict'
import {
  advanceCanonicalTraversal,
  assertNoFinalClassification,
  getCanonicalTraversalNode,
  runCanonicalAxisTraversal,
  validateCanonicalTraversalAnswer,
} from '../../frontend/src/lib/sera-vnext/canonical-traversal'
import { SERA_CANONICAL_TREE_NODES } from '../../frontend/src/lib/sera-vnext/canonical-tree'
import type { ApprovedEscapePointScope } from '../../frontend/src/lib/sera-vnext/types'

function main() {
  // 1) All 34 canonical rows resolve to valid node descriptors by nodeId.
  assert.equal(SERA_CANONICAL_TREE_NODES.length, 34, 'Expected 34 canonical rows.')
  for (const row of SERA_CANONICAL_TREE_NODES) {
    const descriptor = getCanonicalTraversalNode(row.nodeId)
    assert.equal(descriptor.nodeId, row.nodeId, `Node descriptor mismatch for ${row.nodeInventoryId}`)
    assert.equal(descriptor.axis, row.axis, `Axis mismatch for ${row.nodeInventoryId}`)
  }

  // 2) Returned questions must come from exactQuestionTextPt/exactQuestionTextEn.
  const pRoot = getCanonicalTraversalNode('P_ROOT')
  const pRootStep = advanceCanonicalTraversal({
    axis: 'P',
    currentNodeId: 'P_ROOT',
    answerValue: 'START',
    answerSource: 'TEST_FIXTURE',
  })
  assert.equal(pRootStep.exactQuestionTextPt, pRoot.exactQuestionTextPt, 'PT question must match canonical text.')
  assert.equal(pRootStep.exactQuestionTextEn, pRoot.exactQuestionTextEn, 'EN question must match canonical text.')

  // 3) Invalid answer must return INVALID_ANSWER.
  const invalidAnswer = advanceCanonicalTraversal({
    axis: 'P',
    currentNodeId: 'P_ASSESSMENT',
    answerValue: 'MAYBE',
    answerSource: 'TEST_FIXTURE',
  })
  assert.equal(invalidAnswer.status, 'INVALID_ANSWER', 'Invalid answer must be rejected.')

  // 4) Unknown node must return INVALID_NODE.
  const invalidNode = advanceCanonicalTraversal({
    axis: 'P',
    currentNodeId: 'P_UNKNOWN',
    answerValue: 'SIM',
    answerSource: 'TEST_FIXTURE',
  })
  assert.equal(invalidNode.status, 'INVALID_NODE', 'Unknown node must be rejected.')

  // 5) P path reaches leaf candidate without classification.
  const pLeaf = runCanonicalAxisTraversal({
    axis: 'P',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'SIM', answerSource: 'AUTHOR_DECISION' },
    ],
  })
  assert.equal(pLeaf.status, 'LEAF_REACHED_NOT_CLASSIFIED', 'P path should reach leaf candidate.')
  assert.equal(pLeaf.leafCandidate?.candidateOnlyLeafCode, 'P-A', 'P path should reach P-A in this scenario.')
  assert.equal(pLeaf.leafCandidate?.candidateOnly, true, 'Leaf candidate must remain candidate-only.')
  assert.equal(pLeaf.leafCandidate?.classificationAllowed, false, 'Leaf candidate must not allow classification.')
  assertNoFinalClassification(pLeaf)

  // 6) O path rejects O-E and does not return O-E leaf.
  const oInvalidAnswer = validateCanonicalTraversalAnswer('O_RULES', 'O-E')
  assert.equal(oInvalidAnswer.valid, false, 'O-E cannot be accepted as canonical answer value.')
  assert.equal(oInvalidAnswer.status, 'INVALID_ANSWER', 'O-E answer should be INVALID_ANSWER for O_RULES.')
  const oLeaf = runCanonicalAxisTraversal({
    axis: 'O',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'O_RULES', answerValue: 'SIM', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'O_MANAGED_RISK', answerValue: 'NÃO', answerSource: 'AUTHOR_DECISION' },
    ],
  })
  assert.equal(oLeaf.status, 'LEAF_REACHED_NOT_CLASSIFIED', 'O path should reach a structural leaf candidate.')
  assert.equal(oLeaf.leafCandidate?.candidateOnlyLeafCode, 'O-A', 'Managed-risk path must reach the O-A no-failure leaf.')
  assert.notEqual(oLeaf.leafCandidate?.candidateOnlyLeafCode, 'O-E', 'O-E must never be returned as leaf.')
  assertNoFinalClassification(oLeaf)

  // 7) A path reaches leaf candidate without classification.
  const aLeaf = runCanonicalAxisTraversal({
    axis: 'A',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'SIM', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'A_CORRECT', answerValue: 'SIM', answerSource: 'AUTHOR_DECISION' },
    ],
  })
  assert.equal(aLeaf.status, 'LEAF_REACHED_NOT_CLASSIFIED', 'A path should reach leaf candidate.')
  assert.equal(aLeaf.leafCandidate?.candidateOnlyLeafCode, 'A-A', 'A path should reach A-A in this scenario.')
  assertNoFinalClassification(aLeaf)

  // 8) Leaf candidate never exposes selectedCode/releasedCode permissions.
  assert.equal(aLeaf.selectedCodeAllowed, false, 'selectedCode must stay locked.')
  assert.equal(aLeaf.releasedCodeAllowed, false, 'releasedCode must stay locked.')
  assert.equal('selectedCode' in aLeaf, false, 'Leaf output must not expose selectedCode.')
  assert.equal('releasedCode' in aLeaf, false, 'Leaf output must not expose releasedCode.')

  // 9) Incomplete traversal can yield NEXT_NODE_READY or TRAVERSAL_EXTENSION_REQUIRED.
  const nextNodeReady = runCanonicalAxisTraversal({
    axis: 'P',
    answers: [{ nodeId: 'P_ROOT', answerValue: 'START', answerSource: 'AUTHOR_DECISION' }],
  })
  assert.equal(nextNodeReady.status, 'NEXT_NODE_READY', 'Incomplete local traversal should leave next node ready.')

  const extensionRequired = runCanonicalAxisTraversal({
    axis: 'O',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START', answerSource: 'AUTHOR_DECISION' },
      { nodeId: 'O_RULES', answerValue: 'SIM', answerSource: 'AUTHOR_DECISION' },
    ],
    intakeNodeIds: ['O_ROOT', 'O_RULES'],
  })
  assert.equal(
    extensionRequired.status,
    'TRAVERSAL_EXTENSION_REQUIRED',
    'Traversal should request extension when next canonical node is outside intake scope.'
  )

  // 10) approvedEscapePointScope accepted as passive input and not enforced in this phase.
  const passiveScope: ApprovedEscapePointScope = {
    scopeId: 'ESC-PT-TRAV-001',
    scopeStatement: 'Passive acceptance only for A4R190-D skeleton.',
    boundaryEvidenceRefs: ['SCOPE-REF-001'],
    rationale: 'Scope context accepted without productive enforcement in this phase.',
    status: 'APPROVED_NOT_ENFORCED',
  }
  const scopeStep = advanceCanonicalTraversal({
    axis: 'A',
    currentNodeId: 'A_ROOT',
    answerValue: 'START',
    answerSource: 'TEST_FIXTURE',
    approvedEscapePointScope: passiveScope,
  })
  assert.equal(scopeStep.approvedEscapePointScopeAccepted, true, 'Scope must be accepted as passive context.')
  assert.notEqual(scopeStep.status, 'AXIS_TRAVERSAL_BLOCKED', 'Scope presence must not block traversal in this phase.')
  assertNoFinalClassification(scopeStep)

  console.log('PASS canonical-traversal-skeleton-trial-001')
}

main()
