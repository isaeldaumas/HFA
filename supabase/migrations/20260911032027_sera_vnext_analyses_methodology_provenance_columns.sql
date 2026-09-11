-- Applied on staging vbdpweliprcsktyxodss as version 20260911032027.
-- Additive provenance columns for sera_vnext_analyses (from methodology provenance infra).
-- Staging vbdpweliprcsktyxodss was missing these; product-beta create inserts engine_id etc.
-- Idempotent. No rewrite of historical classification values.

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

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sera_vnext_analyses_generated_by_type_values'
  ) then
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
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sera_vnext_analyses_validation_status_values'
  ) then
    alter table public.sera_vnext_analyses
      add constraint sera_vnext_analyses_validation_status_values check (
        validation_status is null or validation_status in (
          'not_validated',
          'pending_review',
          'validated',
          'rejected'
        )
      );
  end if;
end $$;

comment on column public.sera_vnext_analyses.engine_id is
  'Identificador estável do motor (ex.: SERA_VNEXT_ENGINE). Distinto de engine_version.';
comment on column public.sera_vnext_analyses.taxonomy_version is
  'Versão da taxonomia canônica em uso (ex.: SERA_PT_V1 / SERA_PT_CANONICAL_v1.0).';
comment on column public.sera_vnext_analyses.risk_method_id is
  'NULL / NONE_RISK_LOCKED — o vNext não calcula risco (lock metodológico ativo).';
comment on column public.sera_vnext_analyses.generated_by_type is
  'Origem do resultado: deterministic_engine | llm_suggestion | human_analyst | imported_legacy | migration | unknown_legacy.';
comment on column public.sera_vnext_analyses.validation_status is
  'Status de validação humana: not_validated | pending_review | validated | rejected.';
