import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from '../../frontend/node_modules/typescript/lib/typescript.js'

const pagePath = 'frontend/src/app/(dashboard)/events/[id]/page.tsx'
const page = readFileSync(pagePath, 'utf8')
const ast = ts.createSourceFile(pagePath, page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
assert.equal(ast.parseDiagnostics.length, 0, 'The event detail TSX must parse cleanly')
for (const tab of ['sera','safety','history']) {
  assert.ok(page.includes(`id: '${tab}'`), `Missing ${tab} tab`)
  assert.ok(page.includes(`selectedEventSection === '${tab}'`), `Missing ${tab} tab panel visibility`)
  assert.ok(page.includes(`id="event-panel-${tab}" role="tabpanel"`), `Missing ${tab} accessible tab panel`)
}
assert.ok(page.includes("event.vnext_analysis || analysis || event.event_kind === 'HFA_ANALYSIS' ? 'sera' : 'safety'"), 'Analyzed events open in SERA; Safety-only reports open in Safety')
assert.ok(page.includes('onClick={() => setEventSection(tab.id)}'), 'Tabs must be interactive')
assert.ok(page.includes('aria-selected={selectedEventSection === tab.id}'), 'Tabs must communicate selection')
const safetyStart = page.indexOf("selectedEventSection === 'safety'")
const seraStart = page.indexOf("selectedEventSection === 'sera'")
const historyStart = page.indexOf("selectedEventSection === 'history'")
assert.ok(safetyStart < seraStart && seraStart < historyStart)
for (const action of ['Triagem de Safety','<EventRiskPanel','<EventSafetyActionPanel']) {
  const pos = page.indexOf(action)
  assert.ok(safetyStart < pos && pos < seraStart, `${action} must be isolated inside Safety`)
}
for (const action of ['<VNextEventAnalysisPanel','<SeraClarificationForm','mode="review"','Adicionar evidências ou reprocessar análise']) {
  const pos = page.indexOf(action)
  assert.ok(seraStart < pos && pos < historyStart, `${action} must be inside SERA`)
}
for (const action of ['mode="history"','<EventDuplicateReviewPanel','Administração do registro','Mostrar relatório histórico']) {
  const pos = page.indexOf(action)
  assert.ok(historyStart < pos, `${action} belongs in History`)
}
assert.ok(page.indexOf('onClick={() => void deleteEventFromDetail()}') > historyStart, 'Destructive action must not dominate the event header')
assert.ok(page.includes('setEventSection(\'history\')'), 'Audit navigation must lead to history')
assert.ok(page.includes('setShowLegacyHistorical((current) => !current)'), 'Legacy source must remain accessible')
assert.ok(page.includes('eventId={event.id}'), 'All actions must continue to target the same event')
assert.ok(page.includes('vnextReanalyzeState ==='), 'Reanalysis state remains observable')
assert.ok(page.includes('setShowReanalysisForm((current) => !current)'), 'Engine refresh is optional and collapsed')
const review = readFileSync('frontend/src/components/sera-vnext/EventHumanReviewPanel.tsx','utf8')
assert.match(review, /mode\?: 'review' \| 'history'/)
assert.match(review, /mode === 'history' && \(summary\.reviews\.length/)
assert.match(review, /mode === 'review' && summary\.canReview && showReviewForm/)
assert.ok(review.includes('baseEngineRevision: summary.engineRevision'), 'Review concurrency contract must remain unchanged')
assert.ok(review.includes('await load()'), 'Review history must refresh after save')
const risk = readFileSync('frontend/src/components/safety/EventRiskPanel.tsx','utf8')
const actions = readFileSync('frontend/src/components/safety/EventSafetyActionPanel.tsx','utf8')
for (const [file, label] of [[risk,'Avaliar risco'], [actions,'Adicionar ação de Safety']]) {
  assert.ok(file.includes('useState(false)'), `${label}: form initially collapsed`)
  assert.ok(file.includes('canEdit && showForm'), `${label}: permissioned form`)
  assert.ok(file.includes('canEdit && !showForm'), `${label}: opt-in form`)
  assert.ok(file.includes('setShowForm(false)'), `${label}: form closes after save`)
  assert.ok(file.includes(label), `${label}: explicit action`)
}
console.log('EVENT_THREE_TAB_UX_PASS: SERA first for analyzed, Safety isolated, History auditable, same event endpoints, forms collapsed')
