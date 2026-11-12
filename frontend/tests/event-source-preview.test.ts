import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  extractVerifiedEventSourcePreview,
  EventSourcePreviewError,
  mapSourcePreviewError,
} from '../src/lib/server/event-source-preview'
import { DocumentAccessError } from '../src/lib/server/event-document-access'
import { DocumentExtractError } from '../src/lib/sera/document-extraction'

const tenantId = '11111111-1111-4111-8111-111111111111'
const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const documentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const authUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const bytes = Buffer.from('%PDF-1.7\nSynthetic original bytes used only in test')
const hash = createHash('sha256').update(bytes).digest('hex')

function fixture(options: {
  tenant?: string
  manifestId?: string
  manifestHash?: string | null
  blob?: Buffer
  hashVerified?: boolean
  quota?: 'allowed' | 'limited' | 'unavailable'
  parseText?: string
  parseThrows?: Error
  name?: string
  mime?: string
} = {}) {
  const calls: string[] = []
  const dependencies = {
    listManifest: async (_admin: SupabaseClient, tenant: string, event: string) => {
      calls.push('list:' + tenant + '/' + event)
      return [{
        id: options.manifestId ?? documentId,
        sha256: options.manifestHash === undefined ? hash : options.manifestHash,
        sourceOrdinal: 2,
        fileName: 'synthetic.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        createdAt: '2026-11-12T12:00:00Z',
      }]
    },
    reserveQuota: async (_admin: SupabaseClient, user: string) => {
      calls.push('quota:' + user)
      return options.quota ?? 'allowed' as const
    },
    download: async (_admin: SupabaseClient, tenant: string, event: string, document: string) => {
      calls.push('download:' + tenant + '/' + event + '/' + document)
      return {
        bytes: new Uint8Array(options.blob ?? bytes),
        fileName: options.name ?? 'synthetic.pdf',
        mimeType: options.mime ?? 'application/pdf',
        hashVerified: options.hashVerified ?? true,
      }
    },
    parse: async (_buffer: Buffer, _kind: 'pdf' | 'docx', name: string) => {
      calls.push('parse:' + name)
      if (options.parseThrows) throw options.parseThrows
      return options.parseText ?? 'Synthetic first factual observation, still requiring human review.'
    },
  }
  const args = {
    admin: {} as SupabaseClient,
    tenantId: options.tenant ?? tenantId,
    eventId, documentId, authUserId,
  }
  return { dependencies, args, calls }
}

test('verified source preview binds exact document hash, ordinal and event/tenant; never writes analysis', async () => {
  const f = fixture()
  const result = await extractVerifiedEventSourcePreview(f.args, f.dependencies)
  assert.equal(result.documentId, documentId)
  assert.equal(result.sourceOrdinal, 2)
  assert.equal(result.sha256, hash)
  assert.equal(result.truncated, false)
  assert.equal(result.extractionStatus, 'TEXT_PREVIEW')
  assert.equal(result.reviewedByHuman, false)
  assert.equal(result.analysisChanged, false)
  assert.equal(result.citationLevel, 'DOCUMENT_ONLY')
  assert.equal(result.externalProviderUsed, false)
  assert.match(result.text, /Synthetic first factual/)
  assert.deepEqual(f.calls, [
    'list:' + tenantId + '/' + eventId,
    'quota:' + authUserId,
    'download:' + tenantId + '/' + eventId + '/' + documentId,
    'parse:synthetic.pdf',
  ])
})

test('preview over 60k characters is bounded and clearly marked as TRUNCATED', async () => {
  const f = fixture({ parseText: 'a'.repeat(120_000) })
  const result = await extractVerifiedEventSourcePreview(f.args, f.dependencies)
  assert.equal(result.text.length, 60_000)
  assert.equal(result.truncated, true)
  assert.equal(result.previewChars, 60_000)
  assert.equal(result.extractionStatus, 'TEXT_PREVIEW_TRUNCATED')
})

test('unknown source is refused before reserving quota, Storage or parsing', async () => {
  const f = fixture({ manifestId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })
  await assert.rejects(
    extractVerifiedEventSourcePreview(f.args, f.dependencies),
    (e: unknown) => e instanceof DocumentAccessError && e.code === 'NOT_FOUND',
  )
  assert.equal(f.calls.length, 1)
})

test('legacy source without SHA-256 is never advertised as verified extraction', async () => {
  const f = fixture({ manifestHash: null })
  await assert.rejects(
    extractVerifiedEventSourcePreview(f.args, f.dependencies),
    (e: unknown) => e instanceof EventSourcePreviewError && e.code === 'NO_VERIFIED_HASH',
  )
  assert.equal(f.calls.length, 1)
})

test('invalid UUID fails closed before any db, quota or Storage action', async () => {
  const f = fixture()
  await assert.rejects(
    extractVerifiedEventSourcePreview({ ...f.args, eventId: '../another-tenant' }, f.dependencies),
    (e: unknown) => e instanceof DocumentAccessError && e.code === 'INVALID_ID',
  )
  assert.deepEqual(f.calls, [])
})

