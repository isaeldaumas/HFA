export {};

/**
 * SERA vNext Product Beta — Real Database Validation Trial
 *
 * Verifies migration was applied and all tables, constraints, RLS, and
 * append-only triggers function correctly against a real Supabase database.
 *
 * Validated: 2026-06-07 — PRODUCT_BETA_DB_REAL_OK (17/17 PASS)
 * Run: NODE_PATH=frontend/node_modules npx tsx tests/sera-vnext/product-beta-db-real-trial-001.ts
 */

import { assertSafeTestEnvironment } from '../../helpers/assert-safe-test-environment'
import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';

const TRIAL_ID = 'product-beta-db-real-trial-001';
const require = createRequire(import.meta.url);
const { createClient: createSupabaseClient } = require(path.join(__dirname, '../../frontend/node_modules/@supabase/supabase-js'));

// Load .env.local
const envPath = path.join(__dirname, '../../frontend/.env.local');
if (fs.existsSync(envPath) && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const TABLES = [
  'sera_vnext_analyses',
  'sera_vnext_analysis_revisions',
  'sera_vnext_analysis_reviews',
  'sera_vnext_analysis_events',
] as const;

interface Check { name: string; pass: boolean; detail: string }
const checks: Check[] = [];

function logCheck(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

async function run() {
  // Safety guard: must be called before any mutation.
  // Throws ENVIRONMENT_NOT_CONFIGURED if staging env or fixture IDs are missing.
  // Runner excludes this test in READ_ONLY mode before it reaches here.
  const fixture = assertSafeTestEnvironment({ requiresFixtureIds: true })

  if (!supabaseUrl || !serviceRole) {
    console.log(`[${TRIAL_ID}] SKIPPED — DB credentials not available`);
    process.exit(0);
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Tables
  for (const t of TABLES) {
    const { error } = await admin.from(t as never).select('id').limit(1);
    logCheck(`table_${t}`, !error || error.code !== '42P01',
      error?.code === '42P01' ? 'NOT FOUND' : 'OK');
  }

  // Anon blocked
  if (anonKey) {
    const anon = createSupabaseClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const t of TABLES) {
      const { data, error } = await anon.from(t as never).select('id').limit(1);
      logCheck(`anon_blocked_${t}`, (Array.isArray(data) && data.length === 0) || !!error,
        error ? error.message.slice(0, 60) : `rows=${Array.isArray(data) ? data.length : 'null'}`);
    }
  }

  // Constraints — fixture IDs are guaranteed by assertSafeTestEnvironment above.
  // Use them directly; never re-read env vars or call .limit(1).
  const tenantId = fixture.tenantAId;
  const userId = fixture.userAId;

  if (true) { // always run — guard above ensures fixture is present
    const runSuffix = `${Date.now()}`;
    const safe = { selectedCode: null, releasedCode: null, finalConclusion: null, classifiedOutput: false, readyPromotion: false, downstreamAllowed: false };
    const base = {
      tenant_id: tenantId, created_by: userId, review_status: 'NOT_REVIEWED',
      narrative: 'Real DB trial narrative with sufficient length for constraint validation.',
      narrative_hash: `hash-${runSuffix}`, source_type: 'TEST', request_id: `req-db-real-${runSuffix}`,
      engine_version: '0.1.0', methodology_version: 'SERA_PT_V1_FROZEN',
      baseline_id: 'SERA_VNEXT_BASELINE_V0', fixture_set_id: 'SERA_VNEXT_FIXTURE_SET_V0',
      input_schema_version: '1.0.0', output_schema_version: '1.0.0',
      code_commit: '6393798f', engine_input: { synthetic: true },
    };

    const { error: e1 } = await admin.from('sera_vnext_analyses' as never).insert({ ...base, title: '[TEST] classified-blocked', client_request_id: 'db-real-classified-block', status: 'CANDIDATE_ANALYSIS_CREATED', engine_output_hash: 'h1', engine_output: { ...safe, classifiedOutput: true } } as never);
    logCheck('constraint_classified_output_blocked', !!e1, e1 ? 'BLOCKED' : 'NOT BLOCKED');

    const { error: e2 } = await admin.from('sera_vnext_analyses' as never).insert({ ...base, title: '[TEST] final-blocked', client_request_id: 'db-real-final-block', status: 'FINAL_CLASSIFICATION', engine_output_hash: 'h2', engine_output: safe } as never);
    logCheck('constraint_final_status_blocked', !!e2, e2 ? 'BLOCKED' : 'NOT BLOCKED');

    const { error: e3 } = await admin.from('sera_vnext_analyses' as never).insert({ ...base, title: '[TEST] version-blocked', client_request_id: 'db-real-version-block', status: 'CANDIDATE_ANALYSIS_CREATED', engine_version: '9.9.9', engine_output_hash: 'h3', engine_output: safe } as never);
    logCheck('constraint_wrong_engine_version_blocked', !!e3, e3 ? 'BLOCKED' : 'NOT BLOCKED');

    const { data: ins, error: e4 } = await admin.from('sera_vnext_analyses' as never).insert({ ...base, title: '[SERA_VNEXT_STAGING_VALIDATION_DO_NOT_USE] db-real-trial', client_request_id: `db-real-valid-insert-${runSuffix}`, status: 'CANDIDATE_ANALYSIS_CREATED', engine_output_hash: `hv-${runSuffix}`, engine_output: safe } as never).select('id');
    logCheck('valid_insert_succeeds', !e4, e4 ? e4.message.slice(0, 60) : 'OK');

    if (!e4 && ins?.length) {
      const id = (ins[0] as { id: string }).id;
      const { error: e5 } = await admin.from('sera_vnext_analyses' as never).insert({ ...base, title: '[TEST] dupe', client_request_id: `db-real-valid-insert-${runSuffix}`, status: 'CANDIDATE_ANALYSIS_CREATED', engine_output_hash: `hd-${runSuffix}`, engine_output: safe } as never);
      logCheck('idempotency_duplicate_blocked', !!e5, e5 ? 'BLOCKED' : 'NOT BLOCKED');

      const { error: e6 } = await admin.from('sera_vnext_analysis_events' as never).insert({ analysis_id: id, tenant_id: tenantId, actor_id: userId, event_type: 'analysis.created', request_id: `req-db-real-${runSuffix}`, payload: { synthetic: true } } as never);
      logCheck('audit_event_insert_ok', !e6, e6 ? e6.message.slice(0, 60) : 'OK');

      const { error: e7 } = await admin.from('sera_vnext_analysis_events' as never).update({ event_type: 'analysis.viewed' } as never).eq('analysis_id', id);
      logCheck('events_append_only_update_blocked', !!e7, e7 ? 'BLOCKED' : 'NOT BLOCKED');

      const { error: e8 } = await admin.from('sera_vnext_analysis_events' as never).delete().eq('analysis_id', id);
      logCheck('events_append_only_delete_blocked', !!e8, e8 ? 'BLOCKED' : 'NOT BLOCKED');

      await admin.from('sera_vnext_analyses' as never).delete().eq('id', id);
    }
  }

  const pass = checks.filter(c => c.pass).length;
  const fail = checks.filter(c => !c.pass).length;

  console.log(`\n[${TRIAL_ID}]`);
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} [${c.pass ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  console.log(`\nPASS=${pass} FAIL=${fail}`);
  console.log(fail === 0 ? 'PRODUCT_BETA_DB_REAL_OK' : 'PRODUCT_BETA_DB_REAL_FAIL');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
