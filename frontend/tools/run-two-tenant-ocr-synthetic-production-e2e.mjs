#!/usr/bin/env node
/**
 * Controlled production E2E with disposable, synthetic A/B tenant fixtures.
 * All mutations are opt-in, fixture-scoped and cleaned up in finally.
 * Never logs credentials, bearer tokens, user emails or source documents.
 */
import assert from 'node:assert/strict'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {readFileSync,writeFileSync,unlinkSync,chmodSync,existsSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import {inspectTenantIsolation} from './verify-two-tenant-readonly-e2e.mjs'
import {inspectDocumentIsolation} from './verify-two-tenant-documents-readonly-e2e.mjs'

const ENV_FILE=process.env.HFA_E2E_SECRET_ENV_FILE || '/tmp/hfa-issue122-e2e-prod.env'
const MARKER=process.env.HFA_E2E_RECOVERY_FILE || '/tmp/hfa-issue122-e2e-recovery.json'
if(process.env.HFA_E2E_SYNTHETIC_FIXTURES_APPROVED!=='YES'||
   process.env.HFA_E2E_PRODUCTION_MUTATIONS_APPROVED!=='YES'||
   process.env.HFA_E2E_PRODUCTION_READONLY_APPROVED!=='YES'||
   process.env.HFA_E2E_EXPECTED_HOST!=='systemhfa.vercel.app') {
  throw Error('EXPLICIT_SYNTHETIC_PRODUCTION_APPROVAL_REQUIRED')
}
if(process.env.HFA_E2E_BASE_URL!=='https://systemhfa.vercel.app/') {
  throw Error('PRODUCTION_HOST_MISMATCH')
}
if(process.env.HFA_E2E_FIXTURE_TYPE!=='EPHEMERAL_SYNTHETIC_ONLY') {
  throw Error('INVALID_FIXTURE_TYPE')
}
if(readFileSync(ENV_FILE).byteLength>20000)throw Error('UNEXPECTED_ENV_FILE')
const env={}
for(const line of readFileSync(ENV_FILE,'utf8').split('\n')){
  const match=/^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
  if(match) {
    try {env[match[1]]=JSON.parse(match[2])}
    catch {env[match[1]]=match[2]}
  }
}
const url=env.NEXT_PUBLIC_SUPABASE_URL
const anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service=env.SUPABASE_SERVICE_ROLE_KEY
assert.ok(typeof url==='string'&&url==='https://vbdpweliprcsktyxodss.supabase.co',
  'UNEXPECTED_SUPABASE_PROJECT')
assert.ok(typeof anon==='string'&&anon.length>40)
assert.ok(typeof service==='string'&&service.length>40)
const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}})
const anonClient=()=>createClient(url,anon,{auth:{autoRefreshToken:false,persistSession:false}})
const created={tenants:[],authUsers:[],users:[],events:[],documents:[],paths:[]}
if(existsSync(MARKER))throw Error('PENDING_SYNTHETIC_RECOVERY_REQUIRES_MANUAL_REVIEW')
const prefix='hfa-synthetic-issue122-'+Date.now()+'-'+randomBytes(3).toString('hex')
const image=readFileSync(process.env.HFA_E2E_SYNTHETIC_PNG || '/tmp/hfa-ocr-smoke.png')
assert.ok(image.length>100 && image.length<3800000)
assert.ok(image[0]===137&&image[1]===80&&image[2]===78&&image[3]===71)
const imageHash=createHash('sha256').update(image).digest('hex')
function checkpoint(){
  writeFileSync(MARKER,JSON.stringify({prefix,created},null,2),{mode:0o600})
  chmodSync(MARKER,0o600)
}
if(process.env.HFA_E2E_RECOVERY_FILE_EXISTS==='YES')throw Error('DIRTY_FIXTURE_RECOVERY')
checkpoint()
async function required(output,label){
  if(output.error||!output.data){
    throw Error(label+'_FAILED'+(output.error?.code?':'+output.error.code:''))
  }
  return output.data
}
function actor(label){
  return {label,tenantId:randomUUID(),eventId:randomUUID(),documentId:randomUUID(),
    authId:null,publicId:randomUUID(),storageUuid:randomUUID(),token:null}
}
async function provision(a){
  const slug=prefix+'-'+a.label
  await required(await admin.from('tenants').insert({
    id:a.tenantId,name:'HFA E2E SYNTHETIC '+a.label,slug,
    is_active:true,plan:'pro',credits_balance:0,
  }).select('id').single(),'TENANT')
  created.tenants.push(a.tenantId);checkpoint()
  const password=randomBytes(26).toString('base64url')+'!aA8'
  const email=slug+'@example.com'
  const auth=await required(await admin.auth.admin.createUser({
    email,password,email_confirm:true,
    user_metadata:{fixture:'HFA_ISSUE122_SYNTHETIC'},
  }),'AUTH')
  a.authId=auth.user.id
  a.publicId=a.authId
  created.authUsers.push(a.authId);checkpoint()
  await required(await admin.from('users').insert({
    id:a.publicId,tenant_id:a.tenantId,auth_user_id:a.authId,email,
    full_name:'E2E synthetic analyst '+a.label,role:'analyst',is_active:true,
  }).select('id').single(),'PUBLIC_USER')
  created.users.push(a.publicId);checkpoint()
  await required(await admin.from('events').insert({
    id:a.eventId,tenant_id:a.tenantId,submitted_by:a.publicId,
    title:'HFA synthetic isolation E2E '+a.label,
    raw_input:'SYNTHETIC E2E FIXTURE - no operational content',
    input_type:'text',status:'received',
  }).select('id').single(),'EVENT')
  created.events.push(a.eventId);checkpoint()
  const path=a.tenantId+'/events/'+a.eventId+'/'+a.storageUuid+'.png'
  await required(await admin.storage.from('analysis-documents').upload(
    path,image,{contentType:'image/png',upsert:false},
  ),'STORAGE')
  created.paths.push(path);checkpoint()
  await required(await admin.from('event_documents').insert({
    id:a.documentId,tenant_id:a.tenantId,event_id:a.eventId,
    uploaded_by:a.publicId,file_name:'synthetic-'+a.label+'.png',
    storage_path:path,mime_type:'image/png',size_bytes:image.length,
    content_sha256:imageHash,source_ordinal:1,
  }).select('id').single(),'SOURCE')
  created.documents.push(a.documentId);checkpoint()
  const login=await required(await anonClient().auth.signInWithPassword({email,password}),'LOGIN')
  assert.equal(login.user.id,a.authId)
  assert.ok(login.session.access_token)
  a.token=login.session.access_token
  // Do not save email/password/token in checkpoint/logs.
}
async function call(method,path,token,expected,body=null){
  const response=await fetch('https://systemhfa.vercel.app'+path,{
    method,headers:{Authorization:'Bearer '+token,
      ...(body===null?{}:{'Content-Type':'application/json'})},
    ...(body===null?{}:{body:JSON.stringify(body)}),
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
  })
  if(response.status!==expected){
    await response.body?.cancel().catch(()=>undefined)
    throw Error('PRODUCTION_E2E_UNEXPECTED_STATUS_'+method+'_'+expected+'_GOT_'+response.status)
  }
  return expected===200||expected===201?response.json():response.body?.cancel().then(()=>null)
}
function fixtureConfig(a,b){
  return {baseUrl:'https://systemhfa.vercel.app/',expectedHost:'systemhfa.vercel.app',
    tokenA:a.token,tokenB:b.token,tenantA:a.tenantId,tenantB:b.tenantId,
    eventA:a.eventId,eventB:b.eventId,documentA:a.documentId,documentB:b.documentId,
    syntheticApproved:'YES',productionReadonlyApproved:'YES'}
}
async function verify(a,b){
  const config=fixtureConfig(a,b)
  for(const actor of [a,b]){
    const foreign=actor===a?b:a
    for(const [kind,path] of [
      ['event-list','/api/events'],
      ['own-event','/api/events/'+actor.eventId],
      ['foreign-event','/api/events/'+foreign.eventId],
      ['own-docs','/api/events/'+actor.eventId+'/documents'],
      ['foreign-docs','/api/events/'+foreign.eventId+'/documents'],
      ['foreign-doc-download','/api/events/'+foreign.eventId+'/documents/'+foreign.documentId],
    ]){
      try {
        const res=await fetch('https://systemhfa.vercel.app'+path,{
          headers:{Authorization:'Bearer '+actor.token},redirect:'error',
          signal:AbortSignal.timeout(15000),cache:'no-store',
        })
        console.log('E2E_DIAGNOSTIC_STATUS',actor.label,kind,res.status)
        await res.body?.cancel().catch(()=>undefined)
      }catch{console.log('E2E_DIAGNOSTIC_REQUEST_ERROR',actor.label,kind)}
    }
  }
  const e=await inspectTenantIsolation({config})
  assert.equal(e.result,'PASS')
  const docs=await inspectDocumentIsolation({config})
  assert.equal(docs.checked,6)
  console.log('REAL_AUTHENTICATED_TWO_TENANT_EVENT_CHECKS_PASS',e.verified)
  console.log('REAL_AUTHENTICATED_TWO_TENANT_DOC_CHECKS_PASS',docs.checked)
  for(const actor of [a,b]){
    const path='/api/events/'+actor.eventId+'/documents/'+actor.documentId+'/ocr-reviews'
    const foreign=actor===a?b:a
    const cross='/api/events/'+foreign.eventId+'/documents/'+foreign.documentId+'/ocr-reviews'
    const record={
      schema:'HFA_OCR_LOCAL_REVIEW_V1',
      eventId:actor.eventId,documentId:actor.documentId,sourceOrdinal:1,
      originalSha256:imageHash,originalMimeType:'image/png',pageNumber:null,
      ocrText:'SEGURANCA DE VOO',humanCorrectedText:'SEGURANÇA DE VOO',
      declaration:'COMPARISON_WITH_ORIGINAL_DECLARED_IN_THIS_BROWSER_SESSION',
      reviewedByHuman:'SELF_DECLARED_LOCAL_ONLY',reviewPersisted:false,
      reviewSignatureVerified:false,scientificallyValidated:false,
      analysisChanged:false,externalProviderUsed:false,
    }
    const created=await call('POST',path,actor.token,201,record)
    assert.equal(created.status,'created')
    assert.equal(created.receipt.persisted,true)
    assert.equal(created.receipt.scientificallyValidated,false)
    assert.equal(created.receipt.analysisChanged,false)
    const duplicate=await call('POST',path,actor.token,200,record)
    assert.equal(duplicate.status,'already_present')
    assert.equal(duplicate.receipt.id,created.receipt.id)
    const own=await call('GET',path,actor.token,200)
    assert.equal(own.reviews.length,1)
    assert.equal(own.reviews[0].id,created.receipt.id)
    assert.ok(!('ocrText' in own.reviews[0]))
    await call('GET',cross,actor.token,404)
    await call('POST',cross,actor.token,404,{...record,
      eventId:foreign.eventId,documentId:foreign.documentId})
    const forged=await call('POST',path,actor.token,409,
      {...record,originalSha256:'f'.repeat(64)})
    void forged
    console.log('REAL_AUTHENTICATED_REVIEW_RETRY_CROSS_TENANT_SOURCE_HASH_PASS',actor.label)
  }
  const sources=await admin.from('event_document_ocr_reviews').select('id,tenant_id')
    .in('document_id',[a.documentId,b.documentId])
  assert.ifError(sources.error)
  assert.equal(sources.data.length,2)
  console.log('PRODUCTION_SYNTHETIC_REVIEW_ROWS_PASS',sources.data.length)
}
async function cleanup(){
  let issues=[]
  async function attempt(label,fn){
    try{
      const {error}=await fn()
      if(error)throw Error(error.code??'cleanup')
    }catch{issues.push(label)}
  }
  // Remove only records created with unique ephemeral IDs. Never bulk-delete
  // by tenant-independent conditions or touch real customer data.
  for(const id of created.documents)await attempt('document',()=>
    admin.from('event_documents').delete().eq('id',id))
  for(const path of created.paths)await attempt('storage',()=>
    admin.storage.from('analysis-documents').remove([path]))
  for(const id of created.events)await attempt('event',()=>
    admin.from('events').delete().eq('id',id))
  for(const id of created.users)await attempt('public_user',()=>
    admin.from('users').delete().eq('id',id))
  for(const id of created.authUsers)await attempt('auth',()=>
    admin.auth.admin.deleteUser(id))
  for(const id of created.tenants)await attempt('tenant',()=>
    admin.from('tenants').delete().eq('id',id))
  const checks=[
    ['tenants','id',created.tenants],
    ['users','id',created.users],
    ['events','id',created.events],
    ['event_documents','id',created.documents],
    ['event_document_ocr_reviews','document_id',created.documents],
  ]
  for(const [table,column,ids] of checks){
    if(!ids.length)continue
    const {count,error}=await admin.from(table).select('id',{
      head:true,count:'exact'}).in(column,ids)
    if(error||count!==0)issues.push('RESIDUE_'+table)
  }
  if(issues.length){
    checkpoint()
    console.error('SYNTHETIC_CLEANUP_NOT_CONFIRMED',issues.join(','))
    process.exitCode=3
  }else{
    unlinkSync(MARKER)
    console.log('SYNTHETIC_FIXTURE_CLEANUP_VERIFIED_NO_ROWS')
  }
}
try{
  if(readFileSync(MARKER,'utf8').includes('"tenants": []')===false)
    throw Error('FIXTURE_RECOVERY_MARKER_NOT_FRESH')
  const a=actor('A'),b=actor('B')
  await provision(a)
  await provision(b)
  await verify(a,b)
  console.log('PRODUCTION_AUTHENTICATED_SYNTHETIC_E2E_PASS')
}catch(error){
  console.error('PRODUCTION_AUTHENTICATED_SYNTHETIC_E2E_FAILED',
    error instanceof Error?error.message:'UNKNOWN')
  process.exitCode=2
}finally{
  await cleanup()
}
