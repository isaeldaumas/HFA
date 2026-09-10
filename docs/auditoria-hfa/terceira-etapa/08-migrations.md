# Migrations — Terceira Etapa

## Arquivo
`supabase/migrations/20260710010000_methodology_provenance_and_shadow_infra.sql`

## Natureza
100% aditiva: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`. Nenhuma coluna, tabela, índice ou constraint pré-existente foi
removida ou alterada de forma destrutiva. Nenhum `DROP`/`TRUNCATE` de dado de produção.

## O que a migration faz
1. Adiciona 12 colunas de proveniência a `analyses` (com 2 CHECK constraints de enum) e faz um
   único `UPDATE` de backfill **restrito a metadado novo**, nunca a colunas de classificação.
2. Adiciona 10 colunas de proveniência a `sera_vnext_analyses` (mesmos CHECK constraints) — sem
   backfill, porque a tabela é append-only (triggers pré-existentes bloqueiam `UPDATE`/`DELETE`).
3. Cria `sera_vnext_shadow_results` (nova, append-only por trigger análoga às demais tabelas
   vNext, RLS habilitada, FKs para `analyses`/`events` com `ON DELETE SET NULL`).
4. Cria `sera_taxonomy_entries` (nova, vazia, sem RLS — tabela de referência global, não
   multi-tenant).

## Validação realizada (sem tocar em nenhum banco real do projeto)

Como não há Supabase real/local autorizado disponível, a migration foi validada com uma
**instância Postgres 16 local e completamente descartável** (`initdb`/`pg_ctl`, socket em
`/tmp`, banco `hfa_audit_scratch`), criada, usada e destruída inteiramente dentro desta sessão —
nenhum dado ou serviço do projeto foi tocado.

Passos executados:
1. Stub mínimo dos schemas `auth`/`storage` e roles `authenticated`/`anon`/`service_role` (o
   Postgres puro não tem esses artefatos específicos da plataforma Supabase).
2. **Todas as 22 migrations reais do projeto**, na ordem real, aplicadas nesse banco descartável
   — reproduzindo o histórico de schema exatamente como ele existe hoje (`analyses` chegou com
   todas as colunas de todas as migrations anteriores; `sera_vnext_analyses` idem, incluindo
   `canonical_tree_version`).
3. A nova migration aplicada **uma única vez**, com `ON_ERROR_STOP=1` — passou sem nenhum erro
   após uma correção (ver "Bug encontrado e corrigido" abaixo).
4. Suíte funcional (`migration-functional-tests.sql`) validando 8 comportamentos:

   | Teste | Resultado esperado | Resultado obtido |
   |---|---|---|
   | `generated_by_type` inválido | rejeitado pelo CHECK | ✅ rejeitado |
   | `generated_by_type` válido | aceito | ✅ aceito |
   | Insert em `sera_vnext_shadow_results` | aceito | ✅ aceito |
   | `UPDATE` em `sera_vnext_shadow_results` | bloqueado (append-only) | ✅ bloqueado |
   | `DELETE` em `sera_vnext_shadow_results` | bloqueado (append-only) | ✅ bloqueado |
   | `validation_status='validated'` sem `validated_at` | rejeitado (constraint `never_released`) | ✅ rejeitado |
   | `validation_status='validated'` com `validated_at` | aceito | ✅ aceito |
   | `sera_taxonomy_entries` permanece vazia | 0 linhas | ✅ 0 linhas |
   | `shadow_run_id` vazio/espaços | rejeitado (constraint `nonempty`) | ✅ rejeitado |
5. Confirmado `relrowsecurity = true` em `sera_vnext_shadow_results`.
6. Banco e instância Postgres descartáveis destruídos ao final (`dropdb`, `pg_ctl stop`, `rm -rf`).

## Bug encontrado e corrigido durante a validação

A primeira versão da migration usava concatenação `||` dentro de `COMMENT ON TABLE ... IS '...'
|| '...'` — **sintaxe inválida em PostgreSQL** (`COMMENT ON` exige um literal, não uma
expressão). Corrigido para concatenação implícita de literais adjacentes (padrão SQL). Sem essa
validação real contra um Postgres de verdade, esse erro só apareceria ao tentar aplicar a
migration em staging/produção.

## Compatibilidade com código já escrito
`complete-sera-analysis.ts` já tinha um padrão de retry-sem-coluna para
`analysis_completeness`/`completeness_reason`/`motor_version` (ambientes onde uma migration
anterior ainda não rodou); esse padrão foi **estendido** para cobrir as novas colunas de
proveniência, em vez de duplicado.

## Rollback documentado
Como é 100% aditiva, o rollback seguro é: remover as colunas/tabelas adicionadas (todas
`DROP COLUMN IF EXISTS` / `DROP TABLE IF EXISTS`) sem qualquer impacto nas colunas/tabelas
pré-existentes. Não incluímos um arquivo de rollback separado nesta etapa (não solicitado
explicitamente como entregável de arquivo), mas o procedimento está documentado aqui:

```sql
-- Rollback (não executado; apenas documentado)
drop table if exists public.sera_taxonomy_entries;
drop trigger if exists trg_prevent_sera_vnext_shadow_results_delete on public.sera_vnext_shadow_results;
drop trigger if exists trg_prevent_sera_vnext_shadow_results_update on public.sera_vnext_shadow_results;
drop function if exists public.prevent_sera_vnext_shadow_results_delete();
drop function if exists public.prevent_sera_vnext_shadow_results_update();
drop table if exists public.sera_vnext_shadow_results;
alter table public.sera_vnext_analyses
  drop column if exists engine_id, drop column if exists taxonomy_version,
  drop column if exists risk_method_id, drop column if exists risk_method_version,
  drop column if exists generated_by_type, drop column if exists generated_by_id,
  drop column if exists validation_status, drop column if exists validated_at,
  drop column if exists validated_by, drop column if exists source_analysis_version;
alter table public.analyses
  drop column if exists engine_id, drop column if exists methodology_version,
  drop column if exists taxonomy_version, drop column if exists risk_method_id,
  drop column if exists risk_method_version, drop column if exists generated_at,
  drop column if exists generated_by_type, drop column if exists generated_by_id,
  drop column if exists validation_status, drop column if exists validated_at,
  drop column if exists validated_by, drop column if exists source_analysis_version;
```

## Riscos residuais desta migration
- **Idempotência de shadow_run_id**: não há constraint `UNIQUE(tenant_id, shadow_run_id)` no
  banco; a idempotência é garantida apenas em nível de aplicação
  (`findExistingShadowResult` antes de inserir). Aceitável enquanto as flags de shadow mode
  estiverem desligadas (nenhuma escrita real ocorre); deve ser endurecido antes da ativação real.
- **Migration não aplicada a nenhum ambiente real** (dev/staging/produção) nesta etapa — apenas
  validada localmente. Aplicar requer autorização explícita separada (fora do escopo aqui).
