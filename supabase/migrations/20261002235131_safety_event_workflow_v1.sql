alter table public.events
  add column if not exists event_kind text not null default 'HFA_ANALYSIS',
  add column if not exists triage_status text not null default 'UNTRIAGED',
  add column if not exists investigation_path text not null default 'HFA',
  add column if not exists source_system text not null default 'HFA',
  add column if not exists external_reference text,
  add column if not exists confidentiality_level text not null default 'STANDARD',
  add column if not exists reported_at timestamptz not null default now(),
  add column if not exists triaged_at timestamptz,
  add column if not exists triaged_by uuid references public.users(id) on delete set null;

alter table public.events drop constraint if exists events_event_kind_check;
alter table public.events add constraint events_event_kind_check
  check (event_kind in ('SAFETY_REPORT', 'HFA_ANALYSIS'));

alter table public.events drop constraint if exists events_triage_status_check;
alter table public.events add constraint events_triage_status_check
  check (triage_status in ('UNTRIAGED', 'MONITOR_ONLY', 'GENERAL_INVESTIGATION', 'HFA_SELECTED', 'CLOSED'));

alter table public.events drop constraint if exists events_investigation_path_check;
alter table public.events add constraint events_investigation_path_check
  check (investigation_path in ('NONE', 'GENERAL', 'HFA', 'BOTH'));
alter table public.events drop constraint if exists events_confidentiality_level_check;
alter table public.events add constraint events_confidentiality_level_check
  check (confidentiality_level in ('STANDARD', 'CONFIDENTIAL'));

update public.events e
set event_kind = 'HFA_ANALYSIS',
    triage_status = 'HFA_SELECTED',
    investigation_path = 'HFA',
    triaged_at = coalesce(e.updated_at, e.created_at)
where e.credits_used > 0
   or exists (select 1 from public.analyses a where a.event_id = e.id)
   or exists (select 1 from public.sera_vnext_analyses s where s.source_reference = e.id::text and s.deleted_at is null);

create index if not exists idx_events_tenant_triage_created
  on public.events (tenant_id, triage_status, created_at desc)
  where deleted_at is null;

create index if not exists idx_events_tenant_kind_created
  on public.events (tenant_id, event_kind, created_at desc)
  where deleted_at is null;

create unique index if not exists idx_events_source_external_reference_unique
  on public.events (tenant_id, source_system, external_reference)
  where external_reference is not null and deleted_at is null;
create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_documents_tenant_event
  on public.event_documents (tenant_id, event_id, created_at desc);

alter table public.event_documents enable row level security;

drop policy if exists event_documents_tenant_select on public.event_documents;
create policy event_documents_tenant_select on public.event_documents
for select to authenticated using (
  exists (select 1 from public.users u where u.id = (select auth.uid()) and u.tenant_id = event_documents.tenant_id and u.is_active = true)
);
