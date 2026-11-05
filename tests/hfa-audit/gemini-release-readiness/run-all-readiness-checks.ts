// AUDIT TEST RUNNER — Suíte completa de Release Readiness (AGENTE GEMINI 4).
// Executa em sequência os três módulos de auditoria de release readiness
// e produz a matriz de conformidade.
//
// Executar: ./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/run-all-readiness-checks.ts

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '../../..');
const SCRIPTS = [
  { name: 'VERCEL_GIT_LINKAGE', path: 'tests/hfa-audit/gemini-release-readiness/verify-vercel-git-linkage.ts' },
  { name: 'CI_GATES_INVENTORY', path: 'tests/hfa-audit/gemini-release-readiness/verify-ci-gates-inventory.ts' },
  { name: 'STAGING_SMOKE_PLAN', path: 'tests/hfa-audit/gemini-release-readiness/staging-smoke-synthetic-plan.ts' },
];

console.log('===============================================================');
console.log('   HFA RELEASE READINESS AUDIT SUITE (AGENTE GEMINI 4)       ');
console.log('===============================================================\n');

let totalPassed = 0;
let totalFailed = 0;
const results: Record<string, string> = {};

for (const script of SCRIPTS) {
  console.log(`>>> Executando módulo: ${script.name} (${script.path})...`);
  const res = spawnSync(
    './frontend/node_modules/.bin/tsx',
    [script.path],
    { cwd: ROOT_DIR, encoding: 'utf8', stdio: 'inherit' }
  );

  if (res.status === 0) {
    results[script.name] = 'PASS';
    totalPassed++;
    console.log(`>>> [OK] ${script.name}: PASS\n`);
  } else {
    results[script.name] = 'FAIL';
    totalFailed++;
    console.log(`>>> [ERRO] ${script.name}: FAIL (código ${res.status})\n`);
  }
}

console.log('===============================================================');
console.log('                      MATRIZ FINAL DE STATUS                   ');
console.log('===============================================================');
for (const [name, status] of Object.entries(results)) {
  console.log(`  ${name.padEnd(25)} : ${status}`);
}
console.log('  -----------------------------------------------------------');
console.log('  VERCEL_PRODUCTION_DEPLOY  : NOT_VERIFIED (defasado em 3 commits)');
console.log('  VERCEL_STAGING_PIPELINE   : NOT_VERIFIED (sem ambiente contínuo)');
console.log('  SERA_V04_SCIENTIFIC_VALID : NOT_RUN (bloqueado por governança)');
console.log('===============================================================');

if (totalFailed === 0) {
  console.log(`\nALL_READINESS_CHECKS_PASS (${totalPassed}/${SCRIPTS.length} módulos passaram)`);
  process.exit(0);
} else {
  console.error(`\nREADINESS_CHECKS_FAIL (${totalFailed} falhas)`);
  process.exit(1);
}
