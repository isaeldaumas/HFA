-- DB-authoritative tenant authorization hardening
-- Status: versions the validated HFA staging state (project ref vbdpweliprcsktyxodss).
-- Does NOT use user_metadata / app_metadata for tenant or role authorization.
-- Idempotent where practical. No PII, UUIDs, emails, or secrets.
-- Historical migrations are intentionally left unchanged.

-- =============================================================================
-- 1. Schema private (privileged resolvers live here — not in public)
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS private;

-- =============================================================================
-- 2. auth_user_id binding column + unique partial index
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.auth_user_id IS
  'Authoritative binding to auth.users.id. DIRECT_AUTH_ID when equal to public.users.id.';

-- Safe backfill only for rows where public.users.id already equals an auth.users.id.
UPDATE public.users pu
SET auth_user_id = pu.id
WHERE pu.auth_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = pu.id
  );

-- =============================================================================
-- 3. Trigger helper: bind auth_user_id on INSERT when ids already match
-- =============================================================================
CREATE OR REPLACE FUNCTION private.bind_direct_auth_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.auth_user_id IS NULL
     AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = NEW.id) THEN
    NEW.auth_user_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_bind_direct_auth_user_id ON public.users;
CREATE TRIGGER trg_users_bind_direct_auth_user_id
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION private.bind_direct_auth_user_id();

-- Trigger helper must not be generally executable
REVOKE ALL ON FUNCTION private.bind_direct_auth_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.bind_direct_auth_user_id() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bind_direct_auth_user_id() TO postgres;

-- =============================================================================
-- 4. Private DB-authoritative resolvers
-- =============================================================================
CREATE OR REPLACE FUNCTION private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.tenant_id
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.is_active = true
    AND t.is_active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role::text
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.is_active = true
    AND t.is_active = true
  LIMIT 1
$$;

-- Resolvers are callable by authenticated sessions (via wrappers / RLS), never privileged beyond that.
REVOKE ALL ON FUNCTION private.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.current_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_tenant_id() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION private.current_user_role() TO anon, authenticated, service_role, postgres;

-- =============================================================================
-- 5. Public wrappers — SECURITY INVOKER only (no privileged logic in public)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.current_tenant_id()
$$;

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT private.current_tenant_id()
$$;

REVOKE ALL ON FUNCTION public.get_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_id() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO anon, authenticated, service_role, postgres;

-- =============================================================================
-- 6. analysis_edits RLS — replace user_metadata-based tenant isolation
-- =============================================================================
ALTER TABLE public.analysis_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON public.analysis_edits;

CREATE POLICY "tenant_isolation" ON public.analysis_edits
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

-- =============================================================================
-- 7. analyses_backup_pt_en — closed by default (RLS on, no client policies)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'analyses_backup_pt_en'
  ) THEN
    EXECUTE 'ALTER TABLE public.analyses_backup_pt_en ENABLE ROW LEVEL SECURITY';
    -- Intentionally no client policies: default-deny for anon/authenticated.
    EXECUTE 'REVOKE ALL ON TABLE public.analyses_backup_pt_en FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.analyses_backup_pt_en FROM anon, authenticated';
    EXECUTE 'GRANT ALL ON TABLE public.analyses_backup_pt_en TO postgres, service_role';
  END IF;
END $$;

-- =============================================================================
-- 8. Legacy deletion RPCs — service_role/postgres only
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_soft_delete_event'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_soft_delete_event(uuid, uuid, uuid, text, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_soft_delete_event(uuid, uuid, uuid, text, text) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_soft_delete_event(uuid, uuid, uuid, text, text) TO postgres, service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_restore_soft_deleted_event'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_restore_soft_deleted_event(uuid, uuid, uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rpc_restore_soft_deleted_event(uuid, uuid, uuid, text) FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rpc_restore_soft_deleted_event(uuid, uuid, uuid, text) TO postgres, service_role';
  END IF;
END $$;
