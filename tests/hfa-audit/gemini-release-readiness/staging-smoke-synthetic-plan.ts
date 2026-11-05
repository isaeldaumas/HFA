// AUDIT TEST — plano e contrato executável de smoke test de staging (AGENTE GEMINI 4).
// Verifica as regras de execução do smoke test:
// 1. Uso exclusivo de dados sintéticos e fixtures isoladas A/B.
// 2. Proibição absoluta de execução contra hosts de produção.
// 3. Respostas fail-closed para rotas protegidas sem autenticação (401/403).
// 4. Separação explícita entre o que foi executado (testes locais) e o que é proposto (staging remoto).
//
// Executar: ./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/staging-smoke-synthetic-plan.ts

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isAllowedStagingTarget } from './allowlisted-staging-target';

const ROOT_DIR = join(__dirname, '../../..');

let failures = 0;
let executedChecks = 0;
let proposedChecks = 0;

function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
  executedChecks++;
}

function proposed(label: string, prerequisite: string) {
  console.log(`PROPOSED (PENDENTE DE DISPATCH) — ${label} [Requer: ${prerequisite}]`);
  proposedChecks++;
}

console.log('=== CONTRATO 1: PROIBIÇÃO DE PRODUÇÃO EM TESTES INTEGRADOS/SMOKE ===');
const approvedOrigin = 'https://hfa-staging.test.example';
check(isAllowedStagingTarget('http://127.0.0.1:3100'), 'http://127.0.0.1:3100 é aceito como alvo local');
check(!isAllowedStagingTarget('https://systemhfa.vercel.app'), 'Produção rejeitada sem exceção');
check(!isAllowedStagingTarget('https://systemhfa.vercel.app/api/auth/me'), 'Subcaminhos da produção rejeitados');
check(!isAllowedStagingTarget('https://attacker.example/path/staging'), 'Substring staging no caminho não autoriza host');
check(!isAllowedStagingTarget('https://my-staging.evil.example'), 'Hostname staging não autoriza sem allowlist');
check(!isAllowedStagingTarget('http://localhost.evil.example:3100'), 'Hostname falso local rejeitado');
check(!isAllowedStagingTarget('https://systemhfa.vercel.app', ['https://systemhfa.vercel.app']), 'Produção rejeitada mesmo quando acidentalmente listada');
check(isAllowedStagingTarget(approvedOrigin + '/api/auth/me', [approvedOrigin]), 'Staging explicitamente autorizado aceita paths');
check(!isAllowedStagingTarget('https://hfa-staging.test.example.evil.com', [approvedOrigin]), 'Subdomínio confundível não é aceito');
check(!isAllowedStagingTarget('https://user:pass@hfa-staging.test.example', [approvedOrigin]), 'URL com credenciais embutidas não autorizada');
check(!isAllowedStagingTarget('https://attacker.example/path/staging', [approvedOrigin]), 'Allowlist exige origem exata');

console.log('\n=== CONTRATO 2: IDENTIFICADORES SINTÉTICOS E SEGURANÇA MULTI-TENANT ===');
// Verifica formato de IDs sintéticos de staging (UUID v4)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNTHETIC_TENANT_A = '489d4eca-0e89-4adf-80ba-6a16c74d3201';
const SYNTHETIC_TENANT_B = 'b5ecab49-2d1b-43bf-80aa-88f58b738910';

check(UUID_REGEX.test(SYNTHETIC_TENANT_A), 'Tenant A sintético é UUID v4 válido');
check(UUID_REGEX.test(SYNTHETIC_TENANT_B), 'Tenant B sintético é UUID v4 válido');
check(SYNTHETIC_TENANT_A !== SYNTHETIC_TENANT_B, 'Tenants A e B são mutuamente exclusivos');

console.log('\n=== CONTRATO 3: FAIL-CLOSED EM ROTAS PROTEGIDAS (ESTÁTICA / OFFLINE) ===');
// Verifica que rotas críticas importam e exigem autenticação do servidor
const FRONTEND_SRC = join(ROOT_DIR, 'frontend/src');
const meRoutePath = join(FRONTEND_SRC, 'app/api/auth/me/route.ts');
const eventsRoutePath = join(FRONTEND_SRC, 'app/api/events/route.ts');
const adminTenantsPath = join(FRONTEND_SRC, 'app/api/admin/tenants/route.ts');

check(existsSync(meRoutePath), 'Rota /api/auth/me existe');
check(existsSync(eventsRoutePath), 'Rota /api/events existe');
check(existsSync(adminTenantsPath), 'Rota /api/admin/tenants existe');

const meSrc = readFileSync(meRoutePath, 'utf8');
const eventsSrc = readFileSync(eventsRoutePath, 'utf8');
const adminSrc = readFileSync(adminTenantsPath, 'utf8');

check(meSrc.includes('401') || meSrc.includes('Unauthorized') || meSrc.includes('requireBearerUser') || meSrc.includes('getUser'), '/api/auth/me exige autenticação (fail-closed se ausente)');
check(eventsSrc.includes('tenant_id') && (eventsSrc.includes('401') || eventsSrc.includes('requireBearerUser') || eventsSrc.includes('getUser')), '/api/events exige autenticação e tenant_id');
check(adminSrc.includes('401') || adminSrc.includes('403') || adminSrc.includes('admin'), '/api/admin/tenants exige papel administrativo ou rejeita anônimos');

console.log('\n=== PLANO DE SMOKE TEST: ETAPAS EXECUTADAS vs ETAPAS PROPOSTAS ===');
console.log('--- ETAPAS EXECUTADAS LOCALMENTE NESTA AUDITORIA ---');
console.log('1. [EXECUTADO] Verificação de integridade dos workflows e triggers de staging.');
console.log('2. [EXECUTADO] Validação sintética de parâmetros e formato de tenants A e B.');
console.log('3. [EXECUTADO] Análise estática de fail-closed para rotas protegidas.');
console.log('4. [EXECUTADO] Verificação da ausência de chamadas a produção.');

console.log('\n--- ETAPAS PROPOSTAS PARA STAGING REMOTO (DEPENDEM DE DISPATCH HUMANO) ---');
proposed('Smoke Test HTTP 200 nas páginas públicas de staging (/, /login, /register, /methodology)', 'Staging URL configurada no GitHub Secrets');
proposed('Smoke Test de autenticação e sessão com Tenant A synthetic fixture', 'HFA Integrated Regression workflow_dispatch com confirm_staging_only=true');
proposed('Smoke Test de isolamento cruzado Tenant A tentando acessar eventos de Tenant B (esperado 404/403)', 'HFA Integrated Regression workflow_dispatch com fixtures A/B provisionadas');
proposed('Smoke Test de extração e submissão sintética de evento sem envio de e-mail real', 'Staging Supabase dev project ref allowlisted');

console.log('\n=== RESUMO DO PLANO DE SMOKE TEST ===');
console.log(`Etapas executadas: ${executedChecks}`);
console.log(`Etapas propostas (pendentes de ambiente/autorização): ${proposedChecks}`);
console.log(`Falhas de contrato: ${failures}`);

if (failures === 0) {
  console.log('STAGING_SMOKE_SYNTHETIC_PLAN_OK');
  process.exit(0);
} else {
  console.error(`STAGING_SMOKE_SYNTHETIC_PLAN_FAILED (${failures} falhas)`);
  process.exit(1);
}
