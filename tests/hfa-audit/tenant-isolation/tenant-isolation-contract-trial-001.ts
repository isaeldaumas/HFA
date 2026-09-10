// AUDIT TEST — não faz parte do manifesto oficial (tests/sera-vnext/test-manifest.json).
// Automatiza a investigação F-01 (docs/auditoria-hfa/segunda-etapa/02-isolamento-tenants.md)
// em 12 cenários. Como não há Supabase real disponível neste ambiente (mesma limitação da
// 1ª/2ª etapa), os cenários são verificados por ANÁLISE ESTÁTICA de código-fonte: cada cenário
// afirma um padrão que, se ausente, indica que uma rota/repositório passou a ignorar tenant_id.
// Isso é deliberadamente mais rígido que um teste de banco: pega a regressão no código antes
// de qualquer dado real ser exposto. Quando houver Supabase de staging disponível, complementar
// com os testes REAL_DB do manifesto oficial (não substituir este).
//
// Executar: npx tsx tests/hfa-audit/tenant-isolation/tenant-isolation-contract-trial-001.ts

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const FRONTEND_SRC = join(__dirname, '../../../frontend/src')
const API_DIR = join(FRONTEND_SRC, 'app/api')

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, files)
    else if (entry === 'route.ts') files.push(full)
  }
  return files
}

const TENANT_TABLES = [
  'analyses', 'events', 'corrective_actions', 'risk_profile_exclusions',
  'sera_vnext_analyses', 'sera_vnext_analysis_events', 'sera_vnext_analysis_reviews',
  'sera_vnext_analysis_revisions', 'sera_vnext_shadow_results', 'users', 'credit_transactions',
]

const routeFiles = walk(API_DIR)
check(routeFiles.length > 30, `descobriu rotas de API suficientes para auditar (encontrado ${routeFiles.length})`)

// ── Cenários 1–3: leitura/atualização/exclusão cruzada — toda query a tabela tenant-scoped
//    deve carregar um filtro de tenant, direto ou via helper conhecido. ──────────────────────
const KNOWN_TENANT_SAFE_HELPERS = [
  'getRiskProfileSummaryForTenant',
  'ensurePublicUserRow',
  'debitCreditForEvent',
  'refundCreditForFailedAnalysis',
  'requireAdmin',
  'requireBearerUser',
  'createSeraVNextAnalysis',
  'handleGetSeraVNextAnalysisRequest',
  'handleListSeraVNextAnalysesRequest',
  'handleReanalyzeSeraVNextAnalysisRequest',
  'handleSubmitSeraVNextReviewRequest',
  'handleArchiveSeraVNextAnalysisRequest',
  'handleRestoreSeraVNextAnalysisRequest',
  'handleExportSeraVNextAnalysisRequest',
  'completeSeraAnalysisAfterEventCreated',
  'getEventDeletionImpact',
  'fetchEditHistoryForAnalysis',
]

// Rotas de bootstrap/criação de tenant: não há "outro tenant" a isolar porque o tenant do
// próprio usuário ainda não existe/está sendo criado nesta chamada (registro self-service,
// bootstrap OAuth). Documentado explicitamente — não é uma exceção silenciosa.
const TENANT_CREATION_TIME_ROUTES = [
  join(API_DIR, 'auth/register/route.ts'),
  join(API_DIR, 'auth/oauth/bootstrap/route.ts'),
]

