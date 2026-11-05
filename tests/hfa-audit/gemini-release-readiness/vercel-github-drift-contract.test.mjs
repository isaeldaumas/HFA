import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateDeploymentReadiness, parseGithubRemote,
} from '../../../scripts/hfa-vercel-github-drift-readonly.mjs'

const CURRENT='a'.repeat(40)
const OLD='b'.repeat(40)
function fixture() {
  return {
    project: {
      id: 'prj-synthetic', name: 'systemhfa', rootDirectory: 'frontend',
      link: { org: 'isaeldaumas', repo: 'HFA', productionBranch: 'main' },
      latestDeployments: [{
        id: 'dpl-synthetic', target: 'production', meta: { githubCommitSha: CURRENT },
      }],
    },
    deployment: {
      id: 'dpl-synthetic', name: 'systemhfa',
      readyState: 'READY', target: 'production',
    },
    origin: 'https://github.com/isaeldaumas/HFA.git',
    mainSha: CURRENT,
    previews: [],
    capturedAt: '2026-11-05T14:00:00.000Z',
  }
}

test('GitHub repository only accepts SSH or HTTPS to github.com', () => {
  assert.deepEqual(parseGithubRemote('git@github.com:isaeldaumas/HFA.git'),
    { owner: 'isaeldaumas', repo: 'HFA' })
  assert.equal(parseGithubRemote('https://malicious.example/isaeldaumas/HFA'), null)
})

test('even a current READY production deployment does not prove staging', () => {
  const result = evaluateDeploymentReadiness(fixture())
  assert.equal(result.checks[0].status, 'PASS')
  assert.equal(result.checks[2].status, 'PASS')
  assert.equal(result.checks[4].status, 'NOT_VERIFIED')
  assert.equal(result.overall, 'BLOCKED')
  assert.equal(result.productionDeploymentAuthorized, false)
})

test('missing global-admin allowlist blocks platform-admin readiness without reading a secret', () => {
  const input = fixture()
  const missing = evaluateDeploymentReadiness(input)
  assert.equal(missing.checks[3].status, 'BLOCKED')
  assert.equal(missing.configuration.platformAdminAllowlistPresentInProduction, false)
  input.project.env = [{ key: 'HFA_PLATFORM_ADMIN_AUTH_USER_IDS', target: ['production'], value: 'do-not-print' }]
  const configured = evaluateDeploymentReadiness(input)
  assert.equal(configured.checks[3].status, 'PASS')
  assert.equal(configured.configuration.platformAdminAllowlistPresentInProduction, true)
  assert.ok(!JSON.stringify(configured).includes('do-not-print'))
})

test('different repository owner is a confirmed source mismatch', () => {
  const input = fixture()
  input.project.link.org = 'system-hfa'
  const result = evaluateDeploymentReadiness(input)
  assert.equal(result.checks[0].status, 'BLOCKED')
})

test('older production SHA does not become current merely because READY', () => {
  const input = fixture()
  input.project.latestDeployments[0].meta.githubCommitSha = OLD
  const result = evaluateDeploymentReadiness(input)
  assert.equal(result.checks[2].status, 'BLOCKED')
})

test('alias pointing to a different deployment is not verified', () => {
  const input = fixture()
  input.deployment.id = 'dpl-other'
  const result = evaluateDeploymentReadiness(input)
  assert.equal(result.checks[1].status, 'NOT_VERIFIED')
})

test('preview deployments do not prove independent staging or live QA', () => {
  const input = fixture()
  input.previews = [{
    id: 'dpl-preview', createdAt: Date.parse('2026-10-14T09:00:00Z'),
    readyState: 'READY',
  }]
  const result = evaluateDeploymentReadiness(input)
  assert.equal(result.preview.count, 1)
  assert.equal(result.preview.validatesStaging, false)
  assert.equal(result.liveTenantE2E, 'NOT_RUN')
})

test('no report can independently grant merge, production or scientific release', () => {
  const result = evaluateDeploymentReadiness(fixture())
  assert.equal(result.mergeAuthorized, false)
  assert.equal(result.productionDeploymentAuthorized, false)
  assert.equal(result.scientificValidationV04, 'NOT_RUN')
})
