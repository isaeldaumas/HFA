/**
 * Start this process with NEXT_PUBLIC_API_URL set to a different origin.
 * Signup/tenant-bootstrap must NOT route there and bypass the Next.js WAF.
 */
import assert from 'node:assert/strict'
import { resolveApiUrl } from '../../../frontend/src/lib/api'

assert.equal(process.env.NEXT_PUBLIC_API_URL,
  'https://legacy-not-trusted.example', 'TEST_MUST_SET_LEGACY_ORIGIN')
for (const [input, expected] of [
  ['/auth/register', '/api/auth/register'],
  ['/auth/register/', '/api/auth/register'],
  ['/auth/bootstrap', '/api/auth/bootstrap'],
  ['/auth/oauth/bootstrap', '/api/auth/oauth/bootstrap'],
  ['/events', '/api/events'],
  ['/analyses/123', '/api/analyses/123'],
]) {
  assert.equal(resolveApiUrl(input), expected, 'Canonical routing failed for '+input)
}
assert.equal(resolveApiUrl('/auth/login'), 'https://legacy-not-trusted.example/auth/login',
  'Legacy login routing must not be changed accidentally')
console.log('CANONICAL_SIGNUP_SAME_ORIGIN_REGRESSION_PASS', {
  legacyHostConfigured: true,
  routesBoundToNextOrigin: 6,
  remoteNetworkAccess: false,
})
