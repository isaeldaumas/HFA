-- Allow corrective actions to reference either a historical legacy analysis or
-- the current SERA 0.3 analysis. Exactly one source analysis must be present.
alter table public.corrective_actions
  alter column analysis_id drop not null;

alter table public.corrective_actions
  add column if not exists sera_vnext_analysis_id uuid
    references public.sera_vnext_analyses(id) on delete cascade;

create index if not exists idx_corrective_actions_sera_vnext_analysis_id
  on public.corrective_actions(sera_vnext_analysis_id);

alter table public.corrective_actions
  drop constraint if exists corrective_actions_exactly_one_analysis_source;

alter table public.corrective_actions
  add constraint corrective_actions_exactly_one_analysis_source
  check (num_nonnulls(analysis_id, sera_vnext_analysis_id) = 1);
