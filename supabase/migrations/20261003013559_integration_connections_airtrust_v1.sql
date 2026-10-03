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
  constraint integration_connections_provider_check check (provider in ('AIRTRUST')),
  constraint integration_connections_external_ref_nonempty check (length(btrim(external_tenant_ref)) > 0),
  constraint integration_connections_name_nonempty check (length(btrim(name)) > 0),
  constraint integration_connections_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  unique (tenant_id, provider, external_tenant_ref)
);
create index if not exists idx_integration_connections_tenant_provider
  on public.integration_connections (tenant_id, provider, is_active);
create index if not exists idx_integration_connections_created_by
  on public.integration_connections (created_by)
  where created_by is not null;

alter table public.integration_connections enable row level security;

revoke all on table public.integration_connections from anon, authenticated;

drop policy if exists integration_connections_deny_direct_authenticated on public.integration_connections;
create policy integration_connections_deny_direct_authenticated
on public.integration_connections
for all
to authenticated
using (false)
with check (false);

comment on table public.integration_connections is
  'Server-only tenant-scoped integration credentials. Raw tokens are never persisted.';
comment on column public.integration_connections.token_hash is
  'SHA-256 hash of the integration bearer token; the plaintext token is returned only at issuance.';
