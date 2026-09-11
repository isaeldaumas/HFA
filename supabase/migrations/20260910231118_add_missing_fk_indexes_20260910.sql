-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
create index if not exists idx_event_deletion_events_actor_id on public.event_deletion_events (actor_id);
create index if not exists idx_event_deletion_tombstones_requested_by on public.event_deletion_tombstones (requested_by);
create index if not exists idx_events_deleted_by on public.events (deleted_by);
create index if not exists idx_sera_vnext_analyses_created_by_fk on public.sera_vnext_analyses (created_by);
create index if not exists idx_sera_vnext_analysis_events_actor_id on public.sera_vnext_analysis_events (actor_id);
create index if not exists idx_sera_vnext_analysis_events_analysis_id_fk on public.sera_vnext_analysis_events (analysis_id);
create index if not exists idx_sera_vnext_analysis_reviews_analysis_id_fk on public.sera_vnext_analysis_reviews (analysis_id);
create index if not exists idx_sera_vnext_analysis_reviews_reviewer_id on public.sera_vnext_analysis_reviews (reviewer_id);
create index if not exists idx_sera_vnext_analysis_revisions_created_by on public.sera_vnext_analysis_revisions (created_by);
