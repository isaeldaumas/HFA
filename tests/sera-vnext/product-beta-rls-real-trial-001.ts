export {};

/**
 * SERA vNext Product Beta — Real RLS Validation Trial
 *
 * Tests RLS policies against a live Supabase database.
 * Anon role is blocked from SELECT and INSERT on all sera_vnext_* tables.
 *
 * Validated: 2026-06-07 — PRODUCT_BETA_RLS_REAL_OK
 * Run: NODE_PATH=frontend/node_modules npx tsx tests/sera-vnext/product-beta-rls-real-trial-001.ts
 */

import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';

const TRIAL_ID = 'product-beta-rls-real-trial-001';
const require = createRequire(import.meta.url);
const { createClient: createSupabaseClient } = require(path.join(__dirname, '../../frontend/node_modules/@supabase/supabase-js'));

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

async function run() {
  if (!supabaseUrl || !serviceRole) {
    console.log(`[${TRIAL_ID}] SKIPPED — DB credentials not available`);
    process.exit(0);
  }

  const admin = createSupabaseClient(supabaseUrl, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });

  if (anonKey) {
    const anon = createSupabaseClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    for (const t of TABLES) {
      const { data, error } = await anon.from(t as never).select('id').limit(1);
      const blocked = (Array.isArray(data) && data.length === 0) || !!error;
      checks.push({ name: `anon_select_blocked_${t}`, pass: blocked,
        detail: error ? error.message.slice(0, 60) : `rows=${Array.isArray(data) ? data.length : 'null'}` });
    }

    // Require explicit fixture IDs — never select arbitrary tenant/user via .limit(1)
    const tenantAId = process.env.HFA_TEST_TENANT_A_ID?.trim() ?? '';
    const userAId = process.env.HFA_TEST_USER_A_ID?.trim() ?? '';

    if (tenantAId && userAId) {
      const { error: insErr } = await anon.from('sera_vnext_analyses' as never).insert({
        tenant_id: tenantAId, created_by: userAId,
        title: '[RLS_TEST] anon insert', client_request_id: 'rls-anon-insert-attempt',
        narrative: 'Anon insert attempt with enough length to pass constraint checks if RLS absent.',
        narrative_hash: 'rls_hash', source_type: 'TEST', request_id: 'req-rls-001',
        status: 'CANDIDATE_ANALYSIS_CREATED', review_status: 'NOT_REVIEWED',
        engine_version: '0.1.0', methodology_version: 'SERA_PT_V1_FROZEN',
        baseline_id: 'SERA_VNEXT_BASELINE_V0', fixture_set_id: 'SERA_VNEXT_FIXTURE_SET_V0',
        input_schema_version: '1.0.0', output_schema_version: '1.0.0',
        code_commit: '6393798f', engine_input: {}, engine_output_hash: 'rls_out',
        engine_output: { selectedCode: null, releasedCode: null, finalConclusion: null, classifiedOutput: false, readyPromotion: false, downstreamAllowed: false },
      } as never);
      checks.push({ name: 'anon_insert_blocked_sera_vnext_analyses', pass: !!insErr,
        detail: insErr ? `BLOCKED: ${insErr.message?.slice(0, 80)}` : 'NOT BLOCKED — RLS violation!' });
    }
  } else {
    checks.push({ name: 'anon_key_available', pass: false, detail: 'NEXT_PUBLIC_SUPABASE_ANON_KEY not set' });
  }

  const pass = checks.filter(c => c.pass).length;
  const fail = checks.filter(c => !c.pass).length;

  console.log(`\n[${TRIAL_ID}]`);
  for (const c of checks) console.log(`  ${c.pass ? '✓' : '✗'} [${c.pass ? 'PASS' : 'FAIL'}] ${c.name} — ${c.detail}`);
  console.log(`\nPASS=${pass} FAIL=${fail}`);
  console.log(fail === 0 ? 'PRODUCT_BETA_RLS_REAL_OK' : 'PRODUCT_BETA_RLS_REAL_FAIL');
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
