import assert from 'node:assert/strict'
import {
  SERA_CANONICAL_TREE_MODEL_VERSION,
  SERA_CANONICAL_TREE_NODES,
} from '../../frontend/src/lib/sera-vnext/canonical-tree'
import { evaluateCanonicalNode, runEvidenceTraversal } from '../../frontend/src/lib/sera-vnext/canonical-tree/index'
import { SERA_PT_V1_TREE } from '../../frontend/src/lib/sera-vnext/canonical-tree/sera-pt-v1'
import type { CanonicalSeraAxis } from '../../frontend/src/lib/sera-vnext/types'

function node(nodeId: string) {
  const found = SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === nodeId)
  assert.ok(found, `Missing canonical node ${nodeId}`)
  return found
}

function evaluate(axis: CanonicalSeraAxis, nodeId: string, statement: string) {
  return evaluateCanonicalNode({
    axis,
    node: node(nodeId),
    evidence: [],
    statementAtEscapePoint: statement,
  })
}

function assertCandidate(axis: CanonicalSeraAxis, statement: string, expected: string | null) {
  const output = runEvidenceTraversal({ axis, evidence: [], statementAtEscapePoint: statement })
  assert.equal(output.candidateCode, expected, `${axis}: unexpected candidate for ${statement}`)
  assert.equal(output.candidateCode === 'O-E', false, 'O-E must never be emitted.')
  assert.notEqual(output.status, 'CLASSIFIED', 'Evidence traversal must remain candidate-only.')
  return output
}

function main() {
  assert.equal(SERA_CANONICAL_TREE_MODEL_VERSION, 'A4R190-A_v0.2.1')
  assert.equal(
    node('O_MANAGED_RISK').exactQuestionTextENAnchor,
    'Did the unsafe act result from pursuing a goal that, although consistent with rules and regulations, was inconsistent with established operating procedures or did not manage or limit risk?',
    'The EN anchor must retain the negative polarity of the exact PT question.'
  )

  // PT/EN polarity and branch targets: the question asks whether risk was not managed.
  const unmanaged = evaluate('O', 'O_MANAGED_RISK', 'A equipe aceitou risco e não limitou o risco.')
  assert.equal(unmanaged.answer, 'SIM')
  assert.equal(unmanaged.terminalCode, 'O-D')
  const managed = evaluate('O', 'O_MANAGED_RISK', 'A equipe abortou a aproximação preservando segurança.')
  assert.equal(managed.answer, 'NÃO')
  assert.equal(managed.terminalCode, 'O-A')

  // O-C is not opened by a known rule plus awareness alone; all strict evidence is required.
  assertCandidate('O', 'A regra conhecida proibia seguir abaixo do mínimo, e o piloto estava ciente dela.', null)
  assertCandidate(
    'O',
    'A regra conhecida proibia seguir abaixo do mínimo; em violação excepcional isolada, o piloto estava ciente, decidiu violar conscientemente a regra e continuou.',
    'O-C'
  )
  assertCandidate('O', 'Para ganhar tempo, a equipe aceitou risco e não limitou o risco.', 'O-D')
  assertCandidate('O', 'A regra conhecida foi violada conscientemente para ganhar tempo.', null)
  assertCandidate(
    'O',
    'A regra conhecida proibia seguir abaixo do mínimo; em violação excepcional isolada, o piloto estava ciente, decidiu violar conscientemente a regra e continuou para ganhar tempo.',
    'O-C'
  )

  // Action frontiers: own post-action feedback, third-party feedback, and time pressure.
  assert.equal(evaluate('A', 'A_IMPLEMENTED', 'O operador, por lapso, omitiu uma etapa obrigatória.').terminalCode, 'A-B')
  assert.equal(evaluate('A', 'A_IMPLEMENTED', 'O operador executou o ajuste, mas não verificou o resultado da própria ação.').terminalCode, 'A-C')
  assert.equal(evaluate('A', 'A_TIME_PRESSURE', 'A coordenação entre a tripulação falhou.').terminalCode, 'A-G')
  assert.equal(evaluate('A', 'A_TIME_PRESSURE', 'Sem tempo, o controlador não confirmou o readback.').terminalCode, 'A-J')
  assert.equal(evaluate('A', 'A_TIME_PRESSURE', 'O piloto selecionou modo errado.').terminalCode, 'A-F')
  assert.equal(evaluate('A', 'A_TIME_PRESSURE', 'Sem tempo, o piloto selecionou modo errado.').terminalCode, 'A-I')

  // The no-failure leaves and all P leaf mappings remain explicit and reachable.
  const expectedLeaves: Array<[string, string, string]> = [
    ['P_ASSESSMENT', 'SIM', 'P-A'],
    ['P_CAPABILITY', 'NÃO_SENSORIAL', 'P-B'],
    ['P_CAPABILITY', 'NÃO_CONHECIMENTO', 'P-C'],
    ['P_TIME_PRESSURE', 'SIM_ATENCAO', 'P-D'],
    ['P_TIME_PRESSURE', 'SIM_GERENCIAMENTO', 'P-E'],
    ['P_INFORMATION_AMBIGUOUS', 'SIM', 'P-F'],
    ['P_INFORMATION_AVAILABLE', 'SIM', 'P-G'],
    ['P_INFORMATION_AVAILABLE', 'NÃO', 'P-H'],
    ['O_MANAGED_RISK', 'NÃO', 'O-A'],
    ['A_CORRECT', 'SIM', 'A-A'],
  ]
  for (const [nodeId, answer, expectedLeaf] of expectedLeaves) {
    const row = SERA_CANONICAL_TREE_NODES.find((item) => item.nodeId === nodeId && item.branchCondition === answer)
    assert.equal(row?.leafCode, expectedLeaf, `${nodeId}/${answer} must reach ${expectedLeaf}`)
  }

  console.log('PASS canonical-tree-semantic-trial-002')
}

main()
