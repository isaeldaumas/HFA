create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  external_tenant_ref text not null,
  name text not null,
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array['events:write', 'events:read']::text[],
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, provider, external_tenant_ref)
);

alter table public.integration_connections
  add column if not exists revoked_at timestamptz;

create index if not exists idx_integration_connections_active_token
  on public.integration_connections (provider, token_hash)
  where is_active = true and revoked_at is null;
create index if not exists idx_integration_connections_created_by
  on public.integration_connections (created_by) where created_by is not null;

alter table public.integration_connections enable row level security;
drop policy if exists integration_connections_tenant_select on public.integration_connections;
create policy integration_connections_tenant_select on public.integration_connections
for select to authenticated using (
  exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.tenant_id = integration_connections.tenant_id
      and u.is_active = true
  )
);
