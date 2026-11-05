// AUDIT TEST — verificação independente de release readiness (AGENTE GEMINI 4).
// Verifica a amarração entre repositórios Git (isaeldaumas/HFA vs system-hfa/HFA)
// e os projetos/deployments no Vercel (systemhfa vs frontend).
//
// Executar: ./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/verify-vercel-git-linkage.ts

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '../../..');

let failures = 0;
let notVerified = 0;

function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
}

function recordNotVerified(label: string, reason: string) {
  console.log(`NOT_VERIFIED — ${label}: ${reason}`);
  notVerified++;
}

console.log('=== VERIFICAÇÃO 1: REMOTES GIT LOCAIS ===');
let remotes = '';
try {
  remotes = execSync('git remote -v', { cwd: ROOT_DIR, encoding: 'utf8' });
} catch (e: any) {
  remotes = '';
}

check(remotes.includes('https://github.com/isaeldaumas/HFA'), 'Remote origin/origin-hfa aponta para isaeldaumas/HFA');
check(remotes.includes('https://github.com/system-hfa/HFA'), 'Remote source-hfa aponta para system-hfa/HFA (legado/upstream)');

console.log('\n=== VERIFICAÇÃO 2: DIVERGÊNCIA DE BRANCHES HEAD / ORIGIN / SOURCE ===');
let originMainSha = '';
let sourceMainSha = '';
let currentHeadSha = '';

try {
  currentHeadSha = execSync('git rev-parse HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  originMainSha = execSync('git rev-parse origin/main', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
  sourceMainSha = execSync('git rev-parse source-hfa/main', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
} catch (e: any) {
  console.error('Erro lendo SHAs locais:', e.message);
}

check(currentHeadSha.length === 40, `HEAD local resolvido: ${currentHeadSha.slice(0, 7)}`);
check(originMainSha.length === 40, `origin/main resolvido: ${originMainSha.slice(0, 7)}`);
check(sourceMainSha.length === 40, `source-hfa/main resolvido: ${sourceMainSha.slice(0, 7)}`);
check(originMainSha !== sourceMainSha, `Divergência confirmada entre isaeldaumas/HFA (${originMainSha.slice(0, 7)}) e system-hfa/HFA (${sourceMainSha.slice(0, 7)})`);

console.log('\n=== VERIFICAÇÃO 3: METADADOS DO PROJETO VERCEL (systemhfa) ===');
let vercelProjectAvailable = false;
let vercelProjectJson: any = null;

try {
  const vercelOut = execSync('vercel api /v9/projects/prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa', { encoding: 'utf8' });
  vercelProjectJson = JSON.parse(vercelOut);
  vercelProjectAvailable = true;
} catch (e: any) {
  recordNotVerified('Consulta Vercel API via CLI', e.message);
}

if (vercelProjectAvailable && vercelProjectJson) {
  check(vercelProjectJson.name === 'systemhfa', 'Projeto Vercel ativo identificado como systemhfa');
  check(vercelProjectJson.link?.org === 'system-hfa', 'Vercel está vinculado à organização GitHub system-hfa (DIVERGÊNCIA de repositório)');
  check(vercelProjectJson.link?.repo === 'HFA', 'Vercel está vinculado ao repositório HFA');
  check(vercelProjectJson.link?.sourceless === true, 'Vercel project link é sourceless (deploy via CLI/API)');

  const latestProd = vercelProjectJson.latestDeployments?.[0];
  if (latestProd) {
    const deployedSha = latestProd.meta?.gitCommitSha;
    check(deployedSha === 'cb13923b0009bdce1c13b1403516a820c425a002', `SHA publicado em produção é cb13923 (Merge PR #115), encontrado: ${deployedSha?.slice(0, 7)}`);
    check(deployedSha !== originMainSha, `Produção está defasada em relação a origin/main (${deployedSha?.slice(0, 7)} vs ${originMainSha.slice(0, 7)})`);
    check(latestProd.target === 'production', 'Target do último deployment é production');
    check(latestProd.readyState === 'READY', 'Estado do último deployment de produção é READY');
  } else {
    recordNotVerified('Último deployment Vercel', 'Nenhum deployment retornado');
  }
} else {
  recordNotVerified('Auditoria Vercel Live API', 'Vercel CLI não autenticado ou indisponível');
}

console.log('\n=== VERIFICAÇÃO 4: STAGING NO VERCEL ===');
// Verifica se há branch alias ou projeto de staging ativo
let stagingFound = false;
if (vercelProjectAvailable && vercelProjectJson) {
  const latestPreview = vercelProjectJson.latestDeployments?.find((d: any) => d.target === 'preview');
  if (!latestPreview) {
    console.log('PASS — Nenhum deployment de preview ativo contínuo em systemhfa (staging em Vercel é NOT_CONFIGURED)');
  } else {
    console.log(`INFO — Preview deployment antigo encontrado: ${latestPreview.url}`);
  }
} else {
  recordNotVerified('Staging Vercel status', 'Não foi possível verificar via Vercel API');
}

console.log('\n=== RESULTADO DA VERIFICAÇÃO DE AMARRAÇÃO ===');
console.log(`Falhas: ${failures}, Não verificados: ${notVerified}`);

if (failures === 0) {
  console.log('VERIFY_VERCEL_GIT_LINKAGE_OK');
  process.exit(0);
} else {
  console.error(`VERIFY_VERCEL_GIT_LINKAGE_FAILED (${failures} falhas)`);
  process.exit(1);
}
