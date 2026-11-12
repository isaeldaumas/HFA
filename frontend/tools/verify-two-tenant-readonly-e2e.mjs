#!/usr/bin/env node
/**
 * Read-only authenticated two-tenant isolation check for independently
 * provisioned synthetic fixtures. NEVER performs signup or state-changing
 * requests. Production requires an additional independent explicit opt-in.
 */
import { pathToFileURL } from 'node:url'

const MAX_JSON_BYTES = 2_097_152
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROD_HOSTS = new Set(['systemhfa.vercel.app', 'systemhfa-systemhfa.vercel.app'])

function fixtureId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function checkConfig(config) {
  const ids = [config.tenantA, config.tenantB, config.eventA, config.eventB]
  if (config.syntheticApproved !== 'YES') throw new Error('SYNTHETIC_FIXTURES_NOT_APPROVED')
  if (ids.some((id) => !fixtureId(id))) throw new Error('MISSING_SYNTHETIC_UUIDS')
  if (config.tenantA === config.tenantB || config.eventA === config.eventB) {
    throw new Error('TENANT_FIXTURES_NOT_DISTINCT')
  }
  if (!config.tokenA || !config.tokenB || config.tokenA === config.tokenB) {
    throw new Error('TWO_DISTINCT_TOKENS_REQUIRED')
  }
  let url
  try { url = new URL(config.baseUrl) } catch { throw new Error('UNVERIFIED_E2E_URL') }
  const productionMode = config.productionReadonlyApproved === 'YES'
  const productionHost = PROD_HOSTS.has(url.hostname)
  if (productionMode !== productionHost) {
    throw new Error(productionHost
      ? 'PRODUCTION_READONLY_APPROVAL_REQUIRED'
      : 'PRODUCTION_SCOPE_MUST_MATCH_HOST')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      url.hostname !== config.expectedHost) {
    throw new Error('UNVERIFIED_E2E_HOST')
  }
  return url
}

async function boundedJSON(response) {
  // Avoid accidentally holding or reporting unbounded customer event payloads.
  if (Number(response.headers.get('content-length') ?? 0) > MAX_JSON_BYTES) {
    throw new Error('RESPONSE_BODY_TOO_LARGE')
  }
  if (!response.body) throw new Error('EMPTY_RESPONSE_BODY')
  const reader = response.body.getReader()
  const parts = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_JSON_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error('RESPONSE_BODY_TOO_LARGE')
    }
    parts.push(value)
  }
  const bytes = new Uint8Array(total)
  let pos = 0
  for (const part of parts) {
    bytes.set(part, pos)
    pos += part.byteLength
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw new Error('INVALID_RESPONSE_JSON') }
}

export async function inspectTenantIsolation({ config, fetchImpl = globalThis.fetch }) {
  const base = checkConfig(config)
  const stats = { verified: 0, tenantRowsChecked: 0 }
  async function get(path, token, expected) {
    const url = new URL(path, base)
    if (url.origin !== base.origin) throw new Error('UNEXPECTED_REQUEST_ORIGIN')
    let response
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      throw new Error('E2E_REQUEST_UNREACHABLE')
    }
    if (response.status !== expected) {
      // Only codes, not token, URL, tenant ID or response body, are exposed.
      throw new Error('E2E_UNEXPECTED_RESPONSE_STATUS')
    }
    stats.verified += 1
    return expected === 200 ? boundedJSON(response) : null
  }

  const cases = [
    { token: config.tokenA, tenant: config.tenantA, own: config.eventA, other: config.eventB },
    { token: config.tokenB, tenant: config.tenantB, own: config.eventB, other: config.eventA },
  ]
  for (const check of cases) {
    const events = await get('/api/events', check.token, 200)
    if (!Array.isArray(events)) throw new Error('EVENT_LIST_NOT_ARRAY')
    for (const item of events) {
      stats.tenantRowsChecked += 1
      if (!item || item.tenant_id !== check.tenant) {
        throw new Error('TENANT_LIST_LEAK_DETECTED')
      }
    }
    const own = await get('/api/events/' + check.own, check.token, 200)
    if (!own || own.id !== check.own || own.tenant_id !== check.tenant) {
      throw new Error('OWN_EVENT_NOT_IN_EXPECTED_TENANT')
    }
    await get('/api/events/' + check.other, check.token, 404)
  }
  return { result: 'PASS', ...stats, writes: 0, fixtureType: 'SYNTHETIC_ONLY' }
}

async function main() {
  const config = {
    baseUrl: process.env.HFA_E2E_BASE_URL,
    expectedHost: process.env.HFA_E2E_EXPECTED_HOST,
    tokenA: process.env.HFA_E2E_TOKEN_A,
    tokenB: process.env.HFA_E2E_TOKEN_B,
    tenantA: process.env.HFA_E2E_TENANT_A_ID,
    tenantB: process.env.HFA_E2E_TENANT_B_ID,
    eventA: process.env.HFA_E2E_EVENT_A_ID,
    eventB: process.env.HFA_E2E_EVENT_B_ID,
    syntheticApproved: process.env.HFA_E2E_SYNTHETIC_FIXTURES_APPROVED,
    productionReadonlyApproved: process.env.HFA_E2E_PRODUCTION_READONLY_APPROVED,
  }
  try {
    const outcome = await inspectTenantIsolation({ config })
    console.log('[HFA_AUTHENTICATED_TENANT_E2E] PASS: ' + outcome.verified +
      ' GET checks, ' + outcome.tenantRowsChecked + ' listed rows; zero writes.')
  } catch (error) {
    console.error('[HFA_AUTHENTICATED_TENANT_E2E] NOT_READY_OR_FAILED: ' +
      (error instanceof Error ? error.message : 'UNKNOWN_FAILURE'))
    process.exitCode = 2
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
