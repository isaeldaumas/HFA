import assert from 'node:assert/strict'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import {
  apiJson,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  createMagicLinkSession,
  pwClickByText,
  pwExec,
  pwInteractiveLabels,
  pwSetCheckbox,
  pwSetFormValue,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'frontend-navigation-readiness-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'navready1'

type Check = {
  name: string
  status: 'PASS'
  detail: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const enterpriseApi = await createMagicLinkSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const preCreated = await apiJson<{ analysis?: { id?: string } }>({
    baseUrl,
    path: '/api/admin/sera-vnext/analyses',
    method: 'POST',
    token: enterpriseApi.accessToken,
    body: {
      title: `[${TRIAL_ID}] navigation anchor`,
      narrative: 'Durante a aproximacao em IMC, a tripulacao manteve a descida alem do perfil estabilizado ate o alerta sonoro, sem liberar qualquer saida final.',
      sourceType: 'INTERNAL_PILOT',
      sourceReference: TRIAL_ID,
      clientRequestId: `${TRIAL_ID}-${Date.now()}`,
      metadata: { internalUseConfirmed: true },
    },
  })
  assert.equal(preCreated.status, 201)
  const existingAnalysisId = String(preCreated.json.analysis?.id ?? '')
  assert.match(existingAnalysisId, /^[0-9a-f-]{36}$/i)

  const enterpriseBrowser = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: Check[] = []

  try {
    pwExec(SESSION_ID, ['open', enterpriseBrowser.actionLink, '--browser', 'chromium'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin`])
    await pwWaitForText(SESSION_ID, 'Painel Administrativo', 20_000)
    const labels = pwInteractiveLabels(SESSION_ID)
    assert.ok(labels.includes('SERA vNext Beta'))
    checks.push({ name: 'admin_menu_exposes_product_beta_entry', status: 'PASS', detail: 'SERA vNext Beta present in admin nav' })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'SERA vNext Beta'), true)
    await pwWaitForText(SESSION_ID, 'SERA vNext análises persistidas', 20_000)
    checks.push({ name: 'admin_nav_reaches_beta_list', status: 'PASS', detail: '/admin/sera-vnext/analyses loaded from nav' })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'Nova analise'), false)
    assert.equal(pwClickByText(SESSION_ID, 'a', 'Nova análise'), true)
    await pwWaitForText(SESSION_ID, 'Executar motor vNext v0.1 e persistir', 20_000)
    checks.push({ name: 'list_cta_reaches_create_page', status: 'PASS', detail: '/admin/sera-vnext/analyses/new loaded' })

    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Titulo"]', `[${TRIAL_ID}] created from nav`), false)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Título"]', `[${TRIAL_ID}] created from nav`), true)
    assert.equal(
      pwSetFormValue(
        SESSION_ID,
        'textarea[placeholder="Cole relato factual controlado, sem dados confidenciais."]',
        'A tripulacao prosseguiu abaixo do perfil estabilizado ate o alarme de terreno, quando a arremetida interrompeu a sequencia nao final.',
      ),
      true,
    )
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Criar analise candidate-only'), false)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Criar análise candidate-only'), true)
    const createdUrl = await pwWaitForUrlMatch(SESSION_ID, /\/admin\/sera-vnext\/analyses\/[0-9a-f-]{36}$/i, 20_000)
    const createdAnalysisId = createdUrl.split('/').pop() ?? ''
    assert.match(createdAnalysisId, /^[0-9a-f-]{36}$/i)
    checks.push({ name: 'create_page_pushes_to_detail', status: 'PASS', detail: sanitizeId(createdAnalysisId) })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'Voltar a lista'), false)
    assert.equal(pwClickByText(SESSION_ID, 'a', '← Voltar à lista'), true)
    await pwWaitForText(SESSION_ID, 'SERA vNext análises persistidas', 20_000)
    checks.push({ name: 'detail_has_back_link_to_list', status: 'PASS', detail: 'detail -> list link works' })

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/${existingAnalysisId}/review`])
    await pwWaitForText(SESSION_ID, 'Registrar decisao nao final', 5_000).catch(async () => {
      await pwWaitForText(SESSION_ID, 'Registrar decisão não final', 20_000)
    })
    assert.equal(pwClickByText(SESSION_ID, 'a', '← Voltar ao detalhe'), true)
    await pwWaitForText(SESSION_ID, 'Resultado candidate-only nao final.', 5_000).catch(async () => {
      await pwWaitForText(SESSION_ID, 'Resultado candidate-only não final.', 20_000)
    })
    checks.push({ name: 'review_has_back_link_to_detail', status: 'PASS', detail: 'review -> detail link works' })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'Ir ao dashboard'), true)
    await pwWaitForText(SESSION_ID, 'Primeiros passos no HFA/SERA', 20_000)
    checks.push({ name: 'detail_has_link_back_to_company_dashboard', status: 'PASS', detail: '/dashboard loaded from detail' })
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
    existingAnalysisIdSanitized: sanitizeId(existingAnalysisId),
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('FRONTEND_NAVIGATION_READINESS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
