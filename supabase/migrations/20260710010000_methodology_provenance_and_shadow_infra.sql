-- ─────────────────────────────────────────────────────────────────────────
-- Auditoria HFA — Terceira Etapa (2026-07-10)
-- Infraestrutura de proveniência metodológica, shadow mode e taxonomia versionada.
--
-- Escopo desta migration:
--   1. Colunas de proveniência aditivas em `analyses` (legado) e `sera_vnext_analyses`.
--   2. Tabela `sera_vnext_shadow_results` (execução paralela vNext, desligada por padrão).
--   3. Tabela `sera_taxonomy_entries` (estrutura para taxonomia versionada — VAZIA;
--      não migra os códigos atuais, conforme decisão D4 pendente).
--
-- Regras seguidas (docs/auditoria-hfa/terceira-etapa/08-migrations.md):
--   - 100% aditiva. Nenhuma coluna, tabela ou constraint existente é removida ou alterada
--     de forma destrutiva.
--   - Nenhum registro histórico de classificação (perception_code/objective_code/action_code/
--     erc_level/engine_output) é reescrito ou reinterpretado.
--   - Onde a origem real de um dado histórico não pode ser comprovada, o backfill usa
--     'unknown_legacy' — nunca um valor específico inventado.
--   - `sera_vnext_analyses` é append-only (triggers de proteção já existentes) — as novas
--     colunas ficam NULL para linhas históricas, o que é o valor correto e honesto.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Proveniência em `analyses` (motor legado) ──────────────────────────

alter table public.analyses
  add column if not exists engine_id text null,
  add column if not exists methodology_version text null,
  add column if not exists taxonomy_version text null,
  add column if not exists risk_method_id text null,
  add column if not exists risk_method_version text null,
  add column if not exists generated_at timestamptz null,
  add column if not exists generated_by_type text null,
  add column if not exists generated_by_id text null,
  add column if not exists validation_status text null,
  add column if not exists validated_at timestamptz null,
  add column if not exists validated_by text null,
  add column if not exists source_analysis_version text null;

comment on column public.analyses.engine_id is
  'Identificador estável do motor que gerou a análise (ex.: SERA_LEGACY_ENGINE). Distinto de motor_version (que já existe e registra a versão pontual).';
comment on column public.analyses.methodology_version is
  'Versão da metodologia SERA aplicada. NULL para registros anteriores a esta coluna (não inventar valor retroativo).';
comment on column public.analyses.taxonomy_version is
  'Versão da taxonomia de códigos P/O/A em uso. Ver sera_taxonomy_entries (estrutura preparada, não populada nesta migration).';
comment on column public.analyses.risk_method_id is
  'Identificador do mecanismo ERC que gerou o valor de erc_level (ex.: MOTOR_HEURISTIC_V1). Ver frontend/src/lib/risk-profile/erc-containment.ts.';
comment on column public.analyses.risk_method_version is
  'Versão do mecanismo ERC identificado em risk_method_id.';
comment on column public.analyses.generated_at is
  'Momento em que este resultado foi efetivamente gerado (pode diferir de created_at em reprocessamentos).';
comment on column public.analyses.generated_by_type is
  'Origem do resultado: deterministic_engine | llm_suggestion | human_analyst | imported_legacy | migration | unknown_legacy.';
comment on column public.analyses.generated_by_id is
  'Identificador do gerador (id do usuário humano, versão do modelo de IA, etc.), quando aplicável.';
comment on column public.analyses.validation_status is
  'Status de validação humana do resultado: not_validated | pending_review | validated | rejected. NUNCA presumir "validated" por ausência de dado.';
comment on column public.analyses.validated_at is
  'Momento da validação humana, quando houver.';
comment on column public.analyses.validated_by is
  'Identificador do revisor humano que validou o resultado, quando houver.';
comment on column public.analyses.source_analysis_version is
  'Referência de linhagem quando esta análise deriva de outra (reanálise, migração). NULL quando não aplicável.';

alter table public.analyses
  add constraint analyses_generated_by_type_values check (
    generated_by_type is null or generated_by_type in (
      'deterministic_engine',
      'llm_suggestion',
      'human_analyst',
      'imported_legacy',
      'migration',
      'unknown_legacy'
    )
  );

alter table public.analyses
  add constraint analyses_validation_status_values check (
    validation_status is null or validation_status in (
      'not_validated',
      'pending_review',
      'validated',
      'rejected'
    )
  );

