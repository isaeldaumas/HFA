import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  createMagicLinkSession,
  pwEval,
  pwExec,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'frontend-responsive-readiness-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'responsive1'

type Check = {
  name: string
  status: 'PASS'
  detail: string
}

type ViewportProbe = {
  label: string
  width: number
  height: number
  route: string
  expectedText: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function verifyViewport(sessionId: string, probe: ViewportProbe): Promise<string> {
  pwExec(sessionId, ['resize', String(probe.width), String(probe.height)])
  pwExec(sessionId, ['goto', probe.route])
  await pwWaitForText(sessionId, probe.expectedText, 20_000)
  await sleep(500)

  const metrics = pwEval<{
    width: number
    height: number
    scrollWidth: number
    overflowX: boolean
    buttonCount: number
  }>(
    sessionId,
    `(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 4,
      buttonCount: document.querySelectorAll('button, a').length,
    }))()`,
  )

  assert.equal(metrics.overflowX, false, `${probe.label} overflow`)
  assert.ok(metrics.buttonCount > 0, `${probe.label} buttons/links`)
  return `${probe.label}: ${metrics.width}x${metrics.height} buttons=${metrics.buttonCount}`
}

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterpriseApi = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const created = await apiJson<{ analysis?: { id?: string } }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterpriseApi.accessToken,
    body: {
      title: `[${TRIAL_ID}] responsive anchor`,
      narrative: 'Durante a aproximacao estabilizada, o PF e o PM demoraram a romper a continuidade da descida ate o aviso sonoro e a arremetida nao final.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId: `${TRIAL_ID}-${Date.now()}`,
      metadata: { internalUseConfirmed: true },
    },
  })
  assert.equal(created.status, 201)
  const analysisId = String(created.json.analysis?.id ?? '')
  assert.match(analysisId, /^[0-9a-f-]{36}$/i)

  const enterpriseBrowser = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Check[] = []

  try {
    pwExec(SESSION_ID, ['open', enterpriseBrowser.actionLink, '--browser', 'firefox'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)

    const probes: ViewportProbe[] = [
      {
        label: 'desktop_dashboard',
        width: 1440,
        height: 960,
        route: `${baseUrl}/dashboard`,
        expectedText: 'Primeiros passos no HFA/SERA',
      },
      {
        label: 'tablet_beta_list',
        width: 1024,
        height: 768,
        route: `${baseUrl}/admin/sera-vnext/analyses`,
        expectedText: 'SERA vNext análises persistidas',
      },
      {
        label: 'mobile_review_page',
        width: 390,
        height: 844,
        route: `${baseUrl}/admin/sera-vnext/analyses/${analysisId}/review`,
        expectedText: 'Registrar decisão não final',
      },
    ]

    for (const probe of probes) {
      const detail = await verifyViewport(SESSION_ID, probe)
      checks.push({ name: `responsive_${probe.label}`, status: 'PASS', detail })
    }

  const reviewBody = pwEval<string>(SESSION_ID, 'document.body.innerText')
  assert.match(reviewBody, /Registrar decisão não final/)
  assert.match(reviewBody, /Checklist de decisão|CHECKLIST DE DECISÃO/)
  checks.push({ name: 'mobile_review_page_remains_usable', status: 'PASS', detail: 'review page key sections visible on mobile width' })
  } finally {
    try {
      pwExec(SESSION_ID, ['close'])
    } catch {
      // ignore cleanup failures
    }
  }

  const report = {
    trialId: TRIAL_ID,
    baseUrl,
    analysisIdSanitized: sanitizeId(analysisId),
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('FRONTEND_RESPONSIVE_READINESS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