test('distributed rate quota limits and outages block BEFORE private object download', async () => {
  for (const quota of ['limited', 'unavailable'] as const) {
    const f = fixture({ quota })
    await assert.rejects(
      extractVerifiedEventSourcePreview(f.args, f.dependencies),
      (e: unknown) => e instanceof EventSourcePreviewError &&
        e.code === (quota === 'limited' ? 'RATE_LIMIT' : 'RATE_LIMIT_UNAVAILABLE'),
    )
    assert.equal(f.calls.filter((call) => call.startsWith('download:')).length, 0)
    assert.equal(f.calls.filter((call) => call.startsWith('parse:')).length, 0)
  }
})

test('modified document, falsely verified legacy source, or swapped hash never yields preview text', async () => {
  for (const setup of [
    { blob: Buffer.from('%PDF-1.7\nMUTATED CONTENT') },
    { hashVerified: false },
    { manifestHash: 'e'.repeat(64) },
  ]) {
    const f = fixture(setup)
    await assert.rejects(
      extractVerifiedEventSourcePreview(f.args, f.dependencies),
      (e: unknown) => e instanceof DocumentAccessError && e.code === 'INTEGRITY_MISMATCH',
    )
    assert.equal(f.calls.filter((call) => call.startsWith('parse:')).length, 0)
  }
})

test('forged or contradictory MIME and extension fail closed without parsing', async () => {
  for (const setup of [{ name: 'synthetic.txt' }, { mime: 'text/html' }]) {
    const f = fixture(setup)
    await assert.rejects(
      extractVerifiedEventSourcePreview(f.args, f.dependencies),
      (e: unknown) => e instanceof EventSourcePreviewError && e.code === 'FORMAT_MISMATCH',
    )
    assert.equal(f.calls.filter((call) => call.startsWith('parse:')).length, 0)
  }
})

test('empty DOC-like extraction does not invent content or classify', async () => {
  const f = fixture({ parseText: '   \n  ' })
  await assert.rejects(
    extractVerifiedEventSourcePreview(f.args, f.dependencies),
    (e: unknown) => e instanceof EventSourcePreviewError && e.code === 'NO_TEXT',
  )
})

test('scanned PDF no-text response is explicit, no OCR falsely claimed', () => {
  const mapped = mapSourcePreviewError(
    new DocumentExtractError('PDF_NO_TEXT', 'internal parser message not to disclose'),
  )
  assert.equal(mapped.status, 422)
  assert.equal(mapped.code, 'NO_TEXT')
  assert.match(mapped.message, /não houve OCR|Não houve OCR/)
  assert.doesNotMatch(mapped.message, /internal parser message/)
})

test('quota and authorization failures return bounded and non-disclosing error codes', () => {
  assert.equal(mapSourcePreviewError(new EventSourcePreviewError('RATE_LIMIT')).status, 429)
  assert.equal(mapSourcePreviewError(new EventSourcePreviewError('RATE_LIMIT_UNAVAILABLE')).status, 503)
  assert.equal(mapSourcePreviewError(new EventSourcePreviewError('NO_VERIFIED_HASH')).status, 409)
  assert.equal(mapSourcePreviewError(new DocumentAccessError('NOT_FOUND')).status, 404)
  assert.equal(mapSourcePreviewError(new DocumentAccessError('INTEGRITY_MISMATCH')).status, 409)
  const unexpected = mapSourcePreviewError(new Error('Sensitive document contents'))
  assert.equal(unexpected.status, 503)
  assert.ok(!JSON.stringify(unexpected).includes('Sensitive document contents'))
})

test('parser failure cannot leak raw thrown exception into public error detail', () => {
  const mapped = mapSourcePreviewError(
    new DocumentExtractError('PARSE_FAILED', 'PRIVATE_PDF_TEXT_DO_NOT_LEAK'),
  )
  assert.equal(mapped.status, 422)
  assert.ok(!JSON.stringify(mapped).includes('PRIVATE_PDF_TEXT_DO_NOT_LEAK'))
})

test('page-aware source preview preserves exact ordinal and page-level PDF locator without causal change', async () => {
  const f = fixture()
  const expected = [
    {pageNumber:1,text:'Synthetic factual first page.',extractedChars:29,truncated:false,hasText:true},
    {pageNumber:2,text:'Synthetic separate second page.',extractedChars:31,truncated:false,hasText:true},
  ]
  const result = await extractVerifiedEventSourcePreview(f.args,{
    ...f.dependencies,
    parsePdfPages: async ()=>{
      f.calls.push('parse-pdf-pages')
      return {pages:expected,totalPages:2,truncated:false}
    },
  })
  assert.equal(result.citationLevel,'PDF_PAGE_INDEXED')
  assert.equal(result.totalPages,2)
  assert.deepEqual(result.pages,expected)
  assert.match(result.text,/\\[Página 1\\]/)
  assert.match(result.text,/\\[Página 2\\]/)
  assert.equal(result.reviewedByHuman,false)
  assert.equal(result.analysisChanged,false)
  assert.equal(result.externalProviderUsed,false)
  assert.ok(!f.calls.some(x=>x.startsWith('parse:')))
})

test('page parse failure cannot fabricate a page reference or return partial source text', async () => {
  const f = fixture()
  const originalCalls = f.calls.length
  await assert.rejects(
    extractVerifiedEventSourcePreview(f.args,{
      ...f.dependencies,
      parsePdfPages: async ()=>{
        throw new Error('INTENTIONALLY FAILED PDF PAGE TEXT')
      },
    }),
    /INTENTIONALLY FAILED PDF PAGE TEXT/,
  )
  assert.ok(f.calls.length>originalCalls)
})
