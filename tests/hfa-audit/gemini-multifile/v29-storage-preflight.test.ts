import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertStorageBucketSupportsSourceFiles,
  checkDocumentBucketPolicy,
  prepareValidatedSourceFiles,
  UploadValidationError,
  HFA_DOCUMENT_BUCKET_MIME_TYPES,
  HFA_DOCUMENT_BUCKET_INITIAL_MIME_TYPES,
  HFA_DOCUMENT_BUCKET_LIMIT,
} from '../../../frontend/src/lib/event-document-persistence'
import {
  runStagingStorageCheck,
  validateStagingTarget,
} from '../../../frontend/scripts/hfa-storage-mime-staging'

const MIME_LEGACY = [...HFA_DOCUMENT_BUCKET_INITIAL_MIME_TYPES]
const MIME_FULL = [...HFA_DOCUMENT_BUCKET_MIME_TYPES]

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    id: 'analysis-documents',
    name: 'analysis-documents',
    public: false,
    file_size_limit: HFA_DOCUMENT_BUCKET_LIMIT,
    allowed_mime_types: MIME_LEGACY,
    ...overrides,
  }
}

function syntheticStorageAdmin(config: ReturnType<typeof bucket> | null, opts: {
  error?: boolean
  throws?: boolean
  onRead?: () => void
} = {}) {
  let reads = 0
  return {
    get reads() { return reads },
    storage: {
      async getBucket(name: string) {
        reads++
        assert.equal(name, 'analysis-documents')
        opts.onRead?.()
        if (opts.throws) throw new Error('Synthetic network outage')
        if (opts.error) return { data: null, error: { message: 'DB down' } }
        return { data: config, error: null }
      },
    },
  }
}

async function preparedTxt() {
  return prepareValidatedSourceFiles([
    new File([Buffer.from('Synthetic occurrence example without personal data.')],
      'evidence.txt', { type: 'text/plain' }),
  ])
}
async function preparedPdf() {
  return prepareValidatedSourceFiles([
    new File([Buffer.from('%PDF-1.4\n%synthetic artifact\n%%EOF')],
      'evidence.pdf', { type: 'application/pdf' }),
  ])
}

test('no document skips Storage request and preserves text-only event workflow', async () => {
  const m = syntheticStorageAdmin(null, { throws: true })
  await assertStorageBucketSupportsSourceFiles(m as never, [])
  assert.equal(m.reads, 0)
})
test('legacy PDF allowed when bucket is private, pinned 10 MiB and PDF/DOCX only', async () => {
  const m = syntheticStorageAdmin(bucket())
  await assertStorageBucketSupportsSourceFiles(m as never, await preparedPdf())
  assert.equal(m.reads, 1)
})
test('TXT is rejected with 415 before any event is created while bucket only permits PDF/DOCX', async () => {
  const m = syntheticStorageAdmin(bucket())
  await assert.rejects(
    assertStorageBucketSupportsSourceFiles(m as never, await preparedTxt()),
    (e: unknown) => e instanceof UploadValidationError &&
      e.code === 'STORAGE_MIME_NOT_ENABLED' && e.status === 415 &&
      e.message.includes('Nenhum evento foi criado'),
  )
  assert.equal(m.reads, 1)
})
test('full approved MIME set accepts TXT after verified bucket update', async () => {
  const m = syntheticStorageAdmin(bucket({ allowed_mime_types: MIME_FULL }))
  await assertStorageBucketSupportsSourceFiles(m as never, await preparedTxt())
})
test('bucket read errors and thrown exceptions fail closed (503)', async () => {
  for (const options of [{ error: true }, { throws: true }]) {
    const m = syntheticStorageAdmin(bucket(), options)
    await assert.rejects(assertStorageBucketSupportsSourceFiles(m as never, await preparedTxt()),
      (e: unknown) => e instanceof UploadValidationError &&
        e.code === 'STORAGE_BUCKET_UNAVAILABLE' && e.status === 503)
  }
})
test('unexpected public bucket or unsafe size is blocked even for valid PDF', async () => {
  for (const config of [bucket({ public: true }), bucket({ file_size_limit: 5 * 1024 * 1024 })]) {
    const m = syntheticStorageAdmin(config)
    await assert.rejects(assertStorageBucketSupportsSourceFiles(m as never, await preparedPdf()),
      (e: unknown) => e instanceof UploadValidationError &&
        e.code === 'STORAGE_BUCKET_POLICY_UNVERIFIED' && e.status === 503)
  }
})
test('unrestricted or unknown MIME policy is rejected', () => {
  for (const list of [null, [], ['*/*'], ['application/pdf', 'text/html']]) {
    assert.throws(() => checkDocumentBucketPolicy(bucket({ allowed_mime_types: list }), []),
      (e: unknown) => e instanceof UploadValidationError &&
        e.code === 'STORAGE_BUCKET_POLICY_UNVERIFIED')
  }
})

