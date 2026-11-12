import assert from 'node:assert/strict'
import test from 'node:test'
import PDFDocument from 'pdfkit'
import JSZip from 'jszip'
import {
  detectDocumentKind,
  extractTextFromBuffer,
  cleanExtractedText,
} from '../src/lib/sera/document-extraction'

async function syntheticPdf(text: string): Promise<Buffer> {
  const document = new PDFDocument({ compress: false })
  const chunks: Buffer[] = []
  document.on('data', (data: Buffer) => chunks.push(data))
  const done = new Promise<Buffer>((resolve, reject) => {
    document.on('end', () => resolve(Buffer.concat(chunks)))
    document.on('error', reject)
  })
  document.fontSize(12).text(text)
  document.end()
  return done
}

async function syntheticDocx(text: string): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>')
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>')
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

test('actual local PDF parser reads synthetic original without OCR', async () => {
  const source = 'Synthetic helicopter crew briefing recorded for parser regression.'
  const pdf = await syntheticPdf(source)
  assert.equal(detectDocumentKind(pdf), 'pdf')
  const text = cleanExtractedText(await extractTextFromBuffer(pdf, 'pdf', 'synthetic.pdf'))
  assert.ok(text.includes('Synthetic helicopter crew briefing'))
  assert.ok(text.includes('parser regression'))
})

test('actual local DOCX parser reads synthetic original without external service', async () => {
  const source = 'Synthetic source document for explicit human review.'
  const docx = await syntheticDocx(source)
  assert.equal(detectDocumentKind(docx), 'docx')
  const text = cleanExtractedText(await extractTextFromBuffer(docx, 'docx', 'synthetic.docx'))
  assert.ok(text.includes(source))
})
