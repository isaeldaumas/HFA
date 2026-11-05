/**
 * Read-only HFA Git/Vercel release drift preflight.
 * Never changes Git, project configuration, deployments, aliases, or data.
 *
 * Usage: node scripts/hfa-vercel-github-drift-readonly.mjs --live
 */
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const PROJECT_ID = 'prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa'
const PRODUCTION_ALIAS = 'systemhfa.vercel.app'
const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value)

export function parseGithubRemote(remote) {
  const match = String(remote || '').trim().replace(/\.git$/, '')
    .match(/^(?:https:\/\/github\.com\/|git@github\.com:)([a-z0-9_.-]+)\/([a-z0-9_.-]+)$/i)
  return match ? { owner: match[1], repo: match[2] } : null
}

export function evaluateDeploymentReadiness(input) {
  const { project, deployment, origin, mainSha, previews = [], capturedAt } = input
  const expected = parseGithubRemote(origin)
  const linked = project?.link ? { owner: project.link.org, repo: project.link.repo } : null
  const repoAligned = Boolean(expected && linked &&
    expected.owner.toLowerCase() === String(linked.owner).toLowerCase() &&
    expected.repo.toLowerCase() === String(linked.repo).toLowerCase())
  const active = (project?.latestDeployments || [])
    .find(x => x.id === deployment?.id && x.target === 'production')
  const productionSha = active?.meta?.githubCommitSha ?? active?.meta?.gitCommitSha ?? null
  const aliasVerified = Boolean(active && deployment?.readyState === 'READY' &&
    deployment?.target === 'production')
  const parity = Boolean(aliasVerified && isSha(mainSha) && productionSha === mainSha)
  const latest = previews.reduce((a, x) => Math.max(a, Number(x.createdAt) || 0), 0)
  // Check only the environment variable name and target. Never read its value.
  const operatorAllowlistConfigured = Array.isArray(project?.env) && project.env.some(
    row => row.key === 'HFA_PLATFORM_ADMIN_AUTH_USER_IDS' &&
      Array.isArray(row.target) && row.target.includes('production'),
  )
  const checks = [
    { id: 'GIT_LINK_MATCHES_ORIGIN', status: repoAligned ? 'PASS' : 'BLOCKED' },
    { id: 'PRODUCTION_ALIAS_CONFIRMED', status: aliasVerified ? 'PASS' : 'NOT_VERIFIED' },
    { id: 'RELEASE_SHA_PARITY', status: parity ? 'PASS' : 'BLOCKED' },
    { id: 'PLATFORM_ADMIN_ALLOWLIST_CONFIGURED', status: operatorAllowlistConfigured ? 'PASS' : 'BLOCKED' },
    { id: 'DEDICATED_STAGING_WITH_TWO_TENANTS', status: 'NOT_VERIFIED' },
  ]
  return {
    capturedAt: capturedAt || null,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    rootDirectory: project?.rootDirectory ?? null,
    expectedRepository: expected,
    linkedRepository: linked,
    productionBranch: project?.link?.productionBranch ?? null,
    configuration: { platformAdminAllowlistPresentInProduction: operatorAllowlistConfigured },
    deployment: {
      id: deployment?.id ?? null, readyState: deployment?.readyState ?? null,
      sha: productionSha, githubMainSha: isSha(mainSha) ? mainSha : null,
    },
    preview: { count: previews.length, newestAt: latest ? new Date(latest).toISOString() : null,
      validatesStaging: false },
    checks,
    overall: checks.every(x => x.status === 'PASS') ? 'READY_FOR_FURTHER_REVIEW' : 'BLOCKED',
    mergeAuthorized: false, productionDeploymentAuthorized: false,
    liveTenantE2E: 'NOT_RUN', scientificValidationV04: 'NOT_RUN',
  }
}

function readOnly(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}
function parse(value) { return JSON.parse(value) }

export function inspectLiveReadOnly() {
  const origin = readOnly('git', ['remote', 'get-url', 'origin'])
  if (!parseGithubRemote(origin)) throw new Error('Origin GitHub URL unverified')
  const mainSha = readOnly('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'])
    .split(/\s+/)[0]
  if (!isSha(mainSha)) throw new Error('Github main SHA unverified')
  const project = parse(readOnly('vercel', ['api', '/v9/projects/' + PROJECT_ID]))
  if (project.id !== PROJECT_ID) throw new Error('Unexpected Vercel project')
  const deployment = parse(readOnly('vercel', [
    'inspect', PRODUCTION_ALIAS, '--format=json',
  ]))
  if (deployment.name !== project.name) throw new Error('Production alias project mismatch')
  const history = parse(readOnly('vercel', [
    'api', '/v7/deployments?projectId=' + PROJECT_ID + '&target=preview&limit=25',
  ]))
  return evaluateDeploymentReadiness({
    project, deployment, origin, mainSha,
    previews: history.deployments || [], capturedAt: new Date().toISOString(),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--live') {
    console.log('Usage: node scripts/hfa-vercel-github-drift-readonly.mjs --live')
  } else {
    try {
      const report = inspectLiveReadOnly()
      console.log(JSON.stringify(report, null, 2))
      if (report.overall !== 'READY_FOR_FURTHER_REVIEW') process.exitCode = 2
    } catch (error) {
      // Do not print raw CLI errors: they may contain private connection data.
      console.error('READ_ONLY_PREFLIGHT_NOT_VERIFIED',
        error instanceof Error ? error.name : typeof error)
      process.exitCode = 3
    }
  }
}