import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel } from '../../frontend/src/lib/sera-vnext/presentation'

const root = path.resolve(__dirname, '..', '..')

assert.equal(friendlyNodeLabel('P_ASSESSMENT', true), 'Avaliação da situação')
assert.equal(friendlyNodeLabel('P_TIME_PRESSURE', true), 'Pressão de tempo')
assert.equal(friendlyNodeLabel('A_IMPLEMENTED', true), 'Execução da ação')
assert.equal(friendlyAnswerLabel('START', true), 'Início')
assert.equal(friendlyAnswerLabel('NÃO', true), 'Não')

const candidate = computeCandidateAttention('P-G', 'O-A', 'A-A')
assert.ok(candidate)
assert.equal(candidate?.score, 42)
assert.deepEqual(candidate?.activeAxes, ['P'])
const screenReport = fs.readFileSync(path.join(root, 'frontend/src/app/(dashboard)/reports/event/[id]/page.tsx'), 'utf8')
const serverPdf = fs.readFileSync(path.join(root, 'frontend/src/lib/sera-vnext-product/pdf-report.ts'), 'utf8')
const eventPanel = fs.readFileSync(path.join(root, 'frontend/src/components/sera-vnext/VNextEventAnalysisPanel.tsx'), 'utf8')
const reportsIndex = fs.readFileSync(path.join(root, 'frontend/src/app/(dashboard)/reports/page.tsx'), 'utf8')

assert.equal(screenReport.includes("analysis?.event_summary ?? eventData?.raw_input"), false)
assert.equal(serverPdf.includes("body(doc, analysis.narrative"), false)
assert.ok(screenReport.includes('Resumo técnico'))
assert.ok(screenReport.includes('Como o sistema chegou à classificação'))
assert.ok(serverPdf.includes("L('Resumo executivo', 'Executive summary')"))
assert.ok(serverPdf.includes("L('Fatos-chave utilizados na análise', 'Key facts used in the analysis')"))
assert.ok(serverPdf.includes("L('Apêndice técnico - rastreabilidade e auditoria'"))
assert.ok(eventPanel.includes('CanonicalDecisionJourney'))
assert.ok(eventPanel.includes('CandidateRiskCard'))
assert.ok(reportsIndex.includes("redirect('/reports/executive')"))

console.log('PASS report presentation and didactic flow')
