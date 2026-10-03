import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

const route = read('frontend/src/app/api/safety/overview/route.ts')
const page = read('frontend/src/app/(dashboard)/safety/page.tsx')
const layout = read('frontend/src/app/(dashboard)/layout.tsx')

assert.match(route, /from\('events'\)/)
assert.match(route, /from\('event_risk_assessments'\)/)
assert.match(route, /from\('corrective_actions'\)/)
assert.match(route, /residual_improved/)
assert.match(route, /overdue_actions/)
assert.match(route, /UNTRIAGED/)
assert.match(route, /CRITICO/)

assert.match(page, /Visão executiva de Safety/)
assert.match(page, /Atenção imediata/)
assert.match(page, /Especialização HFA preservada/)
assert.match(page, /\/risk-profile/)

assert.match(layout, /href: '\/safety'/)
assert.match(layout, /labelKey: 'nav\.safety'/)

console.log('Safety Intelligence contract: PASS')
