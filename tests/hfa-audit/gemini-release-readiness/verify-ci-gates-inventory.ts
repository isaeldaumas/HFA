// AUDIT TEST — inventário e verificação de gates da CI (AGENTE GEMINI 4).
// Audita arquivos de workflow do GitHub Actions (.github/workflows/*.yml),
// seus gatilhos, isolamento de segredos, flags de contingência e pontos de falha conhecidos.
//
// Executar: ./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/verify-ci-gates-inventory.ts

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = join(__dirname, '../../..');
const WORKFLOWS_DIR = join(ROOT_DIR, '.github/workflows');

let failures = 0;

function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

console.log('=== GATES CI 1: HFA CORE CI (.github/workflows/hfa-core-ci.yml) ===');
const coreCiPath = join(WORKFLOWS_DIR, 'hfa-core-ci.yml');
check(existsSync(coreCiPath), 'Workflow hfa-core-ci.yml existe');

const coreCiContent = readFileSync(coreCiPath, 'utf8');

// Verificação de gatilhos
check(coreCiContent.includes('pull_request:') && coreCiContent.includes('branches:\n      - main'), 'Core CI dispara em pull_request para main');
check(coreCiContent.includes('push:') && coreCiContent.includes('branches:\n      - main'), 'Core CI dispara em push para main');
check(coreCiContent.includes('workflow_dispatch:'), 'Core CI permite execução manual via workflow_dispatch');

// Verificação de ambiente seguro (placeholders)
check(coreCiContent.includes('NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co'), 'Core CI usa URL de placeholder para Supabase');
check(coreCiContent.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-placeholder'), 'Core CI usa anon key placeholder');
check(coreCiContent.includes('SUPABASE_SERVICE_ROLE_KEY: ci-placeholder'), 'Core CI usa service role key placeholder');
check(coreCiContent.includes('NEXTAUTH_SECRET: ci-placeholder'), 'Core CI usa nextauth secret placeholder');

// Verificação de flags de proteção Shadow e vNext
check(coreCiContent.includes('SERA_SHADOW_EXECUTION_ENABLED: "false"'), 'SERA_SHADOW_EXECUTION_ENABLED desligado em CI');
check(coreCiContent.includes('SERA_SHADOW_PERSISTENCE_ENABLED: "false"'), 'SERA_SHADOW_PERSISTENCE_ENABLED desligado em CI');
check(coreCiContent.includes('SERA_SHADOW_ADMIN_VIEW_ENABLED: "false"'), 'SERA_SHADOW_ADMIN_VIEW_ENABLED desligado em CI');
check(coreCiContent.includes('SERA_SHADOW_AUTO_COMPARISON_ENABLED: "false"'), 'SERA_SHADOW_AUTO_COMPARISON_ENABLED desligado em CI');
check(coreCiContent.includes('SERA_SHADOW_VALIDATION_REPORTS_ENABLED: "false"'), 'SERA_SHADOW_VALIDATION_REPORTS_ENABLED desligado em CI');
check(coreCiContent.includes('NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED: "false"'), 'NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED desligado em CI');

// Verificação de steps obrigatórios
const expectedCoreSteps = [
  'Production dependency vulnerability gate',
  'Development tooling vulnerability gate',
  'Signup WAF 429 UI contract',
  'Supabase direct signup policy audit contract',
  'Two-tenant read-only E2E fixture contract',
  'TypeScript',
  'Lint',
  'Build',
  'Registration consistency and cleanup',
  'ERC containment runtime',
  'ERC containment static',
  'ERC containment D3-b',
  'Legacy freeze',
  'Shadow mode',
  'Shadow divergence V1 contract',
  'Shadow rollback contract',
  'Shadow production build interlock (adversarial)',
  'Tenant isolation contract',
  'Commercial trial contract',
  'Safety event workflow contract',
];

for (const stepName of expectedCoreSteps) {
  check(coreCiContent.includes(`name: ${stepName}`), `Step '${stepName}' está presente no Core CI`);
}

console.log('\n=== GATES CI 2: SERA vNext DETERMINISTIC REGRESSION ===');
const seraCiPath = join(WORKFLOWS_DIR, 'hfa-sera-vnext-deterministic-regression.yml');
check(existsSync(seraCiPath), 'Workflow hfa-sera-vnext-deterministic-regression.yml existe');

const seraCiContent = readFileSync(seraCiPath, 'utf8');
check(seraCiContent.includes('run-sera-vnext-ci-regression.ts'), 'Workflow executa runner determinístico de regressão');
check(seraCiContent.includes('SERA_SHADOW_EXECUTION_ENABLED: "false"'), 'Shadow desligado no workflow SERA vNext');
check(seraCiContent.includes('SERA_VNEXT_READONLY_ENABLED: "false"'), 'vNext Readonly desligado no workflow SERA');

console.log('\n=== GATES CI 3: HFA INTEGRATED REGRESSION (Staging Guardrails) ===');
const integratedPath = join(WORKFLOWS_DIR, 'hfa-integrated-regression.yml');
check(existsSync(integratedPath), 'Workflow hfa-integrated-regression.yml existe');

const integratedContent = readFileSync(integratedPath, 'utf8');
check(!integratedContent.includes('pull_request:'), 'Integrated regression NÃO dispara em pull_request (segurança de staging)');
check(!integratedContent.includes('push:'), 'Integrated regression NÃO dispara em push automático');
check(integratedContent.includes('workflow_dispatch:'), 'Integrated regression requer disparo manual explícito');
check(integratedContent.includes('confirm_staging_only'), 'Integrated regression exige confirmação confirm_staging_only: true');
check(integratedContent.includes('INTEGRATED_REGRESSION_WORKFLOW_READY_ENVIRONMENT_NOT_CONFIGURED'), 'Integrated regression falha de forma segura (fail-closed) se segredos estiverem ausentes');
check(integratedContent.includes('HFA_STAGING_SUPABASE_PROJECT_REF'), 'Validação de project ref de staging impede execução contra produção');

console.log('\n=== PONTO DE FALHA CONHECIDO: MIGRATION PREFLIGHT SNAPSHOT AGE ===');
// Testa a execução do preflight para documentar o comportamento atual
let preflightResult: any = null;
try {
  const out = execSync('node scripts/release/preflight-migration-history.mjs', { cwd: ROOT_DIR, encoding: 'utf8' });
  preflightResult = JSON.parse(out);
} catch (e: any) {
  try {
    preflightResult = JSON.parse(e.stdout);
  } catch {
    preflightResult = { status: 'ERROR', error: e.message };
  }
}

check(preflightResult.check === 'HFA_MIGRATION_LEDGER_PREFLIGHT', 'Preflight migration ledger detectado');
check(preflightResult.status === 'FAIL', 'Preflight falha fechado (FAIL) devido a snapshot de migração expirado (>24h)');
check(preflightResult.db_push_allowed === false, 'db_push_allowed é estritamente false sem reconciliação e aprovação');
console.log(`INFO — Snapshot age: ${preflightResult.snapshot_age_hours}h (limite 24h). Problema reportado: ${preflightResult.problems?.[0]}`);

console.log('\n=== RESULTADO DO INVENTÁRIO DE GATES ===');
console.log(`Falhas de conformidade dos workflows: ${failures}`);

if (failures === 0) {
  console.log('VERIFY_CI_GATES_INVENTORY_OK');
  process.exit(0);
} else {
  console.error(`VERIFY_CI_GATES_INVENTORY_FAILED (${failures} falhas)`);
  process.exit(1);
}
