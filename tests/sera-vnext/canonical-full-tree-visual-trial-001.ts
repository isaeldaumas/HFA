import assert from 'node:assert/strict'
import type { SeraCanonicalPath } from '../../frontend/src/lib/sera-vnext/engine-contract'
import { buildCanonicalFlowMermaid, buildCanonicalFlowVisualModel } from '../../frontend/src/lib/sera-vnext/canonical-flow-visual'

const path: SeraCanonicalPath = {
  axis: 'P',
  candidateCode: 'P-G',
  status: 'COMPLETED_CANDIDATE_ONLY',
  nodeIds: ['P_ROOT', 'P_ASSESSMENT', 'P_CAPABILITY', 'P_TIME_PRESSURE', 'P_INFORMATION_AMBIGUOUS', 'P_INFORMATION_AVAILABLE'],
  questionPath: [],
  answers: [
    { nodeId: 'P_ROOT', question: '', answer: 'START', nextNodeId: 'P_ASSESSMENT', terminalCode: null },
    { nodeId: 'P_ASSESSMENT', question: '', answer: 'NÃO', nextNodeId: 'P_CAPABILITY', terminalCode: null },
    { nodeId: 'P_CAPABILITY', question: '', answer: 'SIM', nextNodeId: 'P_TIME_PRESSURE', terminalCode: null },
    { nodeId: 'P_TIME_PRESSURE', question: '', answer: 'NÃO', nextNodeId: 'P_INFORMATION_AMBIGUOUS', terminalCode: null },
    { nodeId: 'P_INFORMATION_AMBIGUOUS', question: '', answer: 'NÃO', nextNodeId: 'P_INFORMATION_AVAILABLE', terminalCode: null },
    { nodeId: 'P_INFORMATION_AVAILABLE', question: '', answer: 'SIM', nextNodeId: null, terminalCode: 'P-G' },
  ],
}

const model = buildCanonicalFlowVisualModel(path, true)
assert.equal(model.nodes.filter((node) => node.kind === 'question').length, 6)
assert.equal(model.nodes.filter((node) => node.kind === 'terminal').length, 8)
assert.equal(model.edges.length, 13)
assert.equal(model.edges.filter((edge) => edge.active).length, 6)
assert.equal(model.nodes.find((node) => node.code === 'P-G')?.selected, true)
assert.equal(model.nodes.find((node) => node.code === 'P-A')?.selected, false)

const chart = buildCanonicalFlowMermaid(path, true)
assert.match(chart, /P-A<br\/>Nenhuma falha/)
assert.match(chart, /P-G<br\/>Falha de atenção/)
assert.match(chart, /linkStyle [0-9,]+ stroke:#67e8f9/)
assert.match(chart, /Não · sensorial/)
assert.match(chart, /Sim · atenção/)

console.log('PASS canonical full-tree visual')
