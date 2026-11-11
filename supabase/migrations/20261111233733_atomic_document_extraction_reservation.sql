-- Production-safe, additive quota for existing authenticated PDF/DOCX extraction.
-- Existing public.sera_document_uploads counts historical successful requests.
-- Subsequent rows reserve attempts before CPU-intensive PDF/DOCX parsing.
CREATE OR REPLACE FUNCTION public.hfa_reserve_document_extraction(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_attempts bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user identity for document extraction'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize quota reservations per user across all API worker processes.
  -- Advisory-lock collisions only serialize unrelated users, never share data.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hfa:document-extraction:v1:' || p_user_id::text, 0)
  );

  SELECT count(*) INTO v_attempts
    FROM public.sera_document_uploads
   WHERE user_id = p_user_id
     AND created_at >= v_now - INTERVAL '1 hour';

  IF v_attempts >= 10 THEN
    RETURN false;
  END IF;

  -- If the insert fails (including FK/DB failures), the RPC fails and the
  -- caller never begins document parsing or reports success.
  INSERT INTO public.sera_document_uploads (user_id) VALUES (p_user_id);
  RETURN true;
END
$function$;

-- Do not expose the quota counter or its privileged execution to browsers.
REVOKE ALL ON FUNCTION public.hfa_reserve_document_extraction(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hfa_reserve_document_extraction(uuid)
  TO service_role;

COMMENT ON FUNCTION public.hfa_reserve_document_extraction(uuid) IS
  'Atomic per-auth-user reservation before PDF/DOCX parsing, 10 attempts/hour. SECURITY INVOKER service_role only; no Shadow or engine change.';
