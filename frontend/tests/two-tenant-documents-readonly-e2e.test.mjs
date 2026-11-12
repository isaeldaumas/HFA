import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { inspectDocumentIsolation, validateDocumentFixtures } from '../tools/verify-two-tenant-documents-readonly-e2e.mjs'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const EV_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const EV_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const DOC_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DOC_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const cfg = {
  baseUrl: 'https://hfa-fixture-preview-123.vercel.app',
  expectedHost: 'hfa-fixture-preview-123.vercel.app',
  syntheticApproved: 'YES', tokenA: 'synthetic-token-a',
  tokenB: 'synthetic-token-b', tenantA: A, tenantB: B,
  eventA: EV_A, eventB: EV_B, documentA: DOC_A, documentB: DOC_B,
}
function mock({ crossStatus = 404, wrongOwn = false } = {}) {
  const requests = []
  const fetchImpl = async (url, options) => {
    assert.equal(options.method,'GET')
    assert.equal(options.redirect,'error')
    assert.equal(options.cache,'no-store')
    const actor = options.headers.Authorization === 'Bearer ' + cfg.tokenA ? 'A' : 'B'
    assert.ok(['A','B'].includes(actor))
    const own = actor === 'A' ? EV_A : EV_B
    const other = actor === 'A' ? EV_B : EV_A
    const doc = actor === 'A' ? DOC_A : DOC_B
    const otherDoc = actor === 'A' ? DOC_B : DOC_A
    const path = new URL(url).pathname
    requests.push({actor,path})
    if (path === '/api/events/' + own + '/documents')
      return Response.json({documents: wrongOwn ? [] : [{id:doc}]})
    if (path === '/api/events/' + other + '/documents' ||
        path === '/api/events/' + other + '/documents/' + otherDoc)
      return new Response(null,{status:crossStatus})
    throw new Error('unexpected fixture route')
  }
  return {fetchImpl,requests}
}
test('six read-only requests verify own source and deny other tenant',async()=>{
  const m=mock()
  assert.deepEqual(await inspectDocumentIsolation({config:cfg,fetchImpl:m.fetchImpl}),
    {result:'PASS',checked:6,writes:0,downloads:0,fixtureType:'SYNTHETIC_ONLY'})
  assert.equal(m.requests.length,6)
})
test('wrong-tenant manifest access fails closed',async()=>{
  const m=mock({crossStatus:200})
  await assert.rejects(inspectDocumentIsolation({config:cfg,fetchImpl:m.fetchImpl}),
    /DOCUMENT_E2E_UNEXPECTED_STATUS/)
})
test('missing own document never passes',async()=>{
  const m=mock({wrongOwn:true})
  await assert.rejects(inspectDocumentIsolation({config:cfg,fetchImpl:m.fetchImpl}),
    /DOCUMENT_E2E_OWN_FIXTURE_MISSING/)
})
test('distinct synthetic document UUIDs are mandatory',()=>{
  for(const patch of [{documentB:DOC_A},{documentA:'bad'},{documentB:''}]){
    assert.throws(()=>validateDocumentFixtures({...cfg,...patch}),/TWO_SYNTHETIC_DOCUMENTS_REQUIRED/)
  }
})
test('production requires separate explicit approval',()=>{
  assert.throws(()=>validateDocumentFixtures({...cfg,baseUrl:'https://systemhfa.vercel.app',
    expectedHost:'systemhfa.vercel.app'}),/PRODUCTION_READONLY_APPROVAL_REQUIRED/)
})
test('no secrets or server body in error message',async()=>{
  await assert.rejects(inspectDocumentIsolation({config:cfg,
    fetchImpl:async()=>{throw new Error('secret '+cfg.tokenA)}}),
    e=>e.message==='DOCUMENT_E2E_REQUEST_UNREACHABLE')
})
