import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { resolveTestTenantPrefix } from './helpers/resolve-test-tenant-prefix'
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

const TRIAL_ID = 'controlled-pilot-ui-real-trial-001'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'cpui1'

type UiPilotReport = {
  trialId: string
  participantId: string
  baseUrl: string
  analysisIdSanitized: string
  routeChecks: Array<{ route: string; status: 'PASS'; detail: string }>
  networkChecks: Array<{ endpoint: string; status: 'PASS'; detail: string }>
  observability: {
    consoleWarnings: string
    requestCount: number
    auditTimelineVisible: boolean
    nonFinalMarkerVisible: boolean
    finalButtonsAbsent: boolean
  }
  downloadFile: string | null
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
    if (Date.now() - started >= timeoutMs) throw new Error('CONTROLLED_PILOT_UI_DOWNLOAD_TIMEOUT')
    await sleep(250)
  }
}

async function main() {
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)

  const participant = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'PILOT-ADMIN-01',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })

  const routeChecks: UiPilotReport['routeChecks'] = []
  const networkChecks: UiPilotReport['networkChecks'] = []

  try {
    pwExec(SESSION_ID, ['open', participant.actionLink, '--browser', 'firefox'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000) // SDK sets session in localStorage from hash before goto fires

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses`])
    const listText = await pwWaitForText(SESSION_ID, 'SERA vNext análises persistidas', 20_000)
    assert.match(listText, /Nenhuma classificação final é liberada\.|Candidate-only persistente, auditável/)
    routeChecks.push({ route: '/admin/sera-vnext/analyses', status: 'PASS', detail: 'list loaded for named admin' })

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/new`])
    await pwWaitForText(SESSION_ID, 'Executar motor vNext v0.1 e persistir', 20_000)
    const pilotTitle = '[SERA_VNEXT_CONTROLLED_PILOT] UI pilot — PF/PM ambiguity'
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Título"]', pilotTitle), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder="Referência da fonte (opcional)"]', TRIAL_ID), true)
    assert.equal(
      pwSetFormValue(
        SESSION_ID,
        'textarea[placeholder="Cole relato factual controlado, sem dados confidenciais."]',
        'Os registros disponíveis divergem sobre quem estava efetivamente voando a aeronave no momento em que o perfil estabilizado foi perdido, e a coordenação PF/PM permaneceu ambígua até a arremetida.',
      ),
      true,
    )
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Criar análise candidate-only'), true)
    const detailUrl = await pwWaitForUrlMatch(SESSION_ID, /\/admin\/sera-vnext\/analyses\/[0-9a-f-]{36}$/i, 20_000)
    const analysisId = detailUrl.split('/').pop() ?? ''
    routeChecks.push({ route: '/admin/sera-vnext/analyses/new', status: 'PASS', detail: `created ${sanitizeId(analysisId)}` })

    const detailText = await pwWaitForText(SESSION_ID, 'Resultado candidate-only não final.', 20_000)
    assert.match(detailText, /Histórico auditável/)
    assert.match(detailText, /Incertezas/)
    assert.match(detailText, /Revisions/)
    assert.match(detailText, /Reviews/)
    routeChecks.push({ route: `/admin/sera-vnext/analyses/${analysisId}`, status: 'PASS', detail: 'detail shows audit history and uncertainties' })

    const labels = pwInteractiveLabels(SESSION_ID)
    const finalButtonsAbsent = !labels.some((label) => /ready|release|classifica/i.test(label))
    assert.equal(finalButtonsAbsent, true)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses/${analysisId}/review`])
    await pwWaitForText(SESSION_ID, 'Registrar decisão não final', 20_000)
    assert.equal(pwSetFormValue(SESSION_ID, 'select', 'RETURN_FOR_REANALYSIS'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'select:nth-of-type(2)', 'INSUFFICIENT'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'textarea[placeholder="Notas de revisão humana (justifique a decisão com base nos eixos acima)"]', 'Pilot UI review returned the case for reanalysis.'), true)
    assert.equal(pwSetCheckbox(SESSION_ID, 'input[type="checkbox"]', true), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Registrar revisão não final'), true)
    const reviewedText = await pwWaitForText(SESSION_ID, 'RETURNED_FOR_REANALYSIS', 20_000)
    assert.match(reviewedText, /REANALYSIS_REQUIRED/)
    routeChecks.push({ route: `/admin/sera-vnext/analyses/${analysisId}/review`, status: 'PASS', detail: 'review persisted from real browser session' })

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Reanalisar'), true)
    const reanalyzedText = await pwWaitForText(SESSION_ID, 'rev 2:', 20_000)
    assert.match(reanalyzedText, /CANDIDATE_ANALYSIS_CREATED/)

    assert.equal(pwClickByText(SESSION_ID, 'button', 'Arquivar'), true)
    await pwWaitForText(SESSION_ID, 'ARCHIVED', 20_000)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Restaurar'), true)
    await pwWaitForText(SESSION_ID, 'CANDIDATE_ANALYSIS_CREATED', 20_000)

    const downloadsBefore = listDownloadFiles()
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Export JSON'), true)
    const downloadFile = await waitForNewDownload(downloadsBefore)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/admin/sera-vnext/analyses`])
    const restoredListText = await pwWaitForText(SESSION_ID, pilotTitle, 20_000)
    assert.match(restoredListText, /SERA vNext análises persistidas/)

    const consoleWarnings = pwConsoleWarnings(SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(consoleWarnings), false)

    const requests = parsePlaywrightRequestLines(pwRequests(SESSION_ID))
    networkChecks.push({ endpoint: '/api/admin/sera-vnext/analyses/*', status: 'PASS', detail: `requests=${requests.length}` })

    const report: UiPilotReport = {
      trialId: TRIAL_ID,
      participantId: participant.participantId,
      baseUrl,
      analysisIdSanitized: sanitizeId(analysisId),
      routeChecks,
      networkChecks,
      observability: {
        consoleWarnings: consoleWarnings.replace(/\s+/g, ' ').trim(),
        requestCount: requests.length,
        auditTimelineVisible: detailText.includes('Histórico auditável'),
        nonFinalMarkerVisible: detailText.includes('Resultado candidate-only não final.'),
        finalButtonsAbsent,
      },
      downloadFile,
    }

    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ reportPath, ...report }, null, 2))
    console.log('CONTROLLED_PILOT_UI_REAL_OK')
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
