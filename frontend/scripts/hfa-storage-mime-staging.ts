/**
 * Read-only by default. Staging Storage update requires a separate, explicit
 * approval and exact project confirmation. Never use production credentials.
 */
import { createClient } from '@supabase/supabase-js'
import {
  checkDocumentBucketPolicy,
  HFA_DOCUMENT_BUCKET_ID,
  HFA_DOCUMENT_BUCKET_LIMIT,
  HFA_DOCUMENT_BUCKET_INITIAL_MIME_TYPES,
  HFA_DOCUMENT_BUCKET_MIME_TYPES,
} from '../src/lib/event-document-persistence'

const PRODUCTION_REF = 'vbdpweliprcsktyxodss'

export function sameMimeSet(current: readonly string[] | null | undefined,
  expected: readonly string[]): boolean {
  return Array.isArray(current) && current.length === expected.length &&
    expected.every(x => current.includes(x)) && new Set(current).size === current.length
}

export function validateStagingTarget(env: NodeJS.ProcessEnv, args: string[]) {
  const mode = args[0]
  if (!['--check', '--apply'].includes(mode ?? '') ||
      (mode === '--check' && args.length !== 1) ||
      (mode === '--apply' && args.length !== 2)) {
    throw new Error('STAGING_STORAGE_USAGE_INVALID')
  }
  if (env.HFA_ENVIRONMENT !== 'staging') throw new Error('STAGING_STORAGE_ENVIRONMENT_REQUIRED')
  const ref = (env.HFA_STAGING_SUPABASE_PROJECT_REF ?? '').trim()
  const url = (env.HFA_STAGING_SUPABASE_URL ?? '').trim()
  const serviceKey = (env.HFA_STAGING_SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!/^[a-z0-9]{10,25}$/.test(ref) || ref === PRODUCTION_REF ||
      url !== 'https://' + ref + '.supabase.co' || serviceKey.length < 32) {
    throw new Error('STAGING_STORAGE_PROJECT_VERIFICATION_FAILED')
  }
  if (mode === '--apply' && (
    env.HFA_STORAGE_MIME_APPLY_APPROVED !== 'I_AUTHORIZE_STAGING_STORAGE_UPDATE' ||
    args[1] !== '--confirm-ref=' + ref
  )) throw new Error('STAGING_STORAGE_SEPARATE_WRITE_APPROVAL_REQUIRED')
  return { mode, ref, url, serviceKey }
}

export async function runStagingStorageCheck(
  env: NodeJS.ProcessEnv,
  args: string[],
  deps: { create: typeof createClient } = { create: createClient },
) {
  const target = validateStagingTarget(env, args)
  const admin = deps.create(target.url, target.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  async function readBucket() {
    const response = await admin.storage.getBucket(HFA_DOCUMENT_BUCKET_ID)
    if (response.error || !response.data) throw new Error('STAGING_STORAGE_BUCKET_NOT_VERIFIED')
    checkDocumentBucketPolicy(response.data, [])
    return response.data
  }
  const existing = await readBucket()
  const initial = sameMimeSet(existing.allowed_mime_types, HFA_DOCUMENT_BUCKET_INITIAL_MIME_TYPES)
  const ready = sameMimeSet(existing.allowed_mime_types, HFA_DOCUMENT_BUCKET_MIME_TYPES)
  if (!initial && !ready) throw new Error('STAGING_STORAGE_MIME_POLICY_DRIFT')
  if (target.mode === '--apply' && !ready) {
    const result = await admin.storage.updateBucket(HFA_DOCUMENT_BUCKET_ID, {
      public: false,
      fileSizeLimit: HFA_DOCUMENT_BUCKET_LIMIT,
      allowedMimeTypes: [...HFA_DOCUMENT_BUCKET_MIME_TYPES],
    })
    if (result.error) throw new Error('STAGING_STORAGE_BUCKET_API_UPDATE_FAILED')
    const verify = await readBucket()
    if (!sameMimeSet(verify.allowed_mime_types, HFA_DOCUMENT_BUCKET_MIME_TYPES)) {
      throw new Error('STAGING_STORAGE_BUCKET_UPDATE_NOT_VERIFIED')
    }
    return { projectRef: target.ref, state: 'UPDATED_AND_VERIFIED', writesPerformed: true }
  }
  return {
    projectRef: target.ref,
    state: ready ? 'READY' : 'MIME_NOT_ENABLED',
    bucketPrivate: true,
    maxFileBytes: HFA_DOCUMENT_BUCKET_LIMIT,
    missingMimeTypes: HFA_DOCUMENT_BUCKET_MIME_TYPES.filter(
      mime => !existing.allowed_mime_types?.includes(mime)),
    writesPerformed: false,
  }
}

if (process.argv[1]?.endsWith('hfa-storage-mime-staging.ts')) {
  runStagingStorageCheck(process.env, process.argv.slice(2)).then(result => {
    // This output never includes service-role key, user data or secret values.
    console.log(JSON.stringify(result, null, 2))
    if (result.state === 'MIME_NOT_ENABLED') process.exitCode = 2
  }).catch(error => {
    const code = error instanceof Error ? error.message : ''
    console.error(/^STAGING_STORAGE_[A-Z_]+$/.test(code) ? code : 'STAGING_STORAGE_NOT_VERIFIED')
    process.exitCode = 3
  })
}
