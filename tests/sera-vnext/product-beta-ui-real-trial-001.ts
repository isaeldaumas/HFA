import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import {
  PLAYWRIGHT_OUTPUT_DIR,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  pwClickByText,
  parsePlaywrightRequestLines,
  pwConsoleWarnings,
  pwExec,
  pwInteractiveLabels,
  pwRequests,
  pwSetCheckbox,
  pwSetFormValue,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from './product-beta-real-helpers'

const TRIAL_ID = 'product-beta-ui-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'pbui1'

type TrialCheck = {
  name: string
  status: 'PASS'
  detail: string
}

type TrialReport = {
  trialId: string
  baseUrl: string
  participantId: string
  analysisIdSanitized: string
  downloadFile: string | null
  checks: TrialCheck[]
  summary: Record<string, unknown>
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function playwrightDownloadDir(): string {
  return path.join(PLAYWRIGHT_OUTPUT_DIR, '.playwright-cli')
}

function listDownloadFiles(): string[] {
  const dir = playwrightDownloadDir()
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort()
}

async function waitForNewDownload(before: string[], timeoutMs = 15_000): Promise<string> {
  const started = Date.now()
  for (;;) {
    const after = listDownloadFiles()
    const created = after.find((file) => !before.includes(file))
    if (created) return created
    if (Date.now() - started >= timeoutMs) {
      throw new Error('PLAYWRIGHT_DOWNLOAD_TIMEOUT')
    }
    await sleep(250)
  }
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const participant = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const checks: TrialCheck[] = []

  try {
    pwExec(SESSION_ID, ['open', participant.actionLink, '--browser', 'chromium'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000) // SDK sets session in localStorage from hash before goto fires

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/new`])
    const newText = await pwWaitForText(SESSION_ID, 'Executar motor vNext v0.1 e persistir', 20_000)
    assert.match(newText, /Resultado candidate-only não final\./)
    assert.match(newText, /Criar análise candidate-only/)
    checks.push({ name: 'new_page_loads', status: 'PASS', detail: 'create page visible' })
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Título"]', '[SERA_VNEXT_CONTROLLED_PILOT] UI smoke — automation boundary'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Referência da fonte (opcional)"]', TRIAL_ID), true)
    assert.equal(
      pwSetFormValue(
        SESSION_ID,
        'textarea[placeholder="Cole relato factual controlado, sem dados confidenciais."]',
        'Durante a aproximação com automação acoplada, o PF manteve a descida além do perfil estabilizado enquanto o PM demorou a intervir, até o alarme de terreno e a arremetida imediata.',
      ),
      true,
    )
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Criar análise candidate-only'), true)
    const createdUrl = await pwWaitForUrlMatch(SESSION_ID, /\/admin\/sera-vnext\/analyses\/[0-9a-f-]{36}$/i, 20_000)
    const analysisId = createdUrl.split('/').pop() ?? ''
    assert.match(analysisId, /^[0-9a-f-]{36}$/i)
    checks.push({ name: 'create_form_saves_analysis', status: 'PASS', detail: `analysis=${sanitizeId(analysisId)}` })

    const detailText = await pwWaitForText(SESSION_ID, 'Resultado candidate-only não final.', 20_000)
    assert.match(detailText, /Histórico auditável/)
    assert.match(detailText, /Ponto de fuga candidato/)
    assert.match(detailText, /Revisions/)
    assert.match(detailText, /Reviews/)
    checks.push({ name: 'detail_page_shows_engine_output', status: 'PASS', detail: 'candidate-only detail and audit history visible' })

    const interactiveLabels = pwInteractiveLabels(SESSION_ID)
    assert.ok(interactiveLabels.includes('Revisar'))
    assert.ok(interactiveLabels.includes('Reanalisar'))
    assert.ok(interactiveLabels.includes('Export JSON'))
    assert.equal(interactiveLabels.some((label) => /ready|release|classifica/i.test(label)), false)
    checks.push({ name: 'final_actions_absent', status: 'PASS', detail: JSON.stringify(interactiveLabels) })

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/${analysisId}/review`])
    await pwWaitForText(SESSION_ID, 'Registrar decisão não final', 20_000)
    assert.equal(pwSetFormValue(SESSION_ID, 'select', 'RETURN_FOR_REANALYSIS'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'select:nth-of-type(2)', 'INSUFFICIENT'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'textarea[placeholder="Notas de revisão humana (justifique a decisão com base nos eixos acima)"]', 'UI smoke requested a non-final reanalysis.'), true)
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Registrar revisão não final'), true)
    const reviewedText = await pwWaitForText(SESSION_ID, 'RETURNED_FOR_REANALYSIS', 20_000)
    assert.match(reviewedText, /REANALYSIS_REQUIRED/)
    checks.push({ name: 'review_page_submits_decision', status: 'PASS', detail: 'RETURNED_FOR_REANALYSIS visible' })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Reanalisar'), true)
    const reanalyzedText = await pwWaitForText(SESSION_ID, 'rev 2:', 20_000)
    assert.match(reanalyzedText, /CANDIDATE_ANALYSIS_CREATED/)
    checks.push({ name: 'reanalyze_creates_revision_2', status: 'PASS', detail: 'revision 2 visible' })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Arquivar'), true)
    await pwWaitForText(SESSION_ID, 'ARCHIVED', 20_000)
    checks.push({ name: 'archive_reflects_in_detail', status: 'PASS', detail: 'ARCHIVED visible' })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Restaurar'), true)
    const restoredText = await pwWaitForText(SESSION_ID, 'CANDIDATE_ANALYSIS_CREATED', 20_000)
    assert.match(restoredText, /RETURNED_FOR_REANALYSIS|NOT_REVIEWED/)
    checks.push({ name: 'restore_reflects_in_detail', status: 'PASS', detail: 'restored status visible' })

    const downloadsBefore = listDownloadFiles()
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Export JSON'), true)
    const downloadFile = await waitForNewDownload(downloadsBefore)
    checks.push({ name: 'export_downloads_json', status: 'PASS', detail: downloadFile })

    const warnings = pwConsoleWarnings(SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(warnings), false)
    checks.push({ name: 'console_errors_absent', status: 'PASS', detail: warnings.replace(/\s+/g, ' ').trim() })

    const requests = parsePlaywrightRequestLines(pwRequests(SESSION_ID))
    for (const [suffix, expectedStatus] of [
      ['/api/admin/sera-vnext/analyses', 201],
      [`/api/admin/sera-vnext/analyses/${analysisId}/reviews`, 201],
      [`/api/admin/sera-vnext/analyses/${analysisId}/reanalyze`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/archive`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/restore`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/export`, 200],
    ] as const) {
      assert.ok(requests.some((request) => request.url.includes(suffix) && request.status === expectedStatus), `missing ${suffix}`)
    }
    checks.push({ name: 'network_requests_match_expected_routes', status: 'PASS', detail: `requests=${requests.length}` })

    const report: TrialReport = {
      trialId: TRIAL_ID,
      baseUrl,
      participantId: participant.participantId,
      analysisIdSanitized: sanitizeId(analysisId),
      downloadFile,
      checks,
      summary: {
        tenantIdSanitized: sanitizeId(participant.tenantId),
        authUserIdSanitized: sanitizeId(participant.authUserId),
        publicUserIdSanitized: sanitizeId(participant.publicUserId),
        warningSummary: warnings.replace(/\s+/g, ' ').trim(),
        requestCount: requests.length,
      },
    }

    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ reportPath, ...report }, null, 2))
    console.log('PRODUCT_BETA_UI_REAL_OK')
  } finally {
    try {
      pwExec(SESSION_ID, ['close'])
    } catch {
      // ignore close errors
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
