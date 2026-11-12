-- Public Data API read only for an authorized active member of the owning tenant.
-- Service-role continues to manage server-side Storage + indexing.
-- RLS alone does not guard TRUNCATE: revoke every mutation/DDL-ish table grant.
REVOKE ALL PRIVILEGES ON TABLE public.event_documents FROM anon, authenticated;
GRANT SELECT ON TABLE public.event_documents TO authenticated;

ALTER TABLE public.event_documents ENABLE ROW LEVEL SECURITY;

-- Canonical auth binding: public.users.auth_user_id = auth.uid(), with an
-- active public.users row and active tenant checked by private.current_tenant_id().
-- The old direct public.users.id = auth.uid() can reject legitimate legacy users.
DROP POLICY IF EXISTS event_documents_tenant_select ON public.event_documents;
CREATE POLICY event_documents_tenant_select
  ON public.event_documents
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_tenant_id()));

COMMENT ON TABLE public.event_documents IS
  'Private per-event original sources. Browser authenticated role SELECT only with tenant RLS; writes and purges server-only service_role.';
