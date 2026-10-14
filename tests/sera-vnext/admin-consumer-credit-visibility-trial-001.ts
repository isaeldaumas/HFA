import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowConsumerCredits } from '../../frontend/src/lib/product/consumer-credit-visibility'

assert.equal(shouldShowConsumerCredits({ loading:true, isAdmin:false }), false, 'Never show the trial card before the verified role loads')
assert.equal(shouldShowConsumerCredits({ loading:false, isAdmin:true }), false, 'Administrators must not see customer credits')
assert.equal(shouldShowConsumerCredits({ loading:false, isAdmin:false }), true, 'Ordinary accounts retain billing/trial visibility')

const dashboard = readFileSync('frontend/src/app/(dashboard)/dashboard/page.tsx','utf8')
const sidebar = readFileSync('frontend/src/app/(dashboard)/layout.tsx','utf8')
assert.match(dashboard, /shouldShowConsumerCredits\(me\) && <TrialUsageCard\s*\/>/, 'Dashboard must honor the admin visibility policy')
assert.match(sidebar, /showConsumerCredits && !me\.isUnlimited/, 'Sidebar trial balance must honor the admin policy')
assert.match(sidebar, /bottomNav\.filter\(\(item\) => showConsumerCredits \|\| item\.href !== '\/credits'\)/, 'Admin sidebar must hide customer billing nav')
assert.match(sidebar, /const noCredits = showConsumerCredits &&/, 'Admin new-event CTA must not be hidden due to a trial balance display')
console.log('ADMIN_CREDIT_VISIBILITY_PASS')