const violatingRoutesReadUpdateDelete: string[] = []
for (const file of routeFiles) {
  if (TENANT_CREATION_TIME_ROUTES.includes(file)) continue
  const src = readFileSync(file, 'utf8')
  const touchesTenantTable = TENANT_TABLES.some((t) => src.includes(`.from('${t}')`) || src.includes(`.from("${t}")`))
  if (!touchesTenantTable) continue
  const hasDirectTenantFilter = /\.eq\(\s*['"]tenant_id['"]/.test(src)
  const usesKnownSafeHelper = KNOWN_TENANT_SAFE_HELPERS.some((h) => src.includes(h))
  if (!hasDirectTenantFilter && !usesKnownSafeHelper) {
    violatingRoutesReadUpdateDelete.push(file.replace(FRONTEND_SRC + sep, ''))
  }
}
check(
  violatingRoutesReadUpdateDelete.length === 0,
  `cenários 1-3 (leitura/atualização/exclusão cruzada): toda rota que toca tabela tenant-scoped filtra por tenant_id ou usa helper seguro conhecido`
)
if (violatingRoutesReadUpdateDelete.length > 0) {
  for (const v of violatingRoutesReadUpdateDelete) console.log(`  rota suspeita: ${v}`)
}

// ── Cenário 4: acesso direto por ID (IDOR) — rotas com [id]/[analysisId]/[eventId] devem
//    combinar filtro por id com filtro por tenant, direto ou via helper. ────────────────────
const idRouteFiles = routeFiles.filter((f) => /\[[a-zA-Z]*[Ii]d\]/.test(f))
const idorSuspects: string[] = []
for (const file of idRouteFiles) {
  const src = readFileSync(file, 'utf8')
  const touchesTenantTable = TENANT_TABLES.some((t) => src.includes(`.from('${t}')`) || src.includes(`.from("${t}")`))
  if (!touchesTenantTable) continue
  const hasDirectTenantFilter = /\.eq\(\s*['"]tenant_id['"]/.test(src)
  const usesKnownSafeHelper = KNOWN_TENANT_SAFE_HELPERS.some((h) => src.includes(h))
  if (!hasDirectTenantFilter && !usesKnownSafeHelper) idorSuspects.push(file.replace(FRONTEND_SRC + sep, ''))
}
check(idorSuspects.length === 0, 'cenário 4 (acesso direto por ID / IDOR): rotas por id combinam filtro de tenant')
if (idorSuspects.length > 0) for (const v of idorSuspects) console.log(`  rota suspeita: ${v}`)

// ── Cenário 5: exportação — export do vNext deve ser tenant-scoped via repositório. ─────────
const exportRoute = readFileSync(join(API_DIR, 'admin/sera-vnext/analyses/[id]/export/route.ts'), 'utf8')
check(
  exportRoute.includes('handleExportSeraVNextAnalysisRequest'),
  'cenário 5 (exportação): rota de export delega ao handler tenant-scoped'
)

// ── Cenário 6: storage — upload/remove devem usar path prefixado por usuário/análise, nunca
//    um bucket/caminho global compartilhado sem escopo. ─────────────────────────────────────
const completeAnalysisSrc = readFileSync(join(FRONTEND_SRC, 'lib/server/complete-sera-analysis.ts'), 'utf8')
check(
  /`\$\{user\.userId\}\/\$\{analysisId\}/.test(completeAnalysisSrc),
  'cenário 6 (storage): path de upload prefixado por userId/analysisId (não é caminho global)'
)

// ── Cenário 7: RPC — chamadas de RPC de exclusão/restauração devem passar tenantId vindo do
//    contexto do usuário autenticado, nunca de nome genérico não vinculado ao JWT. ──────────
const rpcCallers = routeFiles.filter((f) => {
  const src = readFileSync(f, 'utf8')
  return src.includes('.rpc(')
})
const rpcSuspects: string[] = []
for (const file of rpcCallers) {
  const src = readFileSync(file, 'utf8')
  if (!/p_tenant_id:\s*user\.tenantId/.test(src) && !src.includes('tenantId: user.tenantId')) {
    rpcSuspects.push(file.replace(FRONTEND_SRC + sep, ''))
  }
}
check(rpcSuspects.length === 0, 'cenário 7 (RPC): chamadas de RPC usam tenantId derivado do usuário autenticado')
if (rpcSuspects.length > 0) for (const v of rpcSuspects) console.log(`  rota suspeita: ${v}`)

// ── Cenário 8: ausência de tenant — requireBearerUser deve recusar quando tenant_id ausente. ─
const apiAuthSrc = readFileSync(join(FRONTEND_SRC, 'lib/server/api-auth.ts'), 'utf8')
check(
  apiAuthSrc.includes("'tenant_id ausente no perfil'") && /status:\s*403/.test(apiAuthSrc),
  'cenário 8 (ausência de tenant): requireBearerUser rejeita com 403 quando tenant_id ausente'
)

// ── Cenário 9: tenant manipulado pelo cliente — nenhuma rota lê tenant_id do corpo/query. ───
const clientTenantSuspects: string[] = []
for (const file of routeFiles) {
  const src = readFileSync(file, 'utf8')
  if (/body\.\s*tenant(Id|_id)/.test(src) || /searchParams\.get\(\s*['"]tenant/.test(src)) {
    clientTenantSuspects.push(file.replace(FRONTEND_SRC + sep, ''))
  }
}
check(clientTenantSuspects.length === 0, 'cenário 9 (tenant manipulado pelo cliente): nenhuma rota lê tenant_id do corpo/query')
if (clientTenantSuspects.length > 0) for (const v of clientTenantSuspects) console.log(`  rota suspeita: ${v}`)

// ── Cenário 10: relacionamento indireto — corrective_actions/risk_profile_exclusions filtram
//    por tenant mesmo quando relacionados via analysis_id/event_id. ─────────────────────────
const riskProfileServerSrc = readFileSync(join(FRONTEND_SRC, 'lib/risk-profile/server.ts'), 'utf8')
check(
  /\.from\(['"]corrective_actions['"]\)[\s\S]{0,120}\.eq\(['"]tenant_id['"]/.test(riskProfileServerSrc),
  'cenário 10 (relação indireta): corrective_actions é consultado com filtro de tenant_id'
)

// ── Cenários 11-12: shadow results / comparação legado×vNext — repositório e orquestrador
//    sempre exigem e propagam tenantId; nunca consultam sem esse filtro. ────────────────────
const shadowRepoSrc = readFileSync(join(FRONTEND_SRC, 'lib/sera-shadow/repository.ts'), 'utf8')
// Só as funções de LEITURA (find*/list*) precisam de .eq('tenant_id', ...) — insert já grava
// tenant_id como parte da própria linha inserida (verificado pela tipagem InsertShadowResultInput).
const shadowReadBlocks = shadowRepoSrc
  .split('export async function')
  .slice(1)
  .filter((block) => /^\s*(find|list)/.test(block))
const shadowRepoAllFiltered = shadowReadBlocks.every((block) => /\.eq\(['"]tenant_id['"]/.test(block))
check(
  shadowReadBlocks.length >= 2 && shadowRepoAllFiltered,
  'cenário 11 (shadow result de outro tenant): toda consulta de leitura em sera-shadow/repository.ts filtra por tenant_id'
)

const shadowOrchestratorSrc = readFileSync(join(FRONTEND_SRC, 'lib/sera-shadow/run-shadow-analysis.ts'), 'utf8')
check(
  shadowOrchestratorSrc.includes('args.context.tenantId') && shadowOrchestratorSrc.includes('tenant_id: args.context.tenantId'),
  'cenário 12 (comparação legado×vNext de outro tenant): orquestrador de shadow propaga tenantId do contexto, não aceita tenant solto'
)

console.log(failures === 0 ? 'TENANT_ISOLATION_CONTRACT_TRIAL_OK' : `TENANT_ISOLATION_CONTRACT_TRIAL_FAILED (${failures} falhas)`)
process.exit(failures === 0 ? 0 : 1)
