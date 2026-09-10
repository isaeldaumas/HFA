// provenance-db-real-trial-001.ts
// Teste real: verifica que colunas de proveniência aceitam valores e são recuperáveis.
// Requer: frontend/.env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..')
const FRONTEND_ENV_PATH = path.join(ROOT_DIR, 'frontend', '.env.local')
const require = createRequire(import.meta.url)
const { createClient } = require(path.join(ROOT_DIR, 'frontend', 'node_modules', '@supabase', 'supabase-js')) as {
  createClient: (...args: unknown[]) => any
}

function loadEnv(): void {
  if (!fs.existsSync(FRONTEND_ENV_PATH)) throw new Error(`Falta env: ${FRONTEND_ENV_PATH}`)
  for (const line of fs.readFileSync(FRONTEND_ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([^#=][^=]*)=(.*)$/)
    if (!m) continue
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
}

let passed = 0
let failed = 0

function assert(condition: boolean, label: string) {
  if (condition) { console.log(`  PASS: ${label}`); passed++ }
  else { console.error(`  FAIL: ${label}`); failed++ }
}

function assertEq<T>(actual: T, expected: T, label: string) {
  if (actual === expected) { console.log(`  PASS: ${label} (=${String(actual)})`); passed++ }
  else { console.error(`  FAIL: ${label} — esperado=${String(expected)}, recebido=${String(actual)}`); failed++ }
}

async function main() {
  console.log('\n=== provenance-db-real-trial-001 ===\n')

  loadEnv()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  assert(!!supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL definido')
  assert(!!supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY definido')

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Require explicit fixture IDs — hardcoded UUIDs replaced with env vars.
  // Set HFA_TEST_TENANT_A_ID and HFA_TEST_USER_A_ID before running.
  const TEST_TENANT_ID = process.env.HFA_TEST_TENANT_A_ID?.trim() ?? ''
  const TEST_USER_ID = process.env.HFA_TEST_USER_A_ID?.trim() ?? ''
  if (!TEST_TENANT_ID || !TEST_USER_ID) {
    console.log('ENVIRONMENT_NOT_CONFIGURED: HFA_TEST_TENANT_A_ID and HFA_TEST_USER_A_ID must be set. Skipping mutation tests.')
    process.exit(0)
  }
  const TEST_TITLE = '[PRODUCT_UNIFICATION_RUNTIME_TEST] provenance-db-real-trial-001'
  let createdAnalysisId: string | null = null
  let createdRevisionId: string | null = null

  // --- Schema: analyses ---
  console.log('1. Schema: colunas existem em sera_vnext_analyses')
  {
    const { error } = await supabase
      .from('sera_vnext_analyses')
      .select('engine_runtime_version,source_flow,canonical_tree_version')
      .limit(1)
    assert(!error, `Query schema analyses sem erro (${error?.message ?? 'ok'})`)
  }

  // --- Schema: revisions ---
  console.log('\n2. Schema: colunas existem em sera_vnext_analysis_revisions')
  {
    const { error } = await supabase
      .from('sera_vnext_analysis_revisions')
      .select('engine_runtime_version,source_flow')
      .limit(1)
    assert(!error, `Query schema revisions sem erro (${error?.message ?? 'ok'})`)
  }

  // --- INSERT analyses com proveniência ---
  console.log('\n3. INSERT analyses com proveniência real')
  {
    const engineOutput = {
      engineVersion: '0.2.0',
      escapePoint: { status: 'CANDIDATE', statement: 'Test escape point' },
      directActor: { actor: 'PILOT' },
      axes: {
        perception: { proposedCode: 'P-G', confidence: 0.8, reasoning: 'test' },
        objective: { proposedCode: 'O-D', confidence: 0.7, reasoning: 'test' },
        action: { proposedCode: null, confidence: 0.5, reasoning: 'test' },
      },
      uncertainties: [], limitations: [], warnings: [],
      selectedCode: null, releasedCode: null, finalConclusion: null,
      classifiedOutput: false, readyPromotion: false, downstreamAllowed: false,
      humanReviewRequired: true,
    }

    const { data, error } = await supabase
      .from('sera_vnext_analyses')
      .insert({
        tenant_id: TEST_TENANT_ID,
        created_by: TEST_USER_ID,
        deleted_at: null,
        status: 'CANDIDATE_ANALYSIS_CREATED',
        review_status: 'NOT_REVIEWED',
        title: TEST_TITLE,
        narrative: '[PRODUCT_UNIFICATION_RUNTIME_TEST] provenance — pode ser deletado',
        narrative_hash: 'test-hash-provenance-001',
        source_type: 'TEST',
        source_reference: null,
        client_request_id: `provenance-real-trial-001-${Date.now()}`,
        request_id: `req-provenance-001-${Date.now()}`,
        engine_version: '0.1.0',
        engine_runtime_version: '0.2.0',
        methodology_version: 'SERA_PT_V1_FROZEN',
        baseline_id: 'SERA_VNEXT_BASELINE_V0',
        fixture_set_id: 'SERA_VNEXT_FIXTURE_SET_V0',
        input_schema_version: '0.1.0',
        output_schema_version: '0.2.0',
        code_commit: 'test-commit-provenance-001',
        source_flow: 'VNEXT_PRODUCT_BETA',
        canonical_tree_version: 'SERA_PT_V1',
        engine_input: { narrative: 'test', title: TEST_TITLE },
        engine_output: engineOutput,
        engine_output_hash: 'test-output-hash-provenance-001',
        escape_point_status: engineOutput.escapePoint.status,
        escape_point_statement: engineOutput.escapePoint.statement,
        direct_actor: engineOutput.directActor.actor,
        perception_candidate_code: engineOutput.axes.perception.proposedCode,
        objective_candidate_code: engineOutput.axes.objective.proposedCode,
        action_candidate_code: engineOutput.axes.action.proposedCode,
        warnings: [], uncertainties: [], limitations: [],
        current_revision: 1,
        metadata: { test: true, trial: 'provenance-db-real-trial-001' },
      })
      .select('id,engine_version,engine_runtime_version,source_flow,canonical_tree_version')
      .single()

    assert(!error, `INSERT analyses sem erro (${error?.message ?? 'ok'})`)
    assert(!!data, 'Record analyses retornado')
    if (data) {
      createdAnalysisId = data.id
      console.log(`  INFO: analysis id=${data.id}`)
      assertEq(data.engine_version, '0.1.0', 'engine_version = 0.1.0 (contrato DB)')
      assertEq(data.engine_runtime_version, '0.2.0', 'engine_runtime_version = 0.2.0 (runtime)')
      assertEq(data.source_flow, 'VNEXT_PRODUCT_BETA', 'source_flow = VNEXT_PRODUCT_BETA')
      assertEq(data.canonical_tree_version, 'SERA_PT_V1', 'canonical_tree_version = SERA_PT_V1')
      assert(
        data.engine_version !== data.engine_runtime_version,
        'Divergência contrato vs runtime preservada'
      )
    }
  }

  // --- INSERT revision com proveniência ---
  if (createdAnalysisId) {
    console.log('\n4. INSERT revision com proveniência real')
    const { data, error } = await supabase
      .from('sera_vnext_analysis_revisions')
      .insert({
        analysis_id: createdAnalysisId,
        tenant_id: TEST_TENANT_ID,
        revision_number: 1,
        created_by: TEST_USER_ID,
        request_id: 'req-provenance-001-rev',
        engine_version: '0.1.0',
        engine_runtime_version: '0.2.0',
        source_flow: 'VNEXT_PRODUCT_BETA',
        engine_input: { narrative: 'test', title: TEST_TITLE },
        engine_output: { engineVersion: '0.2.0' },
        engine_output_hash: 'test-output-hash-rev-001',
        reason: 'initial_analysis',
        metadata: { source: 'provenance_db_real_trial_001' },
      })
      .select('id,engine_runtime_version,source_flow')
      .single()

    assert(!error, `INSERT revision sem erro (${error?.message ?? 'ok'})`)
    assert(!!data, 'Revision retornada')
    if (data) {
      createdRevisionId = data.id
      console.log(`  INFO: revision id=${data.id}`)
      assertEq(data.engine_runtime_version, '0.2.0', 'revision.engine_runtime_version = 0.2.0')
      assertEq(data.source_flow, 'VNEXT_PRODUCT_BETA', 'revision.source_flow = VNEXT_PRODUCT_BETA')
    }
  }

  // --- Round-trip read ---
  if (createdAnalysisId) {
    console.log('\n5. Round-trip read — leitura de volta')
    const { data, error } = await supabase
      .from('sera_vnext_analyses')
      .select('id,engine_version,engine_runtime_version,source_flow,canonical_tree_version,status')
      .eq('id', createdAnalysisId)
      .single()

    assert(!error, `Leitura sem erro (${error?.message ?? 'ok'})`)
    if (data) {
      assertEq(data.engine_runtime_version, '0.2.0', 'Round-trip: engine_runtime_version = 0.2.0')
      assertEq(data.source_flow, 'VNEXT_PRODUCT_BETA', 'Round-trip: source_flow = VNEXT_PRODUCT_BETA')
      assertEq(data.canonical_tree_version, 'SERA_PT_V1', 'Round-trip: canonical_tree_version = SERA_PT_V1')
    }
  }

  // --- Cleanup (soft-delete: tabelas são append-only, sem DELETE) ---
  console.log('\n6. Cleanup — soft-delete dos registros de teste')
  if (createdAnalysisId) {
    const { error } = await supabase
      .from('sera_vnext_analyses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', createdAnalysisId)
    assert(!error, `Analysis soft-deleted (${error?.message ?? 'ok'})`)
  }

  console.log(`\n=== Resultado: ${passed} PASS, ${failed} FAIL ===\n`)
  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('ERRO FATAL:', err)
  process.exit(1)
})
