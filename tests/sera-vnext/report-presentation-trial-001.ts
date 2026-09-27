import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel } from '../../frontend/src/lib/sera-vnext/presentation'
import { buildCanonicalFlowMermaid } from '../../frontend/src/lib/sera-vnext/canonical-flow-visual'

const root = path.resolve(__dirname, '..', '..')

assert.equal(friendlyNodeLabel('P_ASSESSMENT', true), 'Avaliação da situação')
assert.equal(friendlyNodeLabel('P_TIME_PRESSURE', true), 'Pressão de tempo')
assert.equal(friendlyNodeLabel('A_IMPLEMENTED', true), 'Execução da ação')
assert.equal(friendlyAnswerLabel('START', true), 'Resposta descritiva')
assert.equal(friendlyAnswerLabel('NÃO', true), 'Não')

const candidate = computeCandidateAttention('P-G', 'O-A', 'A-A')
assert.ok(candidate)
assert.equal(candidate?.score, 42)
assert.deepEqual(candidate?.activeAxes, ['P'])

const rootFlow = buildCanonicalFlowMermaid({
  axis: 'P',
  questionPath: [],
  nodeIds: ['P_ROOT'],
  answers: [{
    nodeId: 'P_ROOT',
    question: 'O que o operador acreditava que estava acontecendo?',
    answer: 'START',
    responseText: 'Acreditava que PCP1 era o primeiro destino.',
    nextNodeId: 'P_ASSESSMENT',
    terminalCode: null,
    supportingEvidence: [],
    rationale: 'root',
  }],
  candidateCode: 'P-G',
  status: 'CANDIDATE',
  unansweredQuestions: [],
} as any, true)
assert.ok(rootFlow.includes('Acreditava que PCP1 era o primeiro destino.'))
assert.equal(/N_P_ASSESSMENT\{/.test(rootFlow), false)
assert.ok(rootFlow.includes('classDef mutedNode fill:#f8fafc'))
const screenReport = fs.readFileSync(path.join(root, 'frontend/src/app/(dashboard)/reports/event/[id]/page.tsx'), 'utf8')
const serverPdf = fs.readFileSync(path.join(root, 'frontend/src/lib/sera-vnext-product/pdf-report.ts'), 'utf8')
const eventPanel = fs.readFileSync(path.join(root, 'frontend/src/components/sera-vnext/VNextEventAnalysisPanel.tsx'), 'utf8')
const reportsIndex = fs.readFileSync(path.join(root, 'frontend/src/app/(dashboard)/reports/page.tsx'), 'utf8')

assert.equal(screenReport.includes("analysis?.event_summary ?? eventData?.raw_input"), false)
assert.equal(serverPdf.includes("body(doc, analysis.narrative"), false)
assert.ok(screenReport.includes('Resumo técnico'))
assert.ok(screenReport.includes('Como o sistema chegou à classificação'))
assert.ok(screenReport.includes('CanonicalTreeDiagram'))
assert.ok(screenReport.includes('Correspondência SERA / HFACS'))
assert.ok(screenReport.includes('Pré-condições sustentadas pela evidência'))
assert.ok(screenReport.includes('Hipóteses preservadas — não confirmadas causalmente'))
assert.ok(serverPdf.includes("L('Resumo executivo', 'Executive summary')"))
assert.ok(serverPdf.includes("L('Pré-condições sustentadas pela evidência', 'Preconditions supported by the evidence')"))
assert.ok(serverPdf.includes("L('Hipóteses preservadas - não confirmadas causalmente', 'Retained hypotheses - not causally confirmed')"))
assert.ok(serverPdf.includes('postEscapeStatements'))
assert.ok(serverPdf.includes("L('Fatos-chave utilizados na análise', 'Key facts used in the analysis')"))
assert.ok(serverPdf.includes("L('Episódio operacional reconstruído ao redor do ponto de fuga', 'Operational episode reconstructed around the escape point')"))
assert.ok(serverPdf.includes('historicalComparators'))
assert.ok(serverPdf.includes("L('Outras sequências humanas/contextuais detectadas — não são pontos de fuga automáticos', 'Other human/contextual sequences detected — not automatic escape points')"))
assert.ok(serverPdf.includes("L('Gate de âncora de Fatores Humanos', 'Human-Factor anchor gate')"))
assert.ok(serverPdf.includes('renderCanonicalTreePage'))
assert.ok(serverPdf.includes('doc.roundedRect(g.x, g.y, g.w, g.h, 7)'))
assert.equal(serverPdf.includes('[g.x + g.w / 2, g.y]'), false)
assert.ok(serverPdf.includes('A Tabela 1 de Hendy e o Anexo B'))
assert.ok(serverPdf.includes('buildSeraHfacsBridge'))
assert.ok(serverPdf.includes('SERA_PRECONDITION_META'))
assert.ok(serverPdf.includes('Leitura da trajetória destacada'))
assert.ok(screenReport.includes('mesmo número da explicação'))
assert.ok(screenReport.includes('Tabela 1 de Hendy'))
assert.ok(serverPdf.includes('Todos os caminhos permanecem visíveis'))
assert.ok(serverPdf.includes("L('Apêndice técnico - rastreabilidade e auditoria'"))
assert.ok(eventPanel.includes('CanonicalDecisionJourney'))
assert.ok(eventPanel.includes('CandidateRiskCard'))
assert.ok(reportsIndex.includes("redirect('/reports/executive')"))

console.log('PASS report presentation and didactic flow')
