-- Additive, privacy-preserving distributed admission counter for email invitations.
-- Invoked only with the server-side service_role key, never by public clients.
-- The browser signup remains off by default (HFA_REGISTRATION_INVITES_READY).
CREATE TABLE IF NOT EXISTS private.hfa_registration_rate_buckets (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS hfa_registration_rate_buckets_updated_at_idx
  ON private.hfa_registration_rate_buckets (updated_at);

ALTER TABLE private.hfa_registration_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.hfa_registration_rate_buckets FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.hfa_registration_rate_buckets TO service_role;

DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'private' AND tablename = 'hfa_registration_rate_buckets'
      AND policyname = 'registration_buckets_service_role_only'
  ) THEN
    CREATE POLICY registration_buckets_service_role_only
      ON private.hfa_registration_rate_buckets
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$policy$;

CREATE OR REPLACE FUNCTION public.hfa_registration_rate_limit_consume(
  p_token_hash text,
  p_max_attempts integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_attempts integer;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 20
     OR p_window_seconds IS NULL OR p_window_seconds < 60 OR p_window_seconds > 86400
  THEN
    RAISE EXCEPTION 'Invalid registration rate limit arguments' USING ERRCODE = '22023';
  END IF;

  -- Bounded retention of stale pseudonymous counters after the 24h window.
  DELETE FROM private.hfa_registration_rate_buckets
   WHERE token_hash IN (
     SELECT token_hash FROM private.hfa_registration_rate_buckets
       WHERE updated_at < v_now - INTERVAL '3 days'
       ORDER BY updated_at LIMIT 32 FOR UPDATE SKIP LOCKED
   );

  -- ON CONFLICT is atomic under PostgreSQL's unique index locks even when
  -- multiple Vercel instances process the same address concurrently.
  INSERT INTO private.hfa_registration_rate_buckets AS bucket
      (token_hash, started_at, attempts, updated_at)
    VALUES (p_token_hash, v_now, 1, v_now)
  ON CONFLICT (token_hash) DO UPDATE
    SET attempts = CASE
          WHEN bucket.started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
            THEN 1
          ELSE CASE WHEN bucket.attempts >= 2147483647 THEN 2147483647 ELSE bucket.attempts + 1 END
        END,
        started_at = CASE
          WHEN bucket.started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
            THEN v_now
          ELSE bucket.started_at
        END,
        updated_at = v_now
  RETURNING attempts INTO v_attempts;

  RETURN v_attempts <= p_max_attempts;
END
$function$;

-- PostgreSQL/Supabase default function ACLs may grant to PUBLIC and both API
-- roles. Explicitly remove both paths; service_role alone may spend budgets.
REVOKE ALL ON FUNCTION public.hfa_registration_rate_limit_consume(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hfa_registration_rate_limit_consume(text, integer, integer)
  TO service_role;

COMMENT ON TABLE private.hfa_registration_rate_buckets IS
  'HMAC-SHA256 digests only; no emails, IP addresses or raw bearer tokens. Expiry is enforced at consumption.';
COMMENT ON FUNCTION public.hfa_registration_rate_limit_consume(text, integer, integer) IS
  'Server-only atomic rate gate, SECURITY INVOKER, EXECUTE only for service_role.';
