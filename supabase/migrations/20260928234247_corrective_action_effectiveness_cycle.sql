-- Close the corrective-action lifecycle with explicit effectiveness verification.
-- Additive only: existing actions remain valid and default to NOT_ASSESSED.

alter table public.corrective_actions
  add column if not exists effectiveness_status text not null default 'NOT_ASSESSED',
  add column if not exists effectiveness_notes text,
  add column if not exists effectiveness_review_due_date date,
  add column if not exists effectiveness_reviewed_at timestamptz;

alter table public.corrective_actions
  drop constraint if exists corrective_actions_effectiveness_status_check;

alter table public.corrective_actions
  add constraint corrective_actions_effectiveness_status_check
  check (effectiveness_status in (
    'NOT_ASSESSED',
    'PENDING_VERIFICATION',
    'EFFECTIVE',
    'PARTIALLY_EFFECTIVE',
    'INEFFECTIVE'
  ));

create index if not exists idx_corrective_actions_effectiveness_status
  on public.corrective_actions(tenant_id, effectiveness_status);
