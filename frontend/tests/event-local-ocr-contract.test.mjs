import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {readFileSync,statSync} from 'node:fs'
const root=new URL('../',import.meta.url)
const read=(path)=>readFileSync(new URL(path,root))
const text=(path)=>read(path).toString('utf8')
const hash=(buf)=>createHash('sha256').update(buf).digest('hex')
test('each self-hosted OCR binary matches the exact locked package asset',()=>{
  const pairs=[
    ['public/ocr/worker.min.js','node_modules/tesseract.js/dist/worker.min.js'],
    ['public/ocr/pdf.worker.min.mjs','node_modules/pdfjs-dist/build/pdf.worker.min.mjs'],
    ['public/ocr/lang/por.traineddata.gz','node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz'],
    ['public/ocr/lang/eng.traineddata.gz','node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
  ]
  for(const flavor of ['lstm','simd-lstm','relaxedsimd-lstm']){
    for(const ext of ['wasm','wasm.js']){
      const name='tesseract-core-'+flavor+'.'+ext
      pairs.push(['public/ocr/core/'+name,'node_modules/tesseract.js-core/'+name])
    }
  }
  for(const [publicAsset,installed] of pairs){
    const b=read(publicAsset),a=read(installed)
    assert.equal(hash(b),hash(a),publicAsset)
    assert.ok(statSync(new URL(publicAsset,root)).size>0)
  }
})
test('OCR runtime paths are same-origin; no external OCR provider or backend write',()=>{
  const ui=text('src/components/sera/EventLocalOcrPreview.tsx')
  const fetcher=text('src/lib/browser/local-ocr-original.ts')
  assert.match(ui,/workerPath:'\/ocr\/worker\.min\.js'/)
  assert.match(ui,/corePath:'\/ocr\/core'/)
  assert.match(ui,/langPath:'\/ocr\/lang'/)
  assert.match(ui,/workerBlobURL:false/)
  assert.match(ui,/cacheMethod:'none'/)
  assert.match(ui,/pdfjs\.GlobalWorkerOptions\.workerSrc='\/ocr\/pdf\.worker\.min\.mjs'/)
  assert.match(ui,/reviewedByHuman:false,analysisChanged:false,externalProviderUsed:false/)
  assert.match(ui,/OCR_UNREVIEWED/)
  assert.match(ui,/pdf\.getPage\(pageNumber\)/)
  assert.match(ui,/page\.pageNumber/)
  assert.doesNotMatch(ui,/https?:\/\/|createSignedUrl|new OpenAI|new Anthropic|\.insert\(|\.upsert\(|\.update\(/)
  assert.match(fetcher,/redirect:'error',cache:'no-store',credentials:'omit'/)
  assert.match(fetcher,/crypto\.subtle\.digest\('SHA-256',data\)/)
  assert.doesNotMatch(fetcher,/https?:\/\/|fetch\([^)]*api\/analyze/)
})
test('OCR entrypoint is restricted to existing event analyst UI and guarded by SHA',()=>{
  const panel=text('src/components/sera/EventDocumentsPanel.tsx')
  assert.match(panel,/canAppend && item\.mimeType/)
  assert.match(panel,/item\.mimeType === 'application\/pdf'/)
  assert.match(panel,/sha256=\{item\.sha256\}/)
  assert.match(panel,/sizeBytes=\{item\.sizeBytes\}/)
  assert.match(panel,/accessToken=\{accessToken\}/)
  assert.match(panel,/OCR é opcional/)
  const page=text('src/components/sera/DocumentUpload.tsx')
  assert.doesNotMatch(page,/EventLocalOcrPreview/)
})
test('static assets carry component licenses for redistribution',()=>{
  for(const f of ['public/ocr/core/LICENSE',
    'public/ocr/TESSERACT_JS_LICENSE.md','public/ocr/PDFJS_LICENSE']) {
    assert.ok(read(f).length>1000)
  }
})


test('human correction, local self-declaration and export are never silent or persisted',()=>{
  const ui=text('src/components/sera/EventLocalOcrPreview.tsx')
  const helper=text('src/lib/browser/local-ocr-human-review.ts')
  assert.match(ui,/buildLocalOcrReviewRecord/)
  assert.match(ui,/comparedToOriginal/)
  assert.match(ui,/checkedCorrections/)
  assert.match(ui,/setLocalReview\(null\)/)
  assert.match(ui,/result\.truncated/)
  assert.match(ui,/Baixar transcrição e proveniência/)
  assert.match(ui,/downloadLocalReview/)
  assert.match(ui,/JSON\.stringify\(localReview/)
  assert.match(ui,/Sem assinatura, identificação verificável/)
  assert.match(helper,/reviewPersisted:false/)
  assert.match(helper,/reviewSignatureVerified:false/)
  assert.match(helper,/scientificallyValidated:false/)
  assert.match(helper,/analysisChanged:false/)
  assert.doesNotMatch(helper,/fetch\(|\.insert\(|\.update\(|\.upsert\(|https?:\/\//)
})
