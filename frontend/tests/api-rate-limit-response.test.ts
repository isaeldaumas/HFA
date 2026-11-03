import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { apiCall } from '../src/lib/api'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })

async function stubFetch(response: Response, callback: () => Promise<void>) {
  const previous = globalThis.fetch
  globalThis.fetch = async () => response
  try { await callback() } finally { globalThis.fetch = previous }
}

test('WAF 429 with HTML responds with retry guidance, not raw HTTP status', async () => {
  await stubFetch(new Response('<html>Rate limited</html>', {
    status: 429, headers: { 'Content-Type': 'text/html' },
  }), async () => {
    await assert.rejects(
      () => apiCall('/auth/register', { method: 'POST', body: '{}' }),
      (error: Error) => error.message.includes('Aguarde um minuto') &&
        !error.message.includes('<html>') && !error.message.includes('HTTP 429'),
    )
  })
})

test('429 JSON body also produces safe consistent message', async () => {
  await stubFetch(Response.json({ detail: 'untrusted backend message' }, { status: 429 }), async () => {
    await assert.rejects(
      () => apiCall('/auth/register', { method: 'POST', body: '{}' }),
      (error: Error) => error.message.includes('Muitas tentativas') &&
        !error.message.includes('untrusted backend message'),
    )
  })
})

test('legitimate 400 validation detail remains unchanged', async () => {
  await stubFetch(Response.json({ detail: 'Senha inválida' }, { status: 400 }), async () => {
    await assert.rejects(
      () => apiCall('/auth/register', { method: 'POST', body: '{}' }),
      (error: Error) => error.message === 'Senha inválida',
    )
  })
})

test('successful API JSON payload remains unchanged', async () => {
  await stubFetch(Response.json({ ok: true, tenant_id: 'fixture-only' }), async () => {
    const result = await apiCall('/auth/register', { method: 'POST', body: '{}' })
    assert.deepEqual(result, { ok: true, tenant_id: 'fixture-only' })
  })
})

test('non-JSON 500 preserves established status fallback', async () => {
  await stubFetch(new Response('<html>failure</html>', { status: 500 }), async () => {
    await assert.rejects(
      () => apiCall('/auth/register', { method: 'POST', body: '{}' }),
      (error: Error) => error.message === 'HTTP 500',
    )
  })
})
