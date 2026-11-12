import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {
  LocalOcrError,downloadVerifiedOcrOriginal,prepareOcrText,
  validateLocalOcrSource,OCR_RANGE_BYTES,
} from '../src/lib/browser/local-ocr-original'

const data=Buffer.from('SYNTHETIC FIXTURE, NOT A REAL EVENT')
const base={
  eventId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  sourceOrdinal:1,
  sha256:createHash('sha256').update(data).digest('hex'),
  mimeType:'image/png',
  sizeBytes:data.byteLength,
}
function response(bytes: Uint8Array, status=200, mime='image/png', range?:string) {
  return new Response(Uint8Array.from(bytes).buffer,{status,headers:{
    'content-type':mime,'content-length':String(bytes.byteLength),
    ...(range?{'content-range':range}:{}),
  }})
}
test('verified own document bytes are returned without any OCR/provider mutation',async()=>{
  let calls=0
  const original=await downloadVerifiedOcrOriginal(base,'token',async(url,options)=>{
    calls++
    assert.equal(url,'/api/events/'+base.eventId+'/documents/'+base.documentId)
    assert.equal(options?.method,'GET')
    assert.equal(options?.redirect,'error')
    assert.equal(options?.cache,'no-store')
    assert.equal(options?.credentials,'omit')
    assert.equal((options?.headers as Record<string,string>)?.Authorization,'Bearer token')
    return response(data)
  })
  assert.equal(calls,1)
  assert.equal(original.type,'image/png')
  assert.deepEqual(Buffer.from(await original.arrayBuffer()),data)
})
test('missing hash, forged tenant path, missing token, unsupported MIME and large image block before network',async()=>{
  for(const patch of [
    {sha256:'a'.repeat(63)},
    {eventId:'../../foreign'},
    {mimeType:'text/plain'},
    {sourceOrdinal:0},
    {sizeBytes:OCR_RANGE_BYTES+1},
  ]) {
    let calls=0
    await assert.rejects(
      downloadVerifiedOcrOriginal({...base,...patch},'token',async()=>{
        calls++;return response(data)
      }),
      (e:unknown)=>e instanceof LocalOcrError&&e.code==='INVALID_SOURCE',
    )
    assert.equal(calls,0)
  }
  assert.throws(()=>validateLocalOcrSource(base,''),
    (e:unknown)=>e instanceof LocalOcrError&&e.code==='INVALID_SOURCE')
})
test('tampered bytes and forged MIME are denied after download and before recognition',async()=>{
  for(const returned of [
    response(Buffer.from('DIFFERENT BYTES')),
    response(Buffer.from(data).fill(70)),
    response(data,200,'text/html'),
    response(data,206),
  ]) {
    await assert.rejects(
      downloadVerifiedOcrOriginal(base,'token',async()=>returned),
      (e:unknown)=>e instanceof LocalOcrError&&
        ['INTEGRITY_MISMATCH','DOWNLOAD_FAILED'].includes(e.code))
  }
})
test('a large verified PDF is downloaded only using exact bounded HTTP206 ranges',async()=>{
  const pdf=Buffer.alloc(OCR_RANGE_BYTES+100,'p')
  const source={...base,mimeType:'application/pdf',sizeBytes:pdf.length,
    sha256:createHash('sha256').update(pdf).digest('hex')}
  let calls=0
  const got=await downloadVerifiedOcrOriginal(source,'token',async(_url,options)=>{
    const expectedStart=calls===0?0:OCR_RANGE_BYTES
    const expectedEnd=calls===0?OCR_RANGE_BYTES-1:pdf.length-1
    assert.equal((options?.headers as Record<string,string>).Range,
      'bytes='+expectedStart+'-'+expectedEnd)
    calls++
    return response(pdf.subarray(expectedStart,expectedEnd+1),206,
      'application/pdf','bytes '+expectedStart+'-'+expectedEnd+'/'+pdf.length)
  })
  assert.equal(calls,2)
  assert.deepEqual(Buffer.from(await got.arrayBuffer()),pdf)
})
test('range mismatch, redirects or partial data do not yield evidence',async()=>{
  const pdf=Buffer.alloc(OCR_RANGE_BYTES+5,'p')
  const source={...base,mimeType:'application/pdf',sizeBytes:pdf.length,
    sha256:createHash('sha256').update(pdf).digest('hex')}
  await assert.rejects(downloadVerifiedOcrOriginal(source,'token',async()=>
    response(pdf.subarray(0,OCR_RANGE_BYTES),206,'application/pdf','bytes 0-100/999')),
    (e:unknown)=>e instanceof LocalOcrError&&e.code==='INTEGRITY_MISMATCH')
  await assert.rejects(downloadVerifiedOcrOriginal(base,'token',async()=>response(data,302)),
    (e:unknown)=>e instanceof LocalOcrError&&e.code==='DOWNLOAD_FAILED')
})
test('OCR output is bounded, untrusted, no claim of human review or scientific classification',()=>{
  assert.deepEqual(prepareOcrText('  leitura inicial  '),{
    text:'leitura inicial',truncated:false,
  })
  assert.deepEqual(prepareOcrText('X'.repeat(60_001)),{
    text:'X'.repeat(60_000),truncated:true,
  })
  assert.equal(prepareOcrText('A\u202eB\u0000').text,'AB')
  for(const bad of ['',{},null])assert.throws(()=>prepareOcrText(bad),
    (e:unknown)=>e instanceof LocalOcrError)
})
