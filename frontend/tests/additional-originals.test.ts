import assert from 'node:assert/strict'
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
  return Response.json({status:attempts===1?'created':'already_present'},
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
