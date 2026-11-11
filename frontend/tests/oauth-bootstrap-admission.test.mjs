import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'

const bootstrap = readFileSync(new URL('../src/app/api/auth/oauth/bootstrap/route.ts', import.meta.url), 'utf8')
const register = readFileSync(new URL('../src/lib/server/register-handler.ts', import.meta.url), 'utf8')
const wrapper = readFileSync(new URL('../src/app/api/auth/register/route.ts', import.meta.url), 'utf8')

test('OAuth bootstrap requires an already-provisioned membership and never creates trial tenants', () => {
  assert.match(bootstrap, /resolveAuthorizedUserContext\(admin/)
  assert.match(bootstrap, /if \(!foundTenantId\)\s*\{\s*return buildFailureResponse\(/)
  assert.match(bootstrap, /stage: 'provisioned_membership_required'/)
  assert.match(bootstrap, /reason: 'oauth_self_provisioning_disabled'/)
  assert.match(bootstrap, /tenantId = foundTenantId/)
  assert.doesNotMatch(bootstrap, /\.from\('tenants'\)\s*\.insert\(/)
  assert.doesNotMatch(bootstrap, /\.from\('users'\)\s*\.insert\(/)
  assert.doesNotMatch(bootstrap, /DEFAULT_TRIAL_LIMIT|DEFAULT_TRIAL_DAYS/)
})

test('public registration cannot bypass the disabled invitation gate or auto-confirm emails', () => {
  assert.match(wrapper, /handleRegisterRequest/)
  const earlyGate = register.indexOf("process.env.HFA_REGISTRATION_INVITES_READY !== 'true'")
  const requestParsing = register.indexOf('await readLimitedRegistrationBody(req)')
  const connection = register.indexOf('const admin = deps.createAdminClient')
  assert.ok(earlyGate > 0 && requestParsing > earlyGate && connection > requestParsing)
  assert.match(register, /inviteUserByEmail\(email/)
  assert.doesNotMatch(register, /email_confirm:\s*true|\.createUser\(/)
  assert.match(register, /verifyRegistrationTurnstile/)
})
