import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyRasterOriginal,ImageOriginalError} from '../src/lib/server/event-image-original'
import {prepareEventAttachment,EventAttachmentError} from '../src/lib/server/event-attachment'

const samples = {
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQAAAABazTCJAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAACYktHRAAB3YoTpAAAAAd0SU1FB+oLDBYHHuvoaIsAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjYtMTEtMTJUMjI6MDc6MzArMDA6MDAhjwQwAAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI2LTExLTEyVDIyOjA3OjMwKzAwOjAwUNK8jAAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNi0xMS0xMlQyMjowNzozMCswMDowMAfHnVMAAAAMSURBVAjXYzjAcAAAAwQBgcU7oqkAAAAASUVORK5CYII=','base64'),
  jpg: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAALCAACAAIBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==','base64'),
  webp: Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAgA0JaQAA3AA/vuUAAA=','base64'),
}
test('real tiny PNG/JPEG/WebP originals are recognized without OCR',async()=>{
  for(const [kind,data] of Object.entries(samples)) {
    assert.deepEqual(verifyRasterOriginal(data,kind as 'png'|'jpg'|'webp'),{width:2,height:2})
    const mime=kind==='jpg'?'image/jpeg':'image/'+kind
    const file=new File([data], 'source.'+kind,{type:mime})
    const prepared=await prepareEventAttachment(file,{allowImages:true})
    assert.equal(prepared.kind,kind)
    assert.equal(prepared.mimeType,mime)
    assert.deepEqual(prepared.data,data)
  }
})
test('initial event creation does not accept raster originals',async()=>{
  await assert.rejects(prepareEventAttachment(new File([samples.png],'image.png',{type:'image/png'})),
    (e:unknown)=>e instanceof EventAttachmentError&&e.code==='INVALID_TYPE')
})
test('MIME/extension mismatch, forged magic and corrupt truncated image fail closed',async()=>{
  for(const [bytes,name,mime] of [
    [samples.png,'fake.jpg','image/jpeg'],
    [samples.jpg,'fake.png','image/png'],
    [samples.webp,'fake.webp','image/png'],
    [samples.png.subarray(0,28),'broken.png','image/png'],
    [Buffer.from('not an image'),'fake.png','image/png'],
  ] as const) {
    await assert.rejects(
      prepareEventAttachment(new File([bytes],name,{type:mime}),{allowImages:true}),
      (e:unknown)=>e instanceof EventAttachmentError&&e.code==='INVALID_TYPE')
  }
})
test('oversized declared PNG dimensions blocked even if compressed bytes small',()=>{
  const crafted=Buffer.from(samples.png)
  crafted.writeUInt32BE(8193,16)
  assert.throws(()=>verifyRasterOriginal(crafted,'png'),
    (e:unknown)=>e instanceof ImageOriginalError&&e.code==='IMAGE_TOO_LARGE')
})
test('animated PNG is rejected even with ordinary IHDR',()=>{
  const png=samples.png
  const iend=png.lastIndexOf(Buffer.from('IEND','ascii'))-4
  assert.ok(iend>20)
  const chunk=Buffer.alloc(20)
  chunk.writeUInt32BE(8,0)
  chunk.write('acTL',4,'ascii')
  const animated=Buffer.concat([png.subarray(0,iend),chunk,png.subarray(iend)])
  assert.throws(()=>verifyRasterOriginal(animated,'png'),
    (e:unknown)=>e instanceof ImageOriginalError&&e.code==='ANIMATED_IMAGE')
})
test('JPEG and WebP missing essential container bytes are rejected',()=>{
  for(const [bytes,kind] of [
    [samples.jpg.subarray(0,samples.jpg.length-2),'jpg'],
    [samples.webp.subarray(0,samples.webp.length-4),'webp'],
  ] as const) assert.throws(()=>verifyRasterOriginal(Buffer.from(bytes),kind),
    (e:unknown)=>e instanceof ImageOriginalError&&e.code==='INVALID_IMAGE')
})
test('image is never treated as trusted document extraction',async()=>{
  const file=new File([samples.jpg],'source.jpeg',{type:'image/jpeg'})
  const prepared=await prepareEventAttachment(file,{allowImages:true})
  assert.equal(prepared.kind,'jpg')
  assert.ok(!Object.hasOwn(prepared,'text'))
  assert.ok(!Object.hasOwn(prepared,'reviewedByHuman'))
})
