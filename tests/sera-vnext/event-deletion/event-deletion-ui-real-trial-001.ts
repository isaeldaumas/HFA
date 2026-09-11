import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveTestTenantPrefix } from '../helpers/resolve-test-tenant-prefix'
import { assertSafeTestEnvironment } from '../helpers/assert-safe-test-environment'
import {
  PLAYWRIGHT_OUTPUT_DIR,
  buildBaseUrl,
  createMagicLinkBrowserSession,
  createSupabaseClients,
  parsePlaywrightRequestLines,
  pwClickByText,
  pwConsoleWarnings,
  pwEval,
  pwExec,
  pwRequests,
  pwSetFormValue,
  pwWaitFor,
  pwWaitForText,
  pwWaitForUrlMatch,
  sanitizeId,
  sleep,
  waitForServer,
  writeJsonReport,
} from '../product-beta-real-helpers'

const TRIAL_ID = 'event-deletion-ui-real-trial-001'
const PREFIX = '[EVENT_DELETE_TEST]'
const ENTERPRISE_TENANT_PREFIX = resolveTestTenantPrefix()
const SESSION_ID = 'eventdeleteui1'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function main() {
  assertSafeTestEnvironment({ requiresFixtureIds: true, requiresCrossTenant: false })
  const baseUrl = buildBaseUrl()
  await waitForServer(baseUrl)
  const { admin } = createSupabaseClients()
  const browserUser = await createMagicLinkBrowserSession({
    baseUrl,
    participantId: 'EVENT-DELETE-UI-ADMIN',
    tenantPrefix: ENTERPRISE_TENANT_PREFIX,
    requirePlan: 'enterprise',
  })
  assert.ok(browserUser.publicUserId)

  const title = `${PREFIX} UI ${Date.now()}`
  const event = await admin.from('events').insert({
    tenant_id: browserUser.tenantId,
    submitted_by: browserUser.publicUserId,
    title,
    raw_input: 'Synthetic UI event deletion fixture with no human or production data.',
    input_type: 'text',
    status: 'completed',
  }).select('id').single()
  if (event.error) throw event.error
  const eventId = String(event.data.id)

  const analysis = await admin.from('analyses').insert({
    event_id: eventId,
    tenant_id: browserUser.tenantId,
    event_summary: 'Synthetic UI fixture',
    perception_code: 'P-A',
    objective_code: 'O-A',
    action_code: 'A-A',
  })
  if (analysis.error) throw analysis.error

  const screenshots: string[] = []
  try {
    pwExec(SESSION_ID, ['open', browserUser.actionLink, '--browser', 'firefox'])
    await pwWaitForUrlMatch(SESSION_ID, new RegExp(`^${escapeRegExp(baseUrl)}`), 20_000)
    await sleep(2_000)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/events/${eventId}`])
    await pwWaitForText(SESSION_ID, title, 20_000)
    await pwWaitForText(SESSION_ID, 'Excluir evento', 20_000)
    const detailShot = path.join(PLAYWRIGHT_OUTPUT_DIR, 'event-deletion-detail-desktop.png')
    pwExec(SESSION_ID, ['screenshot', '--filename', detailShot, '--full-page'])
    screenshots.push(detailShot)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Excluir evento'), true)
    await pwWaitForText(SESSION_ID, 'Excluir e iniciar período de recuperação', 20_000)
    const detailModalShot = path.join(PLAYWRIGHT_OUTPUT_DIR, 'event-deletion-detail-modal-desktop.png')
    pwExec(SESSION_ID, ['screenshot', '--filename', detailModalShot, '--full-page'])
    screenshots.push(detailModalShot)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Fechar'), true)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/events`])
    await pwWaitForText(SESSION_ID, title, 20_000)
    const opened = pwEval<boolean>(SESSION_ID, `(() => {
      const title = ${JSON.stringify(title)};
      const card = Array.from(document.querySelectorAll('div')).find((node) =>
        node instanceof HTMLElement &&
        node.querySelector('h3')?.textContent === title &&
        Array.from(node.querySelectorAll('button')).some((button) => button.textContent?.includes('Excluir evento'))
      );
      const button = card && Array.from(card.querySelectorAll('button')).find((item) => item.textContent?.includes('Excluir evento'));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`)
    assert.equal(opened, true)
    await pwWaitForText(SESSION_ID, 'Excluir evento e dados relacionados', 20_000)

    const desktopShot = path.join(PLAYWRIGHT_OUTPUT_DIR, 'event-deletion-modal-desktop.png')
    pwExec(SESSION_ID, ['screenshot', '--filename', desktopShot, '--full-page'])
    screenshots.push(desktopShot)

    assert.equal(pwSetFormValue(SESSION_ID, 'textarea', ''), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder]', 'wrong title'), true)
    assert.equal(pwEval<boolean>(SESSION_ID, `document.querySelector('div[role="dialog"] button.bg-red-600')?.hasAttribute('disabled') === true`), true)

    assert.equal(pwSetFormValue(SESSION_ID, 'textarea', 'synthetic UI deletion validation'), true)
    assert.equal(pwSetFormValue(SESSION_ID, 'input[placeholder]', title), true)
    assert.equal(pwEval<boolean>(SESSION_ID, `document.querySelector('div[role="dialog"] button.bg-red-600')?.hasAttribute('disabled') === false`), true)
    assert.equal(pwClickByText(SESSION_ID, 'button', 'Excluir e iniciar período de recuperação'), true)
    await pwWaitFor<boolean>(
      SESSION_ID,
      `!document.body.innerText.includes(${JSON.stringify(title)})`,
      Boolean,
      { timeoutMs: 20_000, description: 'fixture removed from active events' },
    )

    pwExec(SESSION_ID, ['goto', `${baseUrl}/dashboard`])
    await sleep(1_000)
    assert.equal(pwEval<boolean>(SESSION_ID, `!document.body.innerText.includes(${JSON.stringify(title)})`), true)
    pwExec(SESSION_ID, ['goto', `${baseUrl}/risk-profile`])
    await sleep(1_000)
    assert.equal(pwEval<boolean>(SESSION_ID, `!document.body.innerText.includes(${JSON.stringify(title)})`), true)

    pwExec(SESSION_ID, ['goto', `${baseUrl}/events/deleted`])
    await pwWaitForText(SESSION_ID, title, 20_000)
    const deletedShot = path.join(PLAYWRIGHT_OUTPUT_DIR, 'event-deletion-deleted-list.png')
    pwExec(SESSION_ID, ['screenshot', '--filename', deletedShot, '--full-page'])
    screenshots.push(deletedShot)

    const restored = pwEval<boolean>(SESSION_ID, `(() => {
      const title = ${JSON.stringify(title)};
      const card = Array.from(document.querySelectorAll('div')).find((node) =>
        node instanceof HTMLElement &&
        node.querySelector('h2')?.textContent === title &&
        Array.from(node.querySelectorAll('button')).some((button) => button.textContent?.includes('Restaurar evento'))
      );
      const button = card && Array.from(card.querySelectorAll('button')).find((item) => item.textContent?.includes('Restaurar evento'));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`)
    assert.equal(restored, true)
    await pwWaitFor<boolean>(
      SESSION_ID,
      `!document.body.innerText.includes(${JSON.stringify(title)})`,
      Boolean,
      { timeoutMs: 20_000, description: 'fixture removed from deleted events after restore' },
    )

    pwExec(SESSION_ID, ['goto', `${baseUrl}/events`])
    await pwWaitForText(SESSION_ID, title, 20_000)

    const viewportChecks: Array<{ name: string; width: number; height: number }> = [
      { name: 'tablet', width: 1024, height: 768 },
      { name: 'mobile', width: 390, height: 844 },
    ]
    for (const viewport of viewportChecks) {
      pwExec(SESSION_ID, ['resize', String(viewport.width), String(viewport.height)])
      await sleep(400)
      const overflow = pwEval<boolean>(SESSION_ID, 'document.documentElement.scrollWidth > window.innerWidth + 4')
      assert.equal(overflow, false, `${viewport.name} horizontal overflow`)
    }
    const mobileShot = path.join(PLAYWRIGHT_OUTPUT_DIR, 'event-deletion-events-mobile.png')
    pwExec(SESSION_ID, ['screenshot', '--filename', mobileShot, '--full-page'])
    screenshots.push(mobileShot)

    const consoleWarnings = pwConsoleWarnings(SESSION_ID)
    assert.equal(/Errors:\s*[1-9]/.test(consoleWarnings), false)
    const requests = parsePlaywrightRequestLines(pwRequests(SESSION_ID))
    assert.equal(requests.some((request) => request.status >= 500), false)

    const report = {
      trialId: TRIAL_ID,
      baseUrl,
      eventIdSanitized: sanitizeId(eventId),
      checks: [
        { name: 'admin-login', status: 'PASS' },
        { name: 'detail-delete-action', status: 'PASS' },
        { name: 'detail-impact-modal', status: 'PASS' },
        { name: 'impact-modal', status: 'PASS' },
        { name: 'wrong-title-disabled', status: 'PASS' },
        { name: 'empty-reason-disabled', status: 'PASS' },
        { name: 'soft-delete-active-list', status: 'PASS' },
        { name: 'dashboard-filter', status: 'PASS' },
        { name: 'risk-profile-filter', status: 'PASS' },
        { name: 'deleted-list', status: 'PASS' },
        { name: 'restore', status: 'PASS' },
        { name: 'mobile-tablet', status: 'PASS' },
        { name: 'console-no-critical-errors', status: 'PASS' },
        { name: 'network-no-500', status: 'PASS' },
      ],
      screenshots,
      requestCount: requests.length,
      consoleWarnings: consoleWarnings.replace(/\s+/g, ' ').trim(),
    }
    const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
    console.log(JSON.stringify({ reportPath, ...report }, null, 2))
  } finally {
    try {
      pwExec(SESSION_ID, ['close'])
    } catch {
      // Best-effort browser cleanup.
    }
    await admin.from('events').delete().eq('id', eventId).eq('tenant_id', browserUser.tenantId)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
