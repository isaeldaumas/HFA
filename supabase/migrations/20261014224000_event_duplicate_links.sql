-- CAL-19: deduplication is a human decision. Keep every original event,
-- its attachments, analyses and audit history. Do not rewrite or delete events.
create table if not exists public.event_duplicate_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  canonical_event_id uuid not null references public.events(id) on delete cascade,
  duplicate_event_id uuid not null unique references public.events(id) on delete cascade,
  decided_by uuid not null references public.users(id),
  reason text not null check (length(trim(reason)) >= 10),
  created_at timestamptz not null default now(),
  constraint event_duplicate_not_self check (canonical_event_id <> duplicate_event_id)
);
create index if not exists idx_event_duplicate_links_tenant_canonical on public.event_duplicate_links(tenant_id, canonical_event_id);

create or replace function public.check_event_duplicate_link_integrity()
returns trigger language plpgsql set search_path = public as $$
declare
  canonical_tenant uuid;
  duplicate_tenant uuid;
  canonical_time timestamptz;
  duplicate_time timestamptz;
  reviewer_tenant uuid;
begin
  select tenant_id, created_at into canonical_tenant, canonical_time from public.events
    where id = new.canonical_event_id and deleted_at is null;
  select tenant_id, created_at into duplicate_tenant, duplicate_time from public.events
    where id = new.duplicate_event_id and deleted_at is null;
  select tenant_id into reviewer_tenant from public.users where id = new.decided_by and is_active = true;
  if canonical_tenant is null or duplicate_tenant is null or canonical_tenant <> new.tenant_id
    or duplicate_tenant <> new.tenant_id or reviewer_tenant <> new.tenant_id then
    raise exception 'EVENT_DUPLICATE_TENANT_MISMATCH';
  end if;
  if canonical_time > duplicate_time then
    raise exception 'EVENT_DUPLICATE_CANONICAL_MUST_BE_EARLIER';
  end if;
  if exists(select 1 from public.event_duplicate_links where duplicate_event_id = new.canonical_event_id) then
    raise exception 'EVENT_DUPLICATE_CANONICAL_IS_DUPLICATE';
  end if;
  if exists(select 1 from public.event_duplicate_links where canonical_event_id = new.duplicate_event_id) then
    raise exception 'EVENT_DUPLICATE_ALREADY_CANONICAL';
  end if;
  return new;
end;
$$;
create trigger check_event_duplicate_link_integrity
  before insert on public.event_duplicate_links
  for each row execute function public.check_event_duplicate_link_integrity();
-- Decisions are append-only: do not silently reassign duplicate links.
create or replace function public.reject_event_duplicate_link_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'EVENT_DUPLICATE_LINK_IMMUTABLE';
end;
$$;
create trigger reject_event_duplicate_link_update before update on public.event_duplicate_links
  for each row execute function public.reject_event_duplicate_link_mutation();
create trigger reject_event_duplicate_link_delete before delete on public.event_duplicate_links
  for each row execute function public.reject_event_duplicate_link_mutation();
alter table public.event_duplicate_links enable row level security;
revoke all on public.event_duplicate_links from anon, authenticated;
comment on table public.event_duplicate_links is 'Human-confirmed duplicate of an earlier tenant-owned event; originals remain auditable, counted only via canonical occurrence';