-- Backfill de metadados (NÃO reescreve classificação): registros legados que já possuem
-- uma classificação persistida recebem proveniência honesta 'unknown_legacy' porque não há
-- como comprovar, retroativamente, se o código veio do LLM ou da heurística determinística
-- (ambos escrevem no mesmo campo hoje — ver docs/auditoria-hfa/03-achados.md F-13).
update public.analyses
set
  generated_by_type = 'unknown_legacy',
  generated_at = created_at,
  validation_status = 'not_validated',
  engine_id = 'SERA_LEGACY_ENGINE',
  risk_method_id = case when erc_level is not null then 'MOTOR_HEURISTIC_V1' else null end,
  risk_method_version = case when erc_level is not null then 'v0.1' else null end,
  source_analysis_version = 'LEGACY_PRE_PROVENANCE'
where generated_by_type is null
  and perception_code is not null;

-- ── 2. Proveniência em `sera_vnext_analyses` (append-only; sem backfill) ──

alter table public.sera_vnext_analyses
  add column if not exists engine_id text null,
  add column if not exists taxonomy_version text null,
  add column if not exists risk_method_id text null,
  add column if not exists risk_method_version text null,
  add column if not exists generated_by_type text null,
  add column if not exists generated_by_id text null,
  add column if not exists validation_status text null,
  add column if not exists validated_at timestamptz null,
  add column if not exists validated_by text null,
  add column if not exists source_analysis_version text null;

comment on column public.sera_vnext_analyses.engine_id is
  'Identificador estável do motor (ex.: SERA_VNEXT_ENGINE). Distinto de engine_version (já existente, travado por constraint).';
comment on column public.sera_vnext_analyses.taxonomy_version is
  'Versão da taxonomia canônica em uso (ex.: SERA_PT_CANONICAL_v1.0).';
comment on column public.sera_vnext_analyses.risk_method_id is
  'NULL / NONE_RISK_LOCKED — o vNext não calcula risco (lock metodológico ativo, ver canonical method question lock).';
comment on column public.sera_vnext_analyses.generated_by_type is
  'Origem do resultado: deterministic_engine | llm_suggestion | human_analyst | imported_legacy | migration | unknown_legacy.';
comment on column public.sera_vnext_analyses.validation_status is
  'Status de validação humana: not_validated | pending_review | validated | rejected.';
comment on column public.sera_vnext_analyses.source_analysis_version is
  'Referência de linhagem (ex.: id de análise legada de origem, quando esta análise vNext é uma reanálise em shadow mode do mesmo evento).';

alter table public.sera_vnext_analyses
  add constraint sera_vnext_analyses_generated_by_type_values check (
    generated_by_type is null or generated_by_type in (
      'deterministic_engine',
      'llm_suggestion',
      'human_analyst',
      'imported_legacy',
      'migration',
      'unknown_legacy'
    )
  );

alter table public.sera_vnext_analyses
  add constraint sera_vnext_analyses_validation_status_values check (
    validation_status is null or validation_status in (
      'not_validated',
      'pending_review',
      'validated',
      'rejected'
    )
  );

-- Nenhum backfill aqui: a tabela é append-only (triggers prevent_sera_vnext_append_only_update/
-- delete já bloqueiam UPDATE). Linhas históricas ficam com estas colunas NULL — é o valor
-- correto (proveniência não rastreada no momento da criação), não um valor inventado.

-- ── 3. Shadow mode: resultados candidatos vNext isolados, nunca substituem produção ──

create table if not exists public.sera_vnext_shadow_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legacy_analysis_id uuid null references public.analyses(id) on delete set null,
  legacy_event_id uuid null references public.events(id) on delete set null,

  created_at timestamptz not null default now(),

  shadow_run_id text not null,
  legacy_engine_version text null,
  vnext_engine_version text not null,
  vnext_methodology_version text not null,

  vnext_engine_output jsonb not null,
  divergence_summary jsonb not null default '{}'::jsonb,
  human_review_required boolean not null default true,

  generated_by_type text not null default 'deterministic_engine',
  validation_status text not null default 'not_validated',
  validated_at timestamptz null,
  validated_by text null,

  constraint sera_vnext_shadow_results_shadow_run_nonempty check (length(btrim(shadow_run_id)) > 0),
  constraint sera_vnext_shadow_results_generated_by_type_values check (
    generated_by_type in (
      'deterministic_engine',
      'llm_suggestion',
      'human_analyst',
      'imported_legacy',
      'migration',
      'unknown_legacy'
    )
  ),
  constraint sera_vnext_shadow_results_validation_status_values check (
    validation_status in ('not_validated', 'pending_review', 'validated', 'rejected')
  ),
  -- Lock estrutural: resultado de shadow nunca é uma decisão liberada sem validated_at.
  constraint sera_vnext_shadow_results_never_released check (
    validation_status != 'validated' or validated_at is not null
  )
);

