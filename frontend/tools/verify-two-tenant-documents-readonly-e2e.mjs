#!/usr/bin/env node
/**
 * Synthetic, read-only document isolation probe. Does not download content,
 * mutate events, extract text, or expose document metadata in diagnostics.
 */
import { pathToFileURL } from 'node:url'
import { checkConfig } from './verify-two-tenant-readonly-e2e.mjs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 131072

export function validateDocumentFixtures(config) {
  const base = checkConfig(config)
  if (!UUID.test(config.documentA ?? '') || !UUID.test(config.documentB ?? '') ||
      config.documentA === config.documentB) throw new Error('TWO_SYNTHETIC_DOCUMENTS_REQUIRED')
  return base
}

export async function inspectDocumentIsolation({ config, fetchImpl = globalThis.fetch }) {
  const base = validateDocumentFixtures(config)
  let checked = 0
  const actors = [
    { token: config.tokenA, event: config.eventA, other: config.eventB, doc: config.documentA, otherDoc: config.documentB },
    { token: config.tokenB, event: config.eventB, other: config.eventA, doc: config.documentB, otherDoc: config.documentA },
  ]
  for (const actor of actors) {
    for (const [path, expected] of [
      ['/api/events/' + actor.event + '/documents', 200],
      ['/api/events/' + actor.other + '/documents', 404],
      ['/api/events/' + actor.other + '/documents/' + actor.otherDoc, 404],
    ]) {
      let response
      try {
        response = await fetchImpl(new URL(path, base), {
          method: 'GET',
          headers: { Authorization: 'Bearer ' + actor.token },
          redirect: 'error',
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
        })
      } catch { throw new Error('DOCUMENT_E2E_REQUEST_UNREACHABLE') }
      if (response.status !== expected) throw new Error('DOCUMENT_E2E_UNEXPECTED_STATUS')
      checked++
      if (expected !== 200) {
        await response.body?.cancel().catch(() => undefined)
        continue
      }
      const length = response.headers.get('content-length')
      if (length && (!/^\\d+$/.test(length) || Number(length) > MAX_BYTES)) {
        throw new Error('DOCUMENT_E2E_RESPONSE_TOO_LARGE')
      }
      if (!response.body) throw new Error('DOCUMENT_E2E_EMPTY_BODY')
      const reader = response.body.getReader()
      const chunks = []
      let total = 0
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_BYTES) {
          await reader.cancel().catch(() => undefined)
          throw new Error('DOCUMENT_E2E_RESPONSE_TOO_LARGE')
        }
        chunks.push(value)
      }
      let data
      try {
        const bytes = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      } catch { throw new Error('DOCUMENT_E2E_INVALID_JSON') }
      if (!data || !Array.isArray(data.documents) ||
          !data.documents.some((doc) => doc && doc.id === actor.doc)) {
        throw new Error('DOCUMENT_E2E_OWN_FIXTURE_MISSING')
      }
    }
  }
  return { result: 'PASS', checked, writes: 0, downloads: 0, fixtureType: 'SYNTHETIC_ONLY' }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = {
    baseUrl: process.env.HFA_E2E_BASE_URL,
    expectedHost: process.env.HFA_E2E_EXPECTED_HOST,
    tokenA: process.env.HFA_E2E_TOKEN_A,
    tokenB: process.env.HFA_E2E_TOKEN_B,
    tenantA: process.env.HFA_E2E_TENANT_A_ID,
    tenantB: process.env.HFA_E2E_TENANT_B_ID,
    eventA: process.env.HFA_E2E_EVENT_A_ID,
    eventB: process.env.HFA_E2E_EVENT_B_ID,
    documentA: process.env.HFA_E2E_DOCUMENT_A_ID,
    documentB: process.env.HFA_E2E_DOCUMENT_B_ID,
    syntheticApproved: process.env.HFA_E2E_SYNTHETIC_FIXTURES_APPROVED,
    productionReadonlyApproved: process.env.HFA_E2E_PRODUCTION_READONLY_APPROVED,
  }
  try {
    const result = await inspectDocumentIsolation({ config })
    console.log('[HFA_DOCUMENT_TENANT_E2E] PASS: ' + result.checked + ' GET; zero writes/downloads')
  } catch (error) {
    console.error('[HFA_DOCUMENT_TENANT_E2E] NOT_READY_OR_FAILED: ' +
      (error instanceof Error ? error.message : 'UNKNOWN_FAILURE'))
    process.exitCode = 2
  }
}
