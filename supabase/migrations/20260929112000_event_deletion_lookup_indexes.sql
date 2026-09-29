-- Keep event-deletion impact checks fast and fail-closed as SERA revision history grows.
-- Current analyses link to the source event through source_reference; older rows may
-- only carry metadata.eventId, so both lookup paths need tenant-scoped indexes.

create index if not exists idx_sera_vnext_analyses_tenant_source_reference
  on public.sera_vnext_analyses (tenant_id, source_reference);

create index if not exists idx_sera_vnext_analyses_tenant_metadata_event_id
  on public.sera_vnext_analyses (tenant_id, (metadata ->> 'eventId'));
