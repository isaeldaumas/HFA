import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'
import {
  PLAYWRIGHT_OUTPUT_DIR,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  parsePlaywrightRequestLines,
  pwClickByText,
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

const TRIAL_ID = 'frontend-sera-vnext-e2e-readiness-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'serae2e1'

type Check = {
  name: string
  status: 'PASS'
  detail: string
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
    if (Date.now() - started >= timeoutMs) throw new Error('FRONTEND_SERA_VNEXT_E2E_DOWNLOAD_TIMEOUT')
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

  const checks: Check[] = []

  try {
    pwExec(SESSION_ID, ['open', participant.actionLink, '--browser', 'chromium'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin`])
    await pwWaitForText(SESSION_ID, 'Painel Administrativo', 20_000)
    assert.equal(pwClickByText(SESSION_ID, 'a', 'SERA vNext Beta'), true)
    await pwWaitForText(SESSION_ID, 'SERA vNext análises persistidas', 20_000)
    checks.push({ name: 'beta_list_reached_from_admin', status: 'PASS', detail: 'admin -> beta list' })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'Nova análise'), true)
    await pwWaitForText(SESSION_ID, 'Executar motor vNext v0.1 e persistir', 20_000)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Título"]', `[${TRIAL_ID}] e2e controlled flow`), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Referência da fonte (opcional)"]', TRIAL_ID), true)
    assert.equal(
      pwSetFormValue(
        SESSION_ID,
        'textarea[placeholder="Cole relato factual controlado, sem dados confidenciais."]',
        'Durante a aproximacao final, a tripulacao prosseguiu abaixo do perfil estabilizado ate o aviso de terreno, seguido por arremetida imediata e revisao nao final.',
      ),
      true,
    )
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Criar análise candidate-only'), true)
    const detailUrl = await pwWaitForUrlMatch(SESSION_ID, /\/admin\/sera-vnext\/analyses\/[0-9a-f-]{36}$/i, 20_000)
    const analysisId = detailUrl.split('/').pop() ?? ''
    assert.match(analysisId, /^[0-9a-f-]{36}$/i)
    checks.push({ name: 'analysis_created_via_ui', status: 'PASS', detail: sanitizeId(analysisId) })

    const detailText = await pwWaitForText(SESSION_ID, 'Resultado candidate-only não final.', 20_000)
    assert.match(detailText, /Ponto de fuga candidato/)
    assert.match(detailText, /Percepção \(P\)/)
    assert.match(detailText, /Objetivo \(O\)/)
    assert.match(detailText, /Ação \(A\)/)
    assert.match(detailText, /Precondições/)
    assert.match(detailText, /Histórico auditável/)
    checks.push({ name: 'detail_page_exposes_candidate_and_audit_sections', status: 'PASS', detail: 'POA preconditions reviewer output and audit visible' })

    const interactiveLabels = pwInteractiveLabels(SESSION_ID)
    assert.ok(interactiveLabels.includes('Revisar'))
    assert.ok(interactiveLabels.includes('Reanalisar'))
    assert.ok(interactiveLabels.includes('Export JSON'))
    assert.equal(interactiveLabels.some((label) => /ready|release|classifica/i.test(label)), false)
    checks.push({ name: 'final_release_actions_remain_blocked', status: 'PASS', detail: JSON.stringify(interactiveLabels) })

    assert.equal(pwClickByText(SESSION_ID, 'a', 'Revisar'), true)
    await pwWaitForText(SESSION_ID, 'Registrar decisão não final', 20_000)
    assert.equal(pwSetFormValue(SESSION_ID, 'select', 'RETURN_FOR_REANALYSIS'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'select:nth-of-type(2)', 'INSUFFICIENT'), true)
    assert.equal(
      pwSetFormValue(
        SESSION_ID,
        'textarea[placeholder="Notas de revisão humana (justifique a decisão com base nos eixos acima)"]',
        'E2E readiness flow returned this case for controlled reanalysis.',
      ),
      true,
    )
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Registrar revisão não final'), true)
    const reviewedText = await pwWaitForText(SESSION_ID, 'RETURNED_FOR_REANALYSIS', 20_000)
    assert.match(reviewedText, /REANALYSIS_REQUIRED/)
    checks.push({ name: 'review_flow_persists_non_final_decision', status: 'PASS', detail: 'RETURNED_FOR_REANALYSIS visible' })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Reanalisar'), true)
    const reanalyzedText = await pwWaitForText(SESSION_ID, 'rev 2:', 20_000)
    assert.match(reanalyzedText, /CANDIDATE_ANALYSIS_CREATED/)
    checks.push({ name: 'reanalyze_flow_creates_second_revision', status: 'PASS', detail: 'revision 2 visible' })

    const downloadsBefore = listDownloadFiles()
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Export JSON'), true)
    const downloadFile = await waitForNewDownload(downloadsBefore)
    checks.push({ name: 'export_flow_downloads_json', status: 'PASS', detail: downloadFile })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Arquivar'), true)
    await pwWaitForText(SESSION_ID, 'ARCHIVED', 20_000)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Restaurar'), true)
    await pwWaitForText(SESSION_ID, 'CANDIDATE_ANALYSIS_CREATED', 20_000)
    checks.push({ name: 'archive_and_restore_flow_works', status: 'PASS', detail: 'archive -> restore completed on detail page' })

    assert.equal(pwClickByText(SESSION_ID, 'a', '← Voltar à lista'), true)
    await pwWaitForText(SESSION_ID, 'SERA vNext análises persistidas', 20_000)
    checks.push({ name: 'detail_can_return_to_list', status: 'PASS', detail: 'back link returned to list' })

    const consoleWarnings = pwConsoleWarnings(SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(consoleWarnings), false)
    assert.equal(/hydration/i.test(consoleWarnings), false)
    checks.push({ name: 'ui_finishes_without_console_or_hydration_errors', status: 'PASS', detail: consoleWarnings.replace(/\s+/g, ' ').trim() })

    const requests = parsePlaywrightRequestLines(pwRequests(SESSION_ID))
    for (const [suffix, expectedStatus] of [
      ['/api/admin/sera-vnext/analyses', 201],
      [`/api/admin/sera-vnext/analyses/${analysisId}`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/reviews`, 201],
      [`/api/admin/sera-vnext/analyses/${analysisId}/reanalyze`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/export`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/archive`, 200],
      [`/api/admin/sera-vnext/analyses/${analysisId}/restore`, 200],
    ] as const) {
      assert.ok(requests.some((request) => request.url.includes(suffix) && request.status === expectedStatus), `missing ${suffix}`)
    }
    checks.push({ name: 'network_timeline_matches_expected_beta_routes', status: 'PASS', detail: `requests=${requests.length}` })
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
    participantId: participant.participantId,
    checks,
  }

  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  console.log('FRONTEND_SERA_VNEXT_E2E_READINESS_OK')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
