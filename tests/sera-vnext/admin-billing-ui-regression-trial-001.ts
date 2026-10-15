import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldShowConsumerCredits } from '../../frontend/src/lib/product/consumer-credit-visibility'

const read = (path: string) => readFileSync(`frontend/src/${path}`, 'utf8')
const scenarios = [
  { me: { loading: true, verified: false, isAdmin: false, isUnlimited: false, credits: 0 }, show: false },
  { me: { loading: false, verified: true, isAdmin: true, isUnlimited: false, credits: 0 }, show: false },
  { me: { loading: false, verified: true, isAdmin: true, isUnlimited: true, credits: 'unlimited' }, show: false },
  { me: { loading: false, verified: false, isAdmin: false, isUnlimited: false, credits: 0 }, show: false },
  { me: { loading: false, verified: true, isAdmin: false, isUnlimited: false, credits: 0 }, show: true },
  { me: { loading: false, verified: true, isAdmin: false, isUnlimited: false, credits: 2 }, show: true },
] as const
for (const {me,show} of scenarios) assert.equal(shouldShowConsumerCredits(me), show)

const meHook = read('hooks/useMe.ts')
const layout = read('app/(dashboard)/layout.tsx')
const dashboard = read('app/(dashboard)/dashboard/page.tsx')
const trial = read('components/product/TrialUsageCard.tsx')
const newEvent = read('app/(dashboard)/events/new/page.tsx')
const onboarding = read('app/(dashboard)/onboarding/page.tsx')
const credits = read('app/(dashboard)/credits/page.tsx')
const meApi = read('app/api/auth/me/route.ts')
assert.match(meHook, /const MeContext = createContext<Me \| null>\(null\)/)
assert.match(meHook, /function useResolvedMe\(\): Me/)
assert.match(meHook, /export function MeProvider\(/)
assert.match(meHook, /return useContext\(MeContext\) \?\? DEFAULT/)
assert.match(meHook, /cache: 'no-store'/)
assert.match(meHook, /latestRequest/)
assert.match(meHook, /onAuthStateChange/)
assert.match(meHook, /subscription\.unsubscribe\(\)/)
assert.match(layout, /<MeProvider>[\s\S]*<Sidebar[\s\S]*\{children\}[\s\S]*<\/MeProvider>/)
assert.match(layout, /showConsumerCredits && !me\.isUnlimited/)
assert.match(layout, /bottomNav\.filter\(\(item\) => showConsumerCredits \|\| item\.href !== '\/credits'\)/)
assert.match(dashboard, /shouldShowConsumerCredits\(me\) && <TrialUsageCard\s*\/>/)
assert.match(trial, /const showConsumerCredits = shouldShowConsumerCredits\(me\)/)
assert.match(trial, /if \(!showConsumerCredits\) return null/)
assert.match(trial, /if \(used != null \|\| !showConsumerCredits\) return/)
assert.match(newEvent, /const noCredits = shouldShowConsumerCredits\(me\) && !me\.isUnlimited && me\.credits === 0/)
assert.match(newEvent, /analysisMode === 'hfa' && shouldShowConsumerCredits\(me\)/)
assert.match(onboarding, /showTrial \? 'Piloto guiado/)
assert.match(onboarding, /showTrial && <div className="pt-2"><TrialUsageCard compact/)
assert.match(credits, /if \(!showConsumerCredits\)/)
assert.match(meApi, /requireBearerUser\(req\)/)
assert.match(meApi, /is_admin: isAdmin/)
console.log('ADMIN_BILLING_UI_REGRESSION_PASS: verified singleton profile, consistent sidebar/dashboard, all billing surfaces guarded, end-user policy intact')
