/**
 * REAL STAGING TRIAL — Auth A/B RLS + metadata tampering + inactive gates
 *
 * Requires env (never committed):
 *   SUPABASE_STAGING_URL
 *   SUPABASE_STAGING_ANON_KEY
 *   SUPABASE_STAGING_SERVICE_ROLE_KEY
 *   HFA_STAGING_SUPABASE_PROJECT_REF=vbdpweliprcsktyxodss
 *   HFA_TEST_ENVIRONMENT=staging
 *
 * Creates synthetic Auth users via Admin API (not SQL inserts into auth.users).
 * Uses authenticated anon sessions for RLS proofs (service_role never proves RLS).
 *
 * Run:
 *   set -a; source /tmp/hfa-staging-secrets/keys.env; set +a
 *   NODE_PATH=frontend/node_modules npx tsx tests/sera-vnext/staging-rls-auth-ab-real-trial-001.ts
 */

import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { assertSafeTestEnvironment } from './helpers/assert-safe-test-environment'

const require = createRequire(import.meta.url)
const { createClient } = require(
  path.join(__dirname, '../../frontend/node_modules/@supabase/supabase-js')
)

type Result = { name: string; pass: boolean; detail: string }
const results: Result[] = []

function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}: ${detail}`)
}

function must(cond: boolean, name: string, detail: string) {
  record(name, cond, detail)
  if (!cond) throw new Error(`ASSERT_FAIL: ${name} — ${detail}`)
}

function randomSuffix(): string {
  return randomBytes(4).toString('hex')
}

function strongPassword(): string {
  return `Hfa!${randomBytes(18).toString('base64url')}`
}

async function main() {
  const fixtureEnv = assertSafeTestEnvironment({
    requiresFixtureIds: false,
  })

  const url = process.env.SUPABASE_STAGING_URL!.trim()
  const anonKey =
    process.env.SUPABASE_STAGING_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const serviceKey =
    process.env.SUPABASE_STAGING_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!anonKey || !serviceKey) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: missing anon/service role keys (SUPABASE_STAGING_* or NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY)'
    )
  }
  if (fixtureEnv.projectRef !== 'vbdpweliprcsktyxodss') {
    throw new Error(`WRONG_PROJECT: expected vbdpweliprcsktyxodss, got ${fixtureEnv.projectRef}`)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Reuse path 1: CI/staging env vars (fixture IDs + passwords as secrets)
  // Reuse path 2: local /tmp credential files with HFA_REUSE_FIXTURES=1
  const reuseIdsPath = '/tmp/hfa-staging-secrets/fixture-ids.env'
  const envReuse =
    Boolean(process.env.HFA_TEST_TENANT_A_ID?.trim()) &&
    Boolean(process.env.HFA_TEST_TENANT_B_ID?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_A_ID?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_B_ID?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_A_PASSWORD?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_B_PASSWORD?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_A_EMAIL?.trim()) &&
    Boolean(process.env.HFA_TEST_USER_B_EMAIL?.trim())
  const fileReuseRequested = process.env.HFA_REUSE_FIXTURES === '1' && existsSync(reuseIdsPath)
  const reuseRequested = envReuse || fileReuseRequested

  let suffix = randomSuffix()
  let emailA = `hfa-staging-a-${suffix}@example.com`
  let emailB = `hfa-staging-b-${suffix}@example.com`
  let passA = strongPassword()
  let passB = strongPassword()
  let reused = false
  let authAId = ''
  let authBId = ''
  let tenantA: { id: string } | null = null
  let tenantB: { id: string } | null = null
  let reusePath = ''

  function parseEnvFile(filePath: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of require('node:fs').readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i <= 0) continue
      out[line.slice(0, i)] = line.slice(i + 1)
    }
    return out
  }

  // Persist fixture credentials ONLY outside the repo
  const secretDir = '/tmp/hfa-staging-secrets'
  mkdirSync(secretDir, { recursive: true, mode: 0o700 })
  const credPath = path.join(secretDir, `fixture-ab-${suffix}.env`)
  writeFileSync(
    credPath,
    [
      `# Synthetic fixture credentials — DO NOT COMMIT`,
      `HFA_FIXTURE_EMAIL_A=${emailA}`,
      `HFA_FIXTURE_EMAIL_B=${emailB}`,
      `HFA_FIXTURE_PASSWORD_A=${passA}`,
      `HFA_FIXTURE_PASSWORD_B=${passB}`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  )

  console.log(`Provisioning synthetic Auth A/B (emails not logged). credentials_file=${credPath}`)

  if (reuseRequested) {
    if (envReuse) {
      emailA = process.env.HFA_TEST_USER_A_EMAIL!.trim()
      emailB = process.env.HFA_TEST_USER_B_EMAIL!.trim()
      passA = process.env.HFA_TEST_USER_A_PASSWORD!.trim()
      passB = process.env.HFA_TEST_USER_B_PASSWORD!.trim()
      authAId = process.env.HFA_TEST_USER_A_ID!.trim()
      authBId = process.env.HFA_TEST_USER_B_ID!.trim()
      tenantA = { id: process.env.HFA_TEST_TENANT_A_ID!.trim() }
      tenantB = { id: process.env.HFA_TEST_TENANT_B_ID!.trim() }
      reused = true
      console.log('Reusing synthetic fixtures from environment variables (ids not printed)')
    } else {
      const ids = parseEnvFile(reuseIdsPath)
      const credFiles = require('node:fs')
        .readdirSync('/tmp/hfa-staging-secrets')
        .filter((f: string) => f.startsWith('fixture-ab-') && f.endsWith('.env'))
        .map((f: string) => `/tmp/hfa-staging-secrets/${f}`)
      for (const file of credFiles) {
        const creds = parseEnvFile(file)
        if (
          creds.HFA_TEST_USER_A_ID === ids.HFA_TEST_USER_A_ID &&
          creds.HFA_TEST_USER_B_ID === ids.HFA_TEST_USER_B_ID &&
          creds.HFA_FIXTURE_EMAIL_A &&
          creds.HFA_FIXTURE_PASSWORD_A
        ) {
          reusePath = file
          emailA = creds.HFA_FIXTURE_EMAIL_A
          emailB = creds.HFA_FIXTURE_EMAIL_B
          passA = creds.HFA_FIXTURE_PASSWORD_A
          passB = creds.HFA_FIXTURE_PASSWORD_B
          authAId = ids.HFA_TEST_USER_A_ID
          authBId = ids.HFA_TEST_USER_B_ID
          tenantA = { id: ids.HFA_TEST_TENANT_A_ID }
          tenantB = { id: ids.HFA_TEST_TENANT_B_ID }
          reused = true
          break
        }
      }
      if (!reused) {
        throw new Error('HFA_REUSE_FIXTURES=1 but matching credential file not found in /tmp/hfa-staging-secrets')
      }
      console.log('Reusing existing synthetic fixtures from /tmp (ids not printed)')
    }
  }

  // ── Create Auth users via Admin API ──────────────────────────────────────
  if (!reused) {
  const createA = await admin.auth.admin.createUser({
    email: emailA,
    password: passA,
    email_confirm: true,
    // Intentionally empty app/user metadata for authorization fields
    user_metadata: {},
    app_metadata: {},
  })
  if (createA.error || !createA.data.user) {
    throw new Error(`AUTH_CREATE_A_FAILED: ${createA.error?.message ?? 'no user'}`)
  }
  authAId = createA.data.user.id

  const createB = await admin.auth.admin.createUser({
    email: emailB,
    password: passB,
    email_confirm: true,
    user_metadata: {},
    app_metadata: {},
  })
  if (createB.error || !createB.data.user) {
    throw new Error(`AUTH_CREATE_B_FAILED: ${createB.error?.message ?? 'no user'}`)
  }
  authBId = createB.data.user.id

  // ── Tenants A/B ──────────────────────────────────────────────────────────
  const slugA = `hfa-stg-a-${suffix}`
  const slugB = `hfa-stg-b-${suffix}`
  const tenantARes = await admin
    .from('tenants')
    .insert({
      name: '[HFA_STAGING_FIXTURE] Tenant A',
      slug: slugA,
      plan: 'trial',
      credits_balance: 10,
      is_active: true,
    })
    .select('id')
    .single()
  if (tenantARes.error || !tenantARes.data) throw new Error(`TENANT_A_CREATE_FAILED: ${tenantARes.error?.message}`)
  tenantA = tenantARes.data

  const tenantBRes = await admin
    .from('tenants')
    .insert({
      name: '[HFA_STAGING_FIXTURE] Tenant B',
      slug: slugB,
      plan: 'trial',
      credits_balance: 10,
      is_active: true,
    })
    .select('id')
    .single()
  if (tenantBRes.error || !tenantBRes.data) throw new Error(`TENANT_B_CREATE_FAILED: ${tenantBRes.error?.message}`)
  tenantB = tenantBRes.data

  // ── public.users with DIRECT_AUTH_ID (id = auth id = auth_user_id) ───────
  const { error: uAErr } = await admin.from('users').insert({
    id: authAId,
    tenant_id: tenantA.id,
    email: emailA,
    full_name: '[HFA_STAGING_FIXTURE] User A',
    role: 'analyst',
    is_active: true,
    auth_user_id: authAId,
  })
  if (uAErr) throw new Error(`USER_A_CREATE_FAILED: ${uAErr.message}`)

  const { error: uBErr } = await admin.from('users').insert({
    id: authBId,
    tenant_id: tenantB.id,
    email: emailB,
    full_name: '[HFA_STAGING_FIXTURE] User B',
    role: 'analyst',
    is_active: true,
    auth_user_id: authBId,
  })
  if (uBErr) throw new Error(`USER_B_CREATE_FAILED: ${uBErr.message}`)
  } else {
    // Ensure reused fixtures are active before tests
    await admin.from('tenants').update({ is_active: true }).in('id', [tenantA!.id, tenantB!.id])
    await admin.from('users').update({ is_active: true }).in('id', [authAId, authBId])
  }

  appendFileSync(
    credPath,
    [
      `HFA_TEST_TENANT_A_ID=${tenantA.id}`,
      `HFA_TEST_USER_A_ID=${authAId}`,
      `HFA_TEST_TENANT_B_ID=${tenantB.id}`,
      `HFA_TEST_USER_B_ID=${authBId}`,
      '',
    ].join('\n')
  )
  // Also write a vars-only file safe to source for workflow config (no passwords)
  writeFileSync(
    path.join(secretDir, 'fixture-ids.env'),
    [
      `HFA_TEST_TENANT_A_ID=${tenantA.id}`,
      `HFA_TEST_USER_A_ID=${authAId}`,
      `HFA_TEST_TENANT_B_ID=${tenantB.id}`,
      `HFA_TEST_USER_B_ID=${authBId}`,
      `HFA_STAGING_SUPABASE_PROJECT_REF=vbdpweliprcsktyxodss`,
      `HFA_TEST_ENVIRONMENT=staging`,
      '',
    ].join('\n'),
    { mode: 0o600 }
  )

  must(tenantA.id !== tenantB.id, 'fixture_tenants_distinct', 'Tenant A != Tenant B')
  must(authAId !== authBId, 'fixture_users_distinct', 'User A != User B')

  // ── Authenticated clients (anon key + password session) ──────────────────
  async function sessionClient(email: string, password: string) {
    const client = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      throw new Error(`SIGN_IN_FAILED: ${error?.message ?? 'no session'}`)
    }
    return client
  }

  let clientA = await sessionClient(emailA, passA)
  let clientB = await sessionClient(emailB, passB)

  // Resolver smoke via SQL RPCs exposed as functions
  const { data: tenantFromA, error: tenantFromAErr } = await clientA.rpc('get_tenant_id')
  record(
    'resolver_a_tenant',
    !tenantFromAErr && tenantFromA === tenantA.id,
    tenantFromAErr ? tenantFromAErr.message : `tenant=${tenantFromA === tenantA.id ? 'A' : 'MISMATCH'}`
  )

  const { data: tenantFromB, error: tenantFromBErr } = await clientB.rpc('get_tenant_id')
  record(
    'resolver_b_tenant',
    !tenantFromBErr && tenantFromB === tenantB.id,
    tenantFromBErr ? tenantFromBErr.message : `tenant=${tenantFromB === tenantB.id ? 'B' : 'MISMATCH'}`
  )

  // ── Seed synthetic events via authenticated inserts ──────────────────────
  const marker = `[HFA_STAGING_TEST] rls-ab-${suffix}`
  const { data: eventA, error: eAIns } = await clientA
    .from('events')
    .insert({
      tenant_id: tenantA.id,
      submitted_by: authAId,
      title: marker,
      raw_input: `${marker} narrative for tenant A with enough length for constraints.`,
      input_type: 'text',
      status: 'received',
    })
    .select('id')
    .single()
  must(!eAIns && !!eventA, 'a_writes_a_event', eAIns?.message ?? 'inserted')

  const { data: eventB, error: eBIns } = await clientB
    .from('events')
    .insert({
      tenant_id: tenantB.id,
      submitted_by: authBId,
      title: marker,
      raw_input: `${marker} narrative for tenant B with enough length for constraints.`,
      input_type: 'text',
      status: 'received',
    })
    .select('id')
    .single()
  must(!eBIns && !!eventB, 'b_writes_b_event', eBIns?.message ?? 'inserted')

  // Cross-tenant write attempts
  const { error: aWriteB } = await clientA.from('events').insert({
    tenant_id: tenantB.id,
    submitted_by: authAId,
    title: marker,
    raw_input: `${marker} A attempting write into B`,
    input_type: 'text',
    status: 'received',
  })
  record('a_writes_b_event', !!aWriteB, aWriteB ? 'BLOCKED' : 'NOT BLOCKED')

  const { error: bWriteA } = await clientB.from('events').insert({
    tenant_id: tenantA.id,
    submitted_by: authBId,
    title: marker,
    raw_input: `${marker} B attempting write into A`,
    input_type: 'text',
    status: 'received',
  })
  record('b_writes_a_event', !!bWriteA, bWriteA ? 'BLOCKED' : 'NOT BLOCKED')

  // Reads
  const { data: aReadsA, error: aReadsAErr } = await clientA
    .from('events')
    .select('id')
    .eq('id', eventA!.id)
  record('a_reads_a_event', !aReadsAErr && (aReadsA?.length ?? 0) === 1, aReadsAErr?.message ?? `rows=${aReadsA?.length ?? 0}`)

  const { data: aReadsB, error: aReadsBErr } = await clientA
    .from('events')
    .select('id')
    .eq('id', eventB!.id)
  record(
    'a_reads_b_event',
    !aReadsBErr && (aReadsB?.length ?? 0) === 0,
    aReadsBErr ? aReadsBErr.message : `rows=${aReadsB?.length ?? 0}`
  )

  const { data: bReadsB, error: bReadsBErr } = await clientB
    .from('events')
    .select('id')
    .eq('id', eventB!.id)
  record('b_reads_b_event', !bReadsBErr && (bReadsB?.length ?? 0) === 1, bReadsBErr?.message ?? `rows=${bReadsB?.length ?? 0}`)

  const { data: bReadsA, error: bReadsAErr } = await clientB
    .from('events')
    .select('id')
    .eq('id', eventA!.id)
  record(
    'b_reads_a_event',
    !bReadsAErr && (bReadsA?.length ?? 0) === 0,
    bReadsAErr ? bReadsAErr.message : `rows=${bReadsA?.length ?? 0}`
  )

  // Tenants / users visibility
  const { data: aTenants } = await clientA.from('tenants').select('id')
  record('a_sees_only_own_tenant', (aTenants?.length ?? 0) === 1 && aTenants?.[0]?.id === tenantA.id, `count=${aTenants?.length ?? 0}`)
  const { data: bTenants } = await clientB.from('tenants').select('id')
  record('b_sees_only_own_tenant', (bTenants?.length ?? 0) === 1 && bTenants?.[0]?.id === tenantB.id, `count=${bTenants?.length ?? 0}`)

  // analysis_edits — seed analyses via service role (schema requires analysis FK), prove RLS with auth sessions
  const { data: analysisA, error: anAErr } = await admin
    .from('analyses')
    .insert({
      event_id: eventA!.id,
      tenant_id: tenantA.id,
      event_summary: marker,
      escape_point: marker,
      unsafe_agent: 'synthetic',
      unsafe_act: 'synthetic',
    })
    .select('id')
    .single()
  if (anAErr || !analysisA) throw new Error(`ANALYSIS_A_CREATE_FAILED: ${anAErr?.message}`)

  const { data: analysisB, error: anBErr } = await admin
    .from('analyses')
    .insert({
      event_id: eventB!.id,
      tenant_id: tenantB.id,
      event_summary: marker,
      escape_point: marker,
      unsafe_agent: 'synthetic',
      unsafe_act: 'synthetic',
    })
    .select('id')
    .single()
  if (anBErr || !analysisB) throw new Error(`ANALYSIS_B_CREATE_FAILED: ${anBErr?.message}`)

  const { data: editA, error: editAIns } = await clientA
    .from('analysis_edits')
    .insert({
      analysis_id: analysisA.id,
      tenant_id: tenantA.id,
      step_altered: 'perception',
      field_changed: 'code',
      value_before: { v: 'before' },
      value_after: { v: 'after' },
      reason: marker,
    })
    .select('id')
    .single()
  record('a_writes_a_analysis_edit', !editAIns && !!editA, editAIns?.message ?? 'inserted')

  const { error: editACross } = await clientA.from('analysis_edits').insert({
    analysis_id: analysisB.id,
    tenant_id: tenantB.id,
    step_altered: 'perception',
    field_changed: 'code',
    value_before: { v: 'before' },
    value_after: { v: 'after' },
    reason: marker,
  })
  record('a_writes_b_analysis_edit', !!editACross, editACross ? 'BLOCKED' : 'NOT BLOCKED')

  const { data: aSeesOwnEdit } = await clientA.from('analysis_edits').select('id').eq('id', editA?.id ?? '00000000-0000-0000-0000-000000000000')
  record('a_reads_a_analysis_edit', (aSeesOwnEdit?.length ?? 0) === 1, `rows=${aSeesOwnEdit?.length ?? 0}`)

  const { data: bSeesAEdit } = await clientB.from('analysis_edits').select('id').eq('id', editA?.id ?? '00000000-0000-0000-0000-000000000000')
  record('b_reads_a_analysis_edit', (bSeesAEdit?.length ?? 0) === 0, `rows=${bSeesAEdit?.length ?? 0}`)

  // ── Metadata tampering (synthetic user only) ─────────────────────────────
  const { error: metaErr } = await admin.auth.admin.updateUserById(authAId, {
    user_metadata: {
      tenant_id: tenantB.id,
      role: 'admin',
    },
  })
  if (metaErr) throw new Error(`METADATA_TAMPER_FAILED: ${metaErr.message}`)

  // Force fresh session
  await clientA.auth.signOut()
  clientA = await sessionClient(emailA, passA)
  const { data: tenantAfterMeta } = await clientA.rpc('get_tenant_id')
  record(
    'metadata_tenant_tampering',
    tenantAfterMeta === tenantA.id,
    `resolver_still_A=${tenantAfterMeta === tenantA.id}`
  )

  const { data: roleRow } = await clientA.from('users').select('role').eq('id', authAId).maybeSingle()
  record(
    'metadata_role_escalation',
    roleRow?.role === 'analyst',
    `db_role=${roleRow?.role ?? 'null'}`
  )

  const { data: aSeesBAfterMeta } = await clientA.from('events').select('id').eq('id', eventB!.id)
  record('metadata_tamper_still_blocks_b', (aSeesBAfterMeta?.length ?? 0) === 0, `rows=${aSeesBAfterMeta?.length ?? 0}`)

  // Clear adversarial metadata
  await admin.auth.admin.updateUserById(authAId, { user_metadata: {} })

  // ── User inactive ────────────────────────────────────────────────────────
  await admin.from('users').update({ is_active: false }).eq('id', authAId)
  await clientA.auth.signOut()
  clientA = await sessionClient(emailA, passA)
  const { data: tenantInactiveUser } = await clientA.rpc('get_tenant_id')
  record('user_inactive_resolver_null', tenantInactiveUser == null, `tenant=${tenantInactiveUser}`)
  const { data: eventsInactiveUser } = await clientA.from('events').select('id')
  record('user_inactive_events_empty', (eventsInactiveUser?.length ?? 0) === 0, `rows=${eventsInactiveUser?.length ?? 0}`)
  const { error: writeInactiveUser } = await clientA.from('events').insert({
    tenant_id: tenantA.id,
    submitted_by: authAId,
    title: marker,
    raw_input: `${marker} inactive user write attempt`,
    input_type: 'text',
    status: 'received',
  })
  record('user_inactive_write_blocked', !!writeInactiveUser, writeInactiveUser ? 'BLOCKED' : 'NOT BLOCKED')
  await admin.from('users').update({ is_active: true }).eq('id', authAId)

  // ── Tenant inactive ──────────────────────────────────────────────────────
  await admin.from('tenants').update({ is_active: false }).eq('id', tenantA.id)
  await clientA.auth.signOut()
  clientA = await sessionClient(emailA, passA)
  const { data: tenantInactiveTenant } = await clientA.rpc('get_tenant_id')
  record('tenant_inactive_resolver_null', tenantInactiveTenant == null, `tenant=${tenantInactiveTenant}`)
  const { data: eventsInactiveTenant } = await clientA.from('events').select('id')
  record('tenant_inactive_events_empty', (eventsInactiveTenant?.length ?? 0) === 0, `rows=${eventsInactiveTenant?.length ?? 0}`)
  await admin.from('tenants').update({ is_active: true }).eq('id', tenantA.id)

  // Restore sessions after reactivation
  await clientA.auth.signOut()
  clientA = await sessionClient(emailA, passA)
  const { data: restoredTenant } = await clientA.rpc('get_tenant_id')
  record('fixture_restored_active', restoredTenant === tenantA.id, 'tenant A active again')

  // ── Unknown SUB fail-closed (service-role SQL with forged JWT claim setting is not available;
  //     approximate via user with no public.users binding)
  const orphanEmail = `hfa-staging-orphan-${suffix}@example.com`
  const orphanPass = strongPassword()
  const orphan = await admin.auth.admin.createUser({
    email: orphanEmail,
    password: orphanPass,
    email_confirm: true,
  })
  if (orphan.error || !orphan.data.user) throw new Error(`ORPHAN_CREATE_FAILED: ${orphan.error?.message}`)
  const orphanClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const orphanSign = await orphanClient.auth.signInWithPassword({ email: orphanEmail, password: orphanPass })
  if (orphanSign.error) throw new Error(`ORPHAN_SIGNIN_FAILED: ${orphanSign.error.message}`)
  const { data: orphanTenant } = await orphanClient.rpc('get_tenant_id')
  const { data: orphanEvents } = await orphanClient.from('events').select('id')
  const { data: orphanUsers } = await orphanClient.from('users').select('id')
  const { data: orphanTenants } = await orphanClient.from('tenants').select('id')
  record(
    'unknown_sub_fail_closed',
    orphanTenant == null &&
      (orphanEvents?.length ?? 0) === 0 &&
      (orphanUsers?.length ?? 0) === 0 &&
      (orphanTenants?.length ?? 0) === 0,
    `tenant_null=${orphanTenant == null} events=${orphanEvents?.length ?? 0}`
  )

  // Cleanup ephemeral orphan auth user + synthetic events/edits/analyses
  await admin.auth.admin.deleteUser(orphan.data.user.id)
  await admin.from('analysis_edits').delete().eq('reason', marker)
  await admin.from('analyses').delete().in('id', [analysisA.id, analysisB.id])
  await admin.from('events').delete().eq('title', marker)

  // Confirm fixtures remain active
  const { data: finalTenantA } = await admin.from('tenants').select('is_active').eq('id', tenantA.id).single()
  const { data: finalTenantB } = await admin.from('tenants').select('is_active').eq('id', tenantB.id).single()
  const { data: finalUserA } = await admin.from('users').select('is_active,auth_user_id').eq('id', authAId).single()
  const { data: finalUserB } = await admin.from('users').select('is_active,auth_user_id').eq('id', authBId).single()
  record('fixtures_remain_active', !!finalTenantA?.is_active && !!finalTenantB?.is_active && !!finalUserA?.is_active && !!finalUserB?.is_active, 'A/B active')
  record(
    'fixtures_direct_auth_id',
    finalUserA?.auth_user_id === authAId && finalUserB?.auth_user_id === authBId,
    'auth_user_id bound'
  )

  const failed = results.filter((r) => !r.pass)
  console.log('\n--- SUMMARY ---')
  console.log(
    JSON.stringify(
      {
        project_ref: fixtureEnv.projectRef,
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        failed_names: failed.map((f) => f.name),
        fixture_ids_file: path.join(secretDir, 'fixture-ids.env'),
        // Do not print emails/passwords/UUIDs in CI-style summary beyond confirming files exist
        fixture_ids_present: existsSync(path.join(secretDir, 'fixture-ids.env')),
        marker_hash: createHash('sha256').update(marker).digest('hex').slice(0, 12),
      },
      null,
      2
    )
  )

  if (failed.length > 0) {
    console.error('staging-rls-auth-ab-real-trial: FAIL')
    process.exit(1)
  }
  console.log('staging-rls-auth-ab-real-trial: PASS')
  console.log('HFA_RLS_REAL_VALIDATED')
  console.log('HFA_CROSS_TENANT_REAL_VALIDATED')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
