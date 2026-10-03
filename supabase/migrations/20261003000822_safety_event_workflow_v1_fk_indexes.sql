create index if not exists idx_event_documents_event_id
  on public.event_documents (event_id);

create index if not exists idx_event_documents_uploaded_by
  on public.event_documents (uploaded_by)
  where uploaded_by is not null;

create index if not exists idx_events_triaged_by
  on public.events (triaged_by)
  where triaged_by is not null;
