import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from '../../frontend/node_modules/react'
import { renderToStaticMarkup } from '../../frontend/node_modules/react-dom/server'
import DemoPage from '../../frontend/src/app/(dashboard)/demo/page'
import { demoAnalyses, demoCorrectiveActions } from '../../frontend/src/lib/demo/hfa-demo-data'

const demo = readFileSync('frontend/src/app/(dashboard)/demo/page.tsx', 'utf8')
const actions = readFileSync('frontend/src/app/(dashboard)/actions/page.tsx', 'utf8')
const dashboard = readFileSync('frontend/src/app/(dashboard)/dashboard/page.tsx', 'utf8')
const nav = readFileSync('frontend/src/app/(dashboard)/layout.tsx', 'utf8')
const html = renderToStaticMarkup(React.createElement(DemoPage))
assert.equal(demoAnalyses.length, 10)
assert.equal(demoCorrectiveActions.length, 4)
for (const text of ['Conheça o HFA/SERA na prática','Demonstração · dados fictícios','Simulação isolada','Nenhum dado é salvo','Visão geral','Análises SERA','Gestão de Safety','Perfil de risco']) assert.ok(html.includes(text), `Missing ${text}`)
assert.ok(demo.includes("useState<DemoSection>('overview')"))
assert.ok(demo.includes("setStatuses((current) => ({ ...current, [action.id]: next }))"))
assert.ok(demo.includes('setSelectedCase(item.id)'))
assert.ok(demo.includes('setRiskMonth(e.target.value)'))
assert.ok(!/fetch\(|supabase|\/api\/|localStorage|sessionStorage|indexedDB/i.test(demo), 'Demo must not read or write operational stores or APIs')
assert.ok(!demo.includes('window.location.href'), 'Demo must not navigate to a real event while presenting fictitious identifiers')
assert.ok(nav.includes('me.isAdmin &&') && nav.includes('href="/demo"'), 'Admin navigation must offer the isolated demo')
assert.ok(dashboard.includes('href="/demo"'), 'Admin dashboard must offer presentation entry')
assert.ok(actions.includes("const [showSuggestions, setShowSuggestions] = useState(false)"), 'Large live suggestion list must default to collapsed')
assert.ok(actions.includes('visibleSuggestions.slice(0, suggestionLimit)'), 'Live suggestions must be paginated')
assert.ok(actions.includes('Elas não são ações abertas.'), 'Suggested investigations must not be mistaken for confirmed open Safety actions')
assert.ok(dashboard.includes('const displayCode = groupLabel[p.code.toUpperCase()] ?? p.code'), 'Unexpected precondition identifiers must be mapped')
assert.ok(dashboard.includes('break-words'), 'Long labels must wrap')
for (const page of ['actions/page.tsx','dashboard/page.tsx','events/page.tsx','risk-profile/page.tsx','safety/page.tsx']) {
  const source = readFileSync(`frontend/src/app/(dashboard)/${page}`, 'utf8')
  assert.ok(source.includes('max-w-7xl') && source.includes('px-4'), `Main presentation width needs consistency: ${page}`)
}
console.log('PRESENTATION_DEMO_ISOLATION_PASS: 10 synthetic cases, 4 reversible local actions, UI tab flow and real-data integrity')
