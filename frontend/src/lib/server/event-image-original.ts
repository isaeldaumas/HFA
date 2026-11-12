/**
 * Static raster evidence preflight. Reject animations, malformed containers,
 * dimensions exceeding a conservative pixel budget and format masquerading.
 * This validates format structure, NOT the semantic truth of image contents.
 */
export type EvidenceImageKind = 'png' | 'jpg' | 'webp'
export const IMAGE_PIXEL_LIMIT = 25_000_000
export class ImageOriginalError extends Error {
  constructor(public readonly code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'ANIMATED_IMAGE') {
    super(code); this.name = 'ImageOriginalError'
  }
}
const invalid = (): never => { throw new ImageOriginalError('INVALID_IMAGE') }
const oversized = (): never => { throw new ImageOriginalError('IMAGE_TOO_LARGE') }
function checkDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1) invalid()
  if (width > 8192 || height > 8192 || width * height > IMAGE_PIXEL_LIMIT) oversized()
  return {width,height}
}
const starts = (b: Buffer, pattern: number[]) =>
  pattern.every((byte,index)=>b[index] === byte)

function png(b: Buffer) {
  if (b.length < 57 || !starts(b,[137,80,78,71,13,10,26,10]) ||
      b.readUInt32BE(8) !== 13 || b.toString('ascii',12,16) !== 'IHDR') invalid()
  const result = checkDimensions(b.readUInt32BE(16),b.readUInt32BE(20))
  const depth = b[24], color = b[25]
  if (![1,2,4,8,16].includes(depth) || ![0,2,3,4,6].includes(color) ||
      b[26] !== 0 || b[27] !== 0 || ![0,1].includes(b[28])) invalid()
  let off = 8, seenData=false, seenEnd=false
  while (off + 12 <= b.length) {
    const len=b.readUInt32BE(off), type=b.toString('ascii',off+4,off+8)
    if (!/^[A-Za-z]{4}$/.test(type) || len > b.length - off - 12) invalid()
    if (type==='acTL') throw new ImageOriginalError('ANIMATED_IMAGE')
    if (type==='IDAT') seenData=true
    if (type==='IEND') {
      if (len !== 0 || off+12 !== b.length) invalid()
      seenEnd=true
      break
    }
    off += 12+len
  }
  if (!seenData || !seenEnd) invalid()
  return result
}

function jpeg(b: Buffer) {
  if (b.length < 16 || !starts(b,[255,216]) ||
      b[b.length-2] !== 255 || b[b.length-1] !== 217) invalid()
  let offset=2, dimension: {width:number,height:number}|null=null, sawScan=false
  while (offset < b.length-2) {
    if (b[offset]!==255) invalid()
    while (b[offset]===255) offset++
    const marker=b[offset++]
    if (marker===0xda) { sawScan=true; break }
    if (marker===0xd9 || marker===0x00 || (marker>=0xd0&&marker<=0xd7)) invalid()
    if (offset+2>b.length-2) invalid()
    const len=b.readUInt16BE(offset)
    if (len<2 || offset+len>b.length-2) invalid()
    if ([0xc0,0xc1,0xc2].includes(marker)) {
      if (len<8 || b[offset+2]!==8) invalid()
      dimension=checkDimensions(b.readUInt16BE(offset+5),b.readUInt16BE(offset+3))
    } else if (marker>=0xc0 && marker<=0xcf &&
      ![0xc4,0xc8,0xcc].includes(marker)) invalid()
    offset+=len
  }
  if (!dimension || !sawScan) invalid()
  return dimension
}

function webp(b: Buffer) {
  if (b.length<30 || b.toString('ascii',0,4)!=='RIFF' ||
      b.toString('ascii',8,12)!=='WEBP' ||
      b.readUInt32LE(4)!==b.length-8) invalid()
  let off=12, dims: {width:number,height:number}|null=null
  let primary=false
  while (off+8<=b.length) {
    const tag=b.toString('ascii',off,off+4)
    const len=b.readUInt32LE(off+4), start=off+8
    if (len>b.length-start || start+len+(len%2)>b.length) invalid()
    if (tag==='ANIM' || tag==='ANMF') throw new ImageOriginalError('ANIMATED_IMAGE')
    if (tag==='VP8X') {
      if (len!==10 || b[start]&0xc1) invalid()
      if (b[start]&0x02) throw new ImageOriginalError('ANIMATED_IMAGE')
      const width=1+b[start+4]+(b[start+5]<<8)+(b[start+6]<<16)
      const height=1+b[start+7]+(b[start+8]<<8)+(b[start+9]<<16)
      dims=checkDimensions(width,height)
    } else if (tag==='VP8 ') {
      if (len<10 || b[start+3]!==0x9d || b[start+4]!==0x01 || b[start+5]!==0x2a) invalid()
      const d=checkDimensions(b.readUInt16LE(start+6)&0x3fff,b.readUInt16LE(start+8)&0x3fff)
      if(dims && (dims.width!==d.width || dims.height!==d.height)) invalid()
      dims=d;primary=true
    } else if (tag==='VP8L') {
      if (len<5 || b[start]!==0x2f) invalid()
      const packed=b.readUInt32LE(start+1)
      const d=checkDimensions((packed&0x3fff)+1,((packed>>>14)&0x3fff)+1)
      if(dims && (dims.width!==d.width || dims.height!==d.height)) invalid()
      dims=d;primary=true
    }
    off=start+len+(len%2)
  }
  if (off!==b.length || !dims || !primary) invalid()
  return dims
}
export function verifyRasterOriginal(bytes: Buffer, kind: EvidenceImageKind) {
  if (bytes.length<1 || bytes.length>3_800_000) oversized()
  if(kind==='png') return png(bytes)
  if(kind==='jpg') return jpeg(bytes)
  if(kind==='webp') return webp(bytes)
  return invalid()
}
