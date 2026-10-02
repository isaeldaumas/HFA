alter table public.tenants
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists trial_case_limit integer;

alter table public.tenants
  drop constraint if exists tenants_trial_case_limit_positive;

alter table public.tenants
  add constraint tenants_trial_case_limit_positive
  check (trial_case_limit is null or trial_case_limit > 0);

comment on column public.tenants.trial_started_at is
  'Start of guided commercial pilot. Null preserves legacy/grandfathered tenants.';
comment on column public.tenants.trial_expires_at is
  'End of guided commercial pilot. Null means no time gate is enforced.';
comment on column public.tenants.trial_case_limit is
  'Maximum complete HFA cases included in the guided pilot.';
