import assert from 'node:assert/strict'
import test from 'node:test'
import PDFDocument from 'pdfkit'
import {
  extractPdfPageProvenance,
  PdfPageProvenanceError,
} from '../src/lib/server/pdf-page-provenance'

async function syntheticPdf(pages: string[]): Promise<Buffer> {
  const doc = new PDFDocument({compress:false})
  const chunks: Buffer[] = []
  doc.on('data',(chunk:Buffer)=>chunks.push(chunk))
  const complete = new Promise<Buffer>((resolve,reject)=>{
    doc.on('end',()=>resolve(Buffer.concat(chunks)))
    doc.on('error',reject)
  })
  pages.forEach((value,index)=>{
    if(index)doc.addPage()
    doc.fontSize(12).text(value)
  })
  doc.end()
  return complete
}

test('PDF parser supplies factual pageNumber 1 and 2, without merging their texts',async()=>{
  const pdf=await syntheticPdf([
    'Synthetic first page HFA aircraft takeoff.',
    'Synthetic second page references offshore arrival.',
  ])
  const out=await extractPdfPageProvenance(pdf)
  assert.equal(out.totalPages,2)
  assert.equal(out.truncated,false)
  assert.deepEqual(out.pages.map(x=>x.pageNumber),[1,2])
  assert.match(out.pages[0].text,/first page/)
  assert.doesNotMatch(out.pages[0].text,/second page/)
  assert.match(out.pages[1].text,/second page/)
  assert.doesNotMatch(out.pages[1].text,/first page/)
  assert.ok(out.pages.every(x=>x.hasText&&!x.truncated))
})

test('a PDF with a page containing no text does not manufacture OCR',async()=>{
  const pdf=await syntheticPdf([
    'Page one visible synthetic textual observation.',
    '',
  ])
  const result=await extractPdfPageProvenance(pdf)
  assert.equal(result.totalPages,2)
  assert.equal(result.pages[1].pageNumber,2)
  assert.equal(result.pages[1].hasText,false)
  assert.equal(result.pages[1].text,'')
})

test('content-abundant PDF limits returned text to at most 60k chars and labels truncation',async()=>{
  const veryLong='SYNTHETIC EVIDENCE LINE '.repeat(3500)
  const pdf=await syntheticPdf([veryLong])
  const result=await extractPdfPageProvenance(pdf)
  assert.ok(result.pages.length>=1)
  assert.ok(result.pages.reduce((sum,p)=>sum+p.text.length,0)<=60_000)
  assert.equal(result.truncated,true)
})

test('non-PDF and invalid signature are refused without page references',async()=>{
  for(const input of [Buffer.alloc(0),Buffer.from('NOT A PDF'),Buffer.from('%PDF')]){
    await assert.rejects(extractPdfPageProvenance(input),
      (e:unknown)=>e instanceof PdfPageProvenanceError&&e.code==='INVALID_PDF')
  }
})

test('more than 80 PDF pages cannot be represented as a fully indexed source',async()=>{
  const pdf=await syntheticPdf(Array.from({length:81},(_,index)=>
    'Synthetic textual sample page '+(index+1)))
  await assert.rejects(extractPdfPageProvenance(pdf),
    (e:unknown)=>e instanceof PdfPageProvenanceError&&e.code==='PAGE_LIMIT')
})