const STAGE_REF = 'stagehfa2026synthetic'
const STAGE_ENV = {
  HFA_ENVIRONMENT: 'staging',
  HFA_STAGING_SUPABASE_PROJECT_REF: STAGE_REF,
  HFA_STAGING_SUPABASE_URL: 'https://' + STAGE_REF + '.supabase.co',
  HFA_STAGING_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key-for-testing-not-a-real-credential',
}

test('staging-only script refuses known production ref, mismatched domain and absent credentials', () => {
  for (const override of [
    { HFA_STAGING_SUPABASE_PROJECT_REF: 'vbdpweliprcsktyxodss',
      HFA_STAGING_SUPABASE_URL: 'https://vbdpweliprcsktyxodss.supabase.co' },
    { HFA_STAGING_SUPABASE_URL: 'https://malicious.example' },
    { HFA_STAGING_SUPABASE_SERVICE_ROLE_KEY: '' },
    { HFA_ENVIRONMENT: 'production' },
  ]) {
    assert.throws(() => validateStagingTarget({ ...STAGE_ENV, ...override }, ['--check']),
      /STAGING_STORAGE_/)
  }
})
test('check-only stage does not call updateBucket', async () => {
  let updateCalls = 0
  const create = (() => ({
    storage: {
      async getBucket() { return { data: bucket(), error: null } },
      async updateBucket() { updateCalls++; throw new Error('WRITES_DISALLOWED_IN_READONLY_TEST') },
    },
  })) as never
  const result = await runStagingStorageCheck(STAGE_ENV, ['--check'], { create })
  assert.equal(result.state, 'MIME_NOT_ENABLED')
  assert.equal(result.writesPerformed, false)
  assert.equal(updateCalls, 0)
})
test('missing separate staging write authorization blocks before any network call', async () => {
  let creates = 0
  const create = (() => { creates++; throw new Error('must not run') }) as never
  await assert.rejects(
    runStagingStorageCheck(STAGE_ENV, ['--apply', '--confirm-ref=' + STAGE_REF], { create }),
    /STAGING_STORAGE_SEPARATE_WRITE_APPROVAL_REQUIRED/)
  assert.equal(creates, 0)
})
test('explicitly authorized synthetic stage update re-reads and verifies config', async () => {
  let current = bucket()
  const updates: unknown[] = []
  const create = (() => ({
    storage: {
      async getBucket() { return { data: current, error: null } },
      async updateBucket(name: string, options: Record<string, unknown>) {
        assert.equal(name, 'analysis-documents')
        updates.push(options)
        current = bucket({
          public: options.public,
          file_size_limit: options.fileSizeLimit,
          allowed_mime_types: options.allowedMimeTypes,
        })
        return { error: null }
      },
    },
  })) as never
  const authorized = {
    ...STAGE_ENV, HFA_STORAGE_MIME_APPLY_APPROVED: 'I_AUTHORIZE_STAGING_STORAGE_UPDATE',
  }
  const result = await runStagingStorageCheck(authorized,
    ['--apply', '--confirm-ref=' + STAGE_REF], { create })
  assert.equal(result.state, 'UPDATED_AND_VERIFIED')
  assert.equal(result.writesPerformed, true)
  assert.equal(updates.length, 1)
  assert.deepEqual(current.allowed_mime_types, MIME_FULL)
  assert.equal(current.public, false)
  assert.equal(current.file_size_limit, HFA_DOCUMENT_BUCKET_LIMIT)
  assert.ok(!JSON.stringify(result).includes(STAGE_ENV.HFA_STAGING_SUPABASE_SERVICE_ROLE_KEY))
})
test('drifting MIME policy cannot be overwritten by staging updater', async () => {
  let updateCalls = 0
  const create = (() => ({
    storage: {
      async getBucket() { return { data: bucket({ allowed_mime_types: ['text/plain'] }), error: null } },
      async updateBucket() { updateCalls++; return { error: null } },
    },
  })) as never
  await assert.rejects(runStagingStorageCheck(STAGE_ENV, ['--check'], { create }),
    /STAGING_STORAGE_MIME_POLICY_DRIFT/)
  assert.equal(updateCalls, 0)
})
