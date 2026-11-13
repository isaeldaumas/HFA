import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import test from 'node:test'
import {
 queueAdditionalOriginals,appendAdditionalOriginals,
 type AdditionalOriginal,
} from '../src/lib/browser/additional-originals'
const event='22222222-2222-4222-8222-222222222222'
const file=(name:string)=>new File(['REAL SYNTHETIC SOURCE'],name,{type:'text/plain'})
const row=(name:string,status:AdditionalOriginal['status']='queued'):AdditionalOriginal=>
 ({id:name,file:file(name),status,message:''})
test('initial event queue reserves primary source slot and rejects invalid or excess files',()=>{
 const a=queueAdditionalOriginals([],[file('a.pdf'),file('b.txt'),file('c.png'),file('d.docx'),file('e.webp')],4)
 assert.equal(a.entries.length,4)
 assert.equal(a.rejected.length,1)
 const b=queueAdditionalOriginals([],[new File([''],'empty.pdf'),file('ok.txt')],5)
 assert.equal(b.entries.length,1)
 assert.equal(b.rejected.length,1)
 const c=queueAdditionalOriginals([row('one.txt')],[file('x.exe')],5)
 assert.equal(c.entries.length,1)
 assert.equal(c.rejected.length,1)
})
test('successful, idempotent, and partial retry never creates the event again',async()=>{
 const statuses: string[]=[]
 let attempts=0
 const fetcher=async (_url:RequestInfo|URL,opts?:RequestInit)=>{
  assert.equal(opts?.method,'POST')
  assert.ok(opts?.body instanceof FormData)
  attempts++
  const form=opts?.body as FormData
  const uploaded=form.get('file') as File
  const sha256=createHash('sha256').update(Buffer.from(await uploaded.arrayBuffer())).digest('hex')
  return Response.json({status:attempts===1?'created':'already_present',sha256},
   {status:attempts===1?201:200})
 }
 const original=row('source.txt')
 const first=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',originals:[original],
  onStatus:(_id,status)=>statuses.push(status),fetcher:fetcher as typeof fetch})
 assert.equal(first.success,true)
 const second=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[{...original,status:'saved'}],onStatus:()=>assert.fail('saved sent again'),
  fetcher:fetcher as typeof fetch})
 assert.equal(second.success,true)
 assert.equal(attempts,1)
 const third=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[{...original,status:'error'}],onStatus:()=>{},fetcher:fetcher as typeof fetch})
 assert.equal(third.success,true)
 assert.equal(attempts,2)
 assert.deepEqual(statuses,['uploading','saved'])
})
test('audit-unverified and network error cannot be reported as complete',async()=>{
 const originals=[row('one.txt'),row('two.txt')]
 const states:string[]=[]
 let calls=0
 const fetcher=async()=>{
  calls++
  if(calls===1)return Response.json({status:'audit_unverified'},{status:202})
  throw new Error('simulated timeout')
 }
 const r=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',originals,
  onStatus:(_id,status)=>states.push(status),fetcher:fetcher as typeof fetch})
 assert.deepEqual([r.success,r.unverified,r.failed],[false,1,1])
 assert.deepEqual(states,['uploading','unverified','uploading','error'])
})
test('invalid success shape and actual HTTP errors fail closed',async()=>{
 const r=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[row('one.txt')],onStatus:()=>{},
  fetcher:(async()=>Response.json({}, {status:200})) as typeof fetch})
 assert.equal(r.success,false)
 assert.equal(r.failed,1)
})


test('response SHA-256 must match uploaded bytes, including idempotent acknowledgement', async()=>{
 const original=row('verified.txt')
 const wrongHash='0'.repeat(64)
 for(const status of ['created','already_present']){
  const states:string[]=[]
  const result=await appendAdditionalOriginals({
   eventId:event,accessToken:'synthetic',originals:[original],
   onStatus:(_id,state)=>states.push(state),
   fetcher:(async()=>Response.json({status,sha256:wrongHash},
    {status:status==='created'?201:200})) as typeof fetch,
  })
  assert.equal(result.success,false)
  assert.equal(result.failed,1)
  assert.deepEqual(states,['uploading','error'])
 }
})

test('missing or malformed integrity hash cannot be treated as a successful upload', async()=>{
 for(const body of [{status:'created'},{status:'created',sha256:null},
  {status:'created',sha256:'invalid'}]){
  const result=await appendAdditionalOriginals({
   eventId:event,accessToken:'synthetic',originals:[row('test.txt')],
   onStatus:()=>{},fetcher:(async()=>Response.json(body,{status:201})) as typeof fetch,
  })
  assert.equal(result.success,false)
  assert.equal(result.failed,1)
 }
})

test('server 413, 409 and 503 remain errors and do not skip subsequent evidence',async()=>{
 const statuses:Array<[string,string]>=[]
 const errors=[413,409,503]
 let cursor=0
 const report=await appendAdditionalOriginals({
  eventId:event,accessToken:'synthetic',originals:errors.map((_,i)=>row('source-'+i+'.txt')),
  onStatus:(id,status)=>statuses.push([id,status]),
  fetcher:(async()=>Response.json({status:'created',sha256:'a'.repeat(64)},
   {status:errors[cursor++]})) as typeof fetch,
 })
 assert.equal(report.success,false)
 assert.equal(report.failed,3)
 assert.equal(cursor,3)
 assert.equal(statuses.filter(([,state])=>state==='error').length,3)
})

test('network disconnect followed by retry can acknowledge original by identical hash',async()=>{
 const fileRow=row('resume.txt')
 const updates:AdditionalOriginal['status'][]=[]
 let requests=0
 const fetcher=async(_url:RequestInfo|URL,options?:RequestInit)=>{
  requests++
  if(requests===1) throw new Error('Simulated disconnected client')
  const file=(options?.body as FormData).get('file') as File
  return Response.json({status:'already_present',
   sha256:createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')},
   {status:200})
 }
 const before=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[fileRow],onStatus:(_id,status)=>updates.push(status),
  fetcher:fetcher as typeof fetch})
 assert.equal(before.success,false)
 const after=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[{...fileRow,status:'error'}],onStatus:(_id,status)=>updates.push(status),
  fetcher:fetcher as typeof fetch})
 assert.equal(after.success,true)
 assert.equal(requests,2)
 assert.deepEqual(updates,['uploading','error','uploading','saved'])
})

test('audit-unverified state never triggers another write until manually reviewed',async()=>{
 let requests=0
 const report=await appendAdditionalOriginals({eventId:event,accessToken:'synthetic',
  originals:[row('unverified.txt','unverified')],onStatus:()=>{},
  fetcher:(async()=>{requests++;throw new Error('Unexpected write')}) as typeof fetch})
 assert.equal(report.success,false)
 assert.equal(report.unverified,1)
 assert.equal(requests,0)
})
