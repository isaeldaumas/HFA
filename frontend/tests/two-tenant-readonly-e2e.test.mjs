import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { checkConfig, inspectTenantIsolation } from '../tools/verify-two-tenant-readonly-e2e.mjs'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const EV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const cfg = {
  baseUrl: 'https://hfa-fixture-preview-123.vercel.app',
  expectedHost: 'hfa-fixture-preview-123.vercel.app',
  syntheticApproved: 'YES',
  tokenA: 'synthetic-token-a',
  tokenB: 'synthetic-token-b',
  tenantA: A,
  tenantB: B,
  eventA: EV_A,
  eventB: EV_B,
}

function fixtureFetch({ leak = false, crossStatus = 404, missingOwn = false } = {}) {
  const requests = []
  const fetchImpl = async (url, options) => {
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.equal(options.cache, 'no-store')
    assert.equal(new URL(url).hostname, cfg.expectedHost)
    const who = options.headers.Authorization === 'Bearer ' + cfg.tokenA ? 'A' : 'B'
    assert.ok(['A','B'].includes(who))
    requests.push({ method: options.method, who, path: url.pathname })
    const tenant = who === 'A' ? A : B
    const own = who === 'A' ? EV_A : EV_B
    const other = who === 'A' ? EV_B : EV_A
    if (url.pathname === '/api/events') {
      return Response.json([{ id: own, tenant_id: leak ? (who==='A'?B:A) : tenant }])
    }
    if (url.pathname === '/api/events/' + own) {
      return missingOwn ? new Response('', { status: 404 }) :
        Response.json({ id: own, tenant_id: tenant })
    }
    if (url.pathname === '/api/events/' + other) {
      return crossStatus === 200 ?
        Response.json({ id: other, tenant_id: who==='A'?B:A }) :
        new Response(null, { status: crossStatus })
    }
    throw new Error('Unexpected fixture request')
  }
  return { requests, fetchImpl }
}

test('two distinct fixture identities, each 200 own, 404 other, 0 writes', async () => {
  const f = fixtureFetch()
  const result = await inspectTenantIsolation({ config: cfg, fetchImpl: f.fetchImpl })
  assert.deepEqual(result, { result:'PASS', verified:6, tenantRowsChecked:2,
    writes:0, fixtureType:'SYNTHETIC_ONLY' })
  assert.equal(f.requests.length, 6)
  assert.ok(f.requests.every((x) => x.method === 'GET'))
})

test('empty event lists are allowed only when own predeclared events exist', async () => {
  const f=fixtureFetch()
  const res=await inspectTenantIsolation({ config:cfg, fetchImpl: async (url,options) => {
    if (new URL(url).pathname === '/api/events') return Response.json([])
    return f.fetchImpl(url,options)
  }})
  assert.equal(res.tenantRowsChecked,0)
  assert.equal(res.verified,6)
})

test('cross-tenant event exposed to wrong token fails closed', async () => {
  const f = fixtureFetch({ crossStatus: 200 })
  await assert.rejects(inspectTenantIsolation({ config:cfg,fetchImpl:f.fetchImpl }),
    /E2E_UNEXPECTED_RESPONSE_STATUS/)
})

test('cross-tenant row visible in event list fails closed', async () => {
  const f=fixtureFetch({ leak:true })
  await assert.rejects(inspectTenantIsolation({ config:cfg,fetchImpl:f.fetchImpl }),
    /TENANT_LIST_LEAK_DETECTED/)
})

test('missing own fixture event never counts as successful QA', async () => {
  const f=fixtureFetch({missingOwn:true})
  await assert.rejects(inspectTenantIsolation({config:cfg,fetchImpl:f.fetchImpl}),
    /E2E_UNEXPECTED_RESPONSE_STATUS/)
})

test('requires independent tenants, events and tokens', () => {
  for (const changes of [{tenantB:A},{eventB:EV_A},{tokenB:cfg.tokenA},
    {syntheticApproved:'NO'},{tokenA:''},{eventB:'not-a-uuid'}]) {
    assert.throws(() => checkConfig({...cfg,...changes}))
  }
})

test('production host blocked even with valid synthetic fixtures', () => {
  for (const name of ['systemhfa.vercel.app','systemhfa-systemhfa.vercel.app']) {
    assert.throws(() => checkConfig({...cfg, baseUrl:'https://'+name,expectedHost:name}),
      /STAGING_HOST_UNVERIFIED/)
  }
})

test('rejects SSRF, cross-origin URLs and preview host mismatch', () => {
  for (const baseUrl of ['http://hfa-fixture-preview-123.vercel.app',
    'https://hfa-fixture-preview-123.vercel.app.evil.com',
    'https://hfa-fixture-preview-123.vercel.app/path',
    'https://user@hfa-fixture-preview-123.vercel.app',
    'https://127.0.0.1:8000']) {
    assert.throws(() => checkConfig({...cfg,baseUrl}), /STAGING_HOST_UNVERIFIED/)
  }
})

test('actual request rejects unsafe response status without revealing response body', async () => {
  const body='DO-NOT-LOG-BODY-SENSITIVE-123'
  const f=async () => Response.json({detail:body},{status:500})
  await assert.rejects(inspectTenantIsolation({config:cfg,fetchImpl:f}),
    (e) => e.message==='E2E_UNEXPECTED_RESPONSE_STATUS'&&!e.message.includes(body))
})

test('oversize JSON response is rejected before parsing', async () => {
  const f=async () => new Response(JSON.stringify({id:EV_A,padding:'x'.repeat(2100000)}),{
    headers: {'Content-Type':'application/json'},
  })
  await assert.rejects(inspectTenantIsolation({config:cfg,fetchImpl:f}),
    /RESPONSE_BODY_TOO_LARGE/)
})

test('provider transport errors redact any token and arbitrary messages', async () => {
  const f=async () => { throw new Error('token: '+cfg.tokenA) }
  await assert.rejects(inspectTenantIsolation({config:cfg,fetchImpl:f}),
    (e)=>e.message==='E2E_REQUEST_UNREACHABLE')
})
