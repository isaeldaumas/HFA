import test from 'node:test'
import assert from 'node:assert/strict'
import { selectMultipartFiles } from '../../../frontend/src/lib/gemini-multifile-form'
import {
  prepareValidatedSourceFiles,
  persistUploadedSourceFiles,
  UploadValidationError,
} from '../../../frontend/src/lib/event-document-persistence'
import { MAX_BATCH_FILE_COUNT } from '../../../frontend/src/lib/gemini-multifile-types'

const narrative = 'Ocorrência aeronáutica: durante a aproximação, a tripulação precisou arremeter.'

function txt(name: string, text = narrative) {
  return new File([Buffer.from(text, 'utf8')], name, { type: 'text/plain' })
}

function fakeAdmin(opts: {
  failUploadAt?: number
  failDbAt?: number
  failCleanup?: boolean
} = {}) {
  const uploaded: string[] = []
  const inserted: Record<string, unknown>[] = []
  const removed: string[] = []
  const uploadOptions: Record<string, unknown>[] = []
  let attemptUpload = 0
  let attemptInsert = 0

  const storage = {
    from(bucket: string) {
      assert.equal(bucket, 'analysis-documents')
      return {
        async upload(path: string, data: Buffer, config: Record<string, unknown>) {
          attemptUpload++
          uploadOptions.push(config)
          if (attemptUpload === opts.failUploadAt) return { error: { message: 'synthetic upload failure' } }
          uploaded.push(path)
          assert.ok(data.length > 0)
          return { error: null }
        },
        async remove(paths: string[]) {
          removed.push(...paths)
          return { error: opts.failCleanup ? { message: 'synthetic cleanup failure' } : null }
        },
      }
    },
  }
  const admin = {
    storage,
    from(table: string) {
      assert.equal(table, 'event_documents')
      return {
        async insert(row: Record<string, unknown>) {
          attemptInsert++
          if (attemptInsert === opts.failDbAt) {
            return { error: { message: 'synthetic insert failure' } }
          }
          inserted.push(row)
          return { error: null }
        },
      }
    },
  }
  return { admin, uploaded, inserted, removed, uploadOptions }
}

function params(admin: unknown, files: Awaited<ReturnType<typeof prepareValidatedSourceFiles>>) {
  return {
    admin: admin as never,
    tenantId: 'tenant-alpha',
    submittedById: 'public-user-alpha',
    authUserId: '10000000-aaaa-4000-a000-000000000001',
    eventId: 'event-one',
    files,
  }
}

test('modern files[] wins over duplicate legacy file part (multipart identity is distinct)', () => {
  const form = new FormData()
  form.append('files', txt('one.txt'))
  form.append('files', txt('two.txt'))
  form.set('file', txt('one.txt'))
  const selected = selectMultipartFiles(form)
  assert.equal(selected.length, 2)
  assert.deepEqual(selected.map(x => x.name), ['one.txt', 'two.txt'])
})

test('legacy file-only submission is still accepted', () => {
  const form = new FormData()
  form.append('file', txt('legacy.txt'))
  const selected = selectMultipartFiles(form)
  assert.equal(selected.length, 1)
  assert.equal(selected[0].name, 'legacy.txt')
})

test('maximum of five valid files is not rejected due to legacy alias', async () => {
  const form = new FormData()
  for (let i = 0; i < MAX_BATCH_FILE_COUNT; i++) {
    form.append('files', txt('source-' + i + '.txt'))
  }
  form.set('file', txt('source-0.txt'))
  const files = selectMultipartFiles(form)
  assert.equal(files.length, MAX_BATCH_FILE_COUNT)
  assert.equal((await prepareValidatedSourceFiles(files)).length, MAX_BATCH_FILE_COUNT)
})

test('six files are rejected before database or object-storage activity', async () => {
  const files = Array.from({ length: 6 }, (_, i) => txt('file-' + i + '.txt'))
  await assert.rejects(prepareValidatedSourceFiles(files), (error: unknown) =>
    error instanceof UploadValidationError && error.code === 'TOO_MANY_FILES')
})

test('zero-byte, malformed UTF-8 and PDF-spoofing payloads fail closed', async () => {
  const rejected = [
    new File([], 'empty.txt', { type: 'text/plain' }),
    new File([Uint8Array.from([0xc3, 0x28, 0xfe])], 'binary.txt', { type: 'text/plain' }),
    new File(['This is not a PDF'], 'spoof.pdf', { type: 'application/pdf' }),
    new File([Uint8Array.from([0x01, 0x02, 0x03])], 'binary.txt', { type: 'text/plain' }),
  ]
  for (const file of rejected) {
    await assert.rejects(prepareValidatedSourceFiles([file]), (error: unknown) =>
      error instanceof UploadValidationError && error.code === 'INVALID_DOCUMENT')
  }
})

test('preparation produces immutable evidence inputs and never calls storage', async () => {
  const prepared = await prepareValidatedSourceFiles([txt('prepared.txt')])
  assert.equal(prepared.length, 1)
  assert.equal(prepared[0].security.valid, true)
  assert.equal(prepared[0].security.detectedKind, 'txt')
})