comment on table public.sera_vnext_shadow_results is
  'Resultados candidatos do motor vNext rodado em shadow mode ao lado do motor legado. '
  'NUNCA substitui analyses (produção). Consulta restrita a perfis autorizados (ver '
  'docs/auditoria-hfa/terceira-etapa/05-arquitetura-shadow-mode.md). Isolamento por tenant_id '
  '— mesma ressalva de defesa em profundidade da RLS registrada em F-01 (docs/auditoria-hfa/'
  'segunda-etapa/02-isolamento-tenants.md): enforcement real é a camada de aplicação.';

create index if not exists idx_sera_vnext_shadow_results_tenant
  on public.sera_vnext_shadow_results(tenant_id, created_at desc);
create index if not exists idx_sera_vnext_shadow_results_legacy_analysis
  on public.sera_vnext_shadow_results(legacy_analysis_id)
  where legacy_analysis_id is not null;

alter table public.sera_vnext_shadow_results enable row level security;

create policy "sera_vnext_shadow_results_select"
  on public.sera_vnext_shadow_results for select
  using (tenant_id = public.get_tenant_id());

create policy "sera_vnext_shadow_results_insert"
  on public.sera_vnext_shadow_results for insert
  with check (tenant_id = public.get_tenant_id());

-- Append-only: shadow results não podem ser alterados ou apagados por engano.
create or replace function public.prevent_sera_vnext_shadow_results_update()
returns trigger language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
begin
  raise exception 'sera_vnext_shadow_results_is_append_only_cannot_be_updated';
end;
$$;

create or replace function public.prevent_sera_vnext_shadow_results_delete()
returns trigger language plpgsql security definer set search_path = public, pg_catalog, pg_temp as $$
begin
  raise exception 'sera_vnext_shadow_results_is_append_only_cannot_be_deleted';
end;
$$;

drop trigger if exists trg_prevent_sera_vnext_shadow_results_update on public.sera_vnext_shadow_results;
create trigger trg_prevent_sera_vnext_shadow_results_update
  before update on public.sera_vnext_shadow_results
  for each row execute function public.prevent_sera_vnext_shadow_results_update();

drop trigger if exists trg_prevent_sera_vnext_shadow_results_delete on public.sera_vnext_shadow_results;
create trigger trg_prevent_sera_vnext_shadow_results_delete
  before delete on public.sera_vnext_shadow_results
  for each row execute function public.prevent_sera_vnext_shadow_results_delete();

-- ── 4. Taxonomia versionada — estrutura apenas, SEM migrar os códigos atuais ──

create table if not exists public.sera_taxonomy_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  canonical_code text not null,
  canonical_name text not null,
  translated_name text null,
  description text null,
  axis text not null,
  parent_code text null,

  source_reference text not null,
  methodology_version text not null,
  taxonomy_version text not null,

  valid_from timestamptz not null default now(),
  valid_until timestamptz null,
  status text not null default 'DRAFT_NOT_MIGRATED',

  divergence_notes text null,

  constraint sera_taxonomy_entries_axis_values check (axis in ('P', 'O', 'A')),
  constraint sera_taxonomy_entries_status_values check (
    status in ('DRAFT_NOT_MIGRATED', 'ACTIVE', 'SUPERSEDED', 'RETIRED')
  ),
  constraint sera_taxonomy_entries_unique_code_version unique (canonical_code, taxonomy_version)
);

comment on table public.sera_taxonomy_entries is
  'Estrutura para taxonomia versionada (decisão D4 pendente — docs/auditoria-hfa/segunda-etapa/'
  '09-decisao-d4-taxonomia.md). Tabela intencionalmente VAZIA nesta migration: os códigos atuais '
  '(failure-names.ts, hfacs-mapper.ts, canonical-codes.ts) não são migrados automaticamente até '
  'revisão formal das divergências entre Hendy, Daumas, legado e vNext.';

create index if not exists idx_sera_taxonomy_entries_code_version
  on public.sera_taxonomy_entries(canonical_code, taxonomy_version);

-- Sem RLS específica: tabela de referência global, não multi-tenant (mesmo padrão de tabelas
-- de configuração). Leitura via service_role apenas nesta fase (sem endpoint público ainda).
