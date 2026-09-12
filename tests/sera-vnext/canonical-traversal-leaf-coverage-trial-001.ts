import assert from 'node:assert/strict'
import { assertNoFinalClassification, runCanonicalAxisTraversal } from '../../frontend/src/lib/sera-vnext/canonical-traversal'

function main() {
  // This trial remains as a lightweight smoke check.
  // Full deterministic 22-leaf coverage moved to:
  // tests/sera-vnext/canonical-traversal-exhaustive-leaf-trial-001.ts

  const pSmoke = runCanonicalAxisTraversal({
    axis: 'P',
    answers: [
      { nodeId: 'P_ROOT', answerValue: 'START', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'P_ASSESSMENT', answerValue: 'SIM', answerSource: 'TEST_FIXTURE' },
    ],
  })
  assert.equal(pSmoke.status, 'LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(pSmoke.leafCandidate?.candidateOnlyLeafCode, 'P-A')
  assertNoFinalClassification(pSmoke)

  const oSmoke = runCanonicalAxisTraversal({
    axis: 'O',
    answers: [
      { nodeId: 'O_ROOT', answerValue: 'START', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'O_RULES', answerValue: 'SIM', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'O_MANAGED_RISK', answerValue: 'SIM', answerSource: 'TEST_FIXTURE' },
    ],
  })
  assert.equal(oSmoke.status, 'LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(oSmoke.leafCandidate?.candidateOnlyLeafCode, 'O-D')
  assertNoFinalClassification(oSmoke)

  const aSmoke = runCanonicalAxisTraversal({
    axis: 'A',
    answers: [
      { nodeId: 'A_ROOT', answerValue: 'START', answerSource: 'TEST_FIXTURE' },
      { nodeId: 'A_IMPLEMENTED', answerValue: 'NÃO_DESLIZE_LAPSO_ERRO', answerSource: 'TEST_FIXTURE' },
    ],
  })
  assert.equal(aSmoke.status, 'LEAF_REACHED_NOT_CLASSIFIED')
  assert.equal(aSmoke.leafCandidate?.candidateOnlyLeafCode, 'A-B')
  assertNoFinalClassification(aSmoke)

  console.log('PASS canonical-traversal-leaf-coverage-trial-001')
}

main()