test('successful storage and event_documents insert returns only confirmed descriptor', async () => {
  const m = fakeAdmin()
  const prepared = await prepareValidatedSourceFiles([txt('one.txt')])
  const report = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(report.complete, true)
  assert.equal(report.persisted, 1)
  assert.equal(report.requested, 1)
  assert.equal(m.inserted.length, 1)
  assert.equal(m.inserted[0].tenant_id, 'tenant-alpha')
  assert.equal(m.inserted[0].event_id, 'event-one')
  assert.equal(report.descriptors[0].status, 'stored_unprocessed')
  assert.equal(report.descriptors[0].wordCount, 0)
  assert.equal(m.uploadOptions[0].upsert, false)
  assert.equal(m.removed.length, 0)
  assert.match(report.descriptors[0].storagePath, /^10000000-aaaa-4000-a000-000000000001\/events\/event-one\/1_[a-f0-9]{10}_one.txt$/)
  assert.equal(m.uploadOptions[0].contentType, 'text/plain')
  assert.equal(m.inserted[0].uploaded_by, 'public-user-alpha')
})

test('storage failure never inserts an event_documents row or returns success', async () => {
  const m = fakeAdmin({ failUploadAt: 1 })
  const prepared = await prepareValidatedSourceFiles([txt('failure.txt')])
  const report = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(report.complete, false)
  assert.equal(report.persisted, 0)
  assert.equal(m.inserted.length, 0)
  assert.equal(report.failures[0].reason, 'STORAGE_FAILED')
})

test('database insertion failure removes only the object created by this request', async () => {
  const m = fakeAdmin({ failDbAt: 1 })
  const prepared = await prepareValidatedSourceFiles([txt('metadata.txt')])
  const report = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(report.complete, false)
  assert.equal(report.persisted, 0)
  assert.equal(m.inserted.length, 0)
  assert.equal(m.removed.length, 1)
  assert.equal(m.removed[0], m.uploaded[0])
  assert.equal(report.failures[0].reason, 'METADATA_FAILED')
})

test('rollback failure is explicitly surfaced as possible orphan', async () => {
  const m = fakeAdmin({ failDbAt: 1, failCleanup: true })
  const prepared = await prepareValidatedSourceFiles([txt('metadata.txt')])
  const report = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(report.complete, false)
  assert.equal(report.descriptors.length, 0)
  assert.equal(report.failures[0].reason, 'METADATA_FAILED_CLEANUP_FAILED')
})

test('partial batch never reports complete and persists only successful rows', async () => {
  const m = fakeAdmin({ failUploadAt: 2 })
  const prepared = await prepareValidatedSourceFiles([txt('first.txt'), txt('second.txt')])
  const report = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(report.complete, false)
  assert.equal(report.requested, 2)
  assert.equal(report.persisted, 1)
  assert.equal(report.failures.length, 1)
  assert.equal(m.inserted.length, 1)
})

test('image is preserved only as visual evidence; no false OCR claim', async () => {
  const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0])
  const file = new File([png], 'photo.png', { type: 'image/png' })
  const prepared = await prepareValidatedSourceFiles([file])
  const m = fakeAdmin()
  const result = await persistUploadedSourceFiles(params(m.admin, prepared))
  assert.equal(result.complete, true)
  assert.equal(result.descriptors[0].status, 'unsupported_ocr')
})

test('persist rejects any security-invalid prepared input even if caller skips preflight', async () => {
  const m = fakeAdmin()
  const prepared = await prepareValidatedSourceFiles([txt('valid.txt')])
  const compromised = { ...prepared[0], security: { ...prepared[0].security, valid: false } }
  await assert.rejects(persistUploadedSourceFiles(params(m.admin, [compromised])),
    (error: unknown) => error instanceof UploadValidationError)
  assert.equal(m.uploaded.length, 0)
})

test('invalid or forged auth ID cannot pick another Storage RLS folder', async () => {
  const m = fakeAdmin()
  const files = await prepareValidatedSourceFiles([txt('safe.txt')])
  const request = params(m.admin, files)
  await assert.rejects(
    persistUploadedSourceFiles({ ...request, authUserId: '../other-tenant' }),
    (error: unknown) => error instanceof UploadValidationError &&
      error.code === 'INVALID_AUTH_IDENTITY',
  )
  assert.equal(m.uploaded.length, 0)
  assert.equal(m.inserted.length, 0)
})

test('storage bucket MIME migration is additive, private and has drift guards', async () => {
  const { readFileSync, readdirSync } = await import('node:fs')
  const { resolve, join } = await import('node:path')
  const folder = resolve(__dirname, '../../../supabase/migrations')
  const file = readdirSync(folder).find(name => name.endsWith('_hfa_multifile_analysis_documents_mime.sql'))
  assert.ok(file)
  const sql = readFileSync(join(folder, file), 'utf8')
  for (const mime of [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'image/jpeg', 'image/png', 'image/webp',
  ]) {
    assert.ok(sql.includes(mime), 'Missing MIME: ' + mime)
  }
  assert.match(sql, /HFA_MULTIFILE_BUCKET_NOT_PRIVATE/)
  assert.match(sql, /HFA_MULTIFILE_BUCKET_MIMES_DRIFT/)
  assert.match(sql, /file_size_limit/)
  assert.match(sql, /UPDATE storage\.buckets/)
  assert.doesNotMatch(sql, /CREATE POLICY|DROP POLICY|SET\s+public\s*=\s*true/i)
})
