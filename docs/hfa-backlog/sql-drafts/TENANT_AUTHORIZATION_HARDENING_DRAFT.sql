-- TENANT AUTHORIZATION HARDENING DRAFT
-- Status: HISTORICAL DRAFT — superseded by
--   supabase/migrations/20260910193000_db_authoritative_tenant_authorization.sql
-- Do NOT apply this draft. Do NOT convert it directly into a migration.
-- The validated model uses private.current_tenant_id() / private.current_user_role()
-- with SECURITY DEFINER + search_path='', and public wrappers as SECURITY INVOKER.
-- Prerequisites: see docs/hfa-backlog/TENANT_AUTH_IDENTITY_MAPPING_PLAN.md


-- =============================================================================
-- 1. Add auth_user_id column
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Optional FK — verify auth.users is referenceable first:
-- ALTER TABLE public.users
--   ADD CONSTRAINT fk_users_auth_user_id
--   FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. Safe backfill for rows where public.users.id = auth.users.id
-- =============================================================================
UPDATE public.users pu
SET auth_user_id = pu.id
WHERE pu.auth_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = pu.id
  );

-- =============================================================================
-- 3. Secure tenant resolver function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_current_tenant_id_secure()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- =============================================================================
-- 4. Replace insecure RLS on analysis_edits
-- =============================================================================
-- Drop insecure policy (uses user_metadata — user-controlled)
DROP POLICY IF EXISTS "tenant_isolation" ON public.analysis_edits;

-- Replace with authoritative DB-based policy
CREATE POLICY "tenant_isolation" ON public.analysis_edits
  USING (
    tenant_id = public.get_current_tenant_id_secure()
  );

-- =============================================================================
-- 5. Harden get_tenant_id() — legacy function used by older migrations
-- =============================================================================
-- The historical get_tenant_id() uses root JWT claim tenant_id.
-- Replace with DB-authoritative lookup.
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- =============================================================================
-- 6. Harden get_current_tenant_id() — vNext function
-- =============================================================================
-- The vNext function uses app_metadata/root/fallback.
-- Replace with DB-authoritative lookup, keeping same function name.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- =============================================================================
-- 7. Tombstone admin policy hardening (from 20260609214000 migration)
-- =============================================================================
-- Review tombstone SELECT policy for admin — ensure it uses get_current_tenant_id_secure()
-- or equivalent, not user_metadata.
-- Specific policy text TBD after reviewing 20260609214000 content.

-- =============================================================================
-- 8. New-user registration: populate auth_user_id at creation
-- =============================================================================
-- After this migration, all new registrations should insert with:
--   id = auth.users.id (or gen_random_uuid)
--   auth_user_id = auth.users.id  ← new: explicit binding
-- This ensures the secure lookup works immediately for new accounts.
-- App-layer change required in register/route.ts after migration is applied.
