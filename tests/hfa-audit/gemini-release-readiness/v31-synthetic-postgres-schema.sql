-- HFA V31 SYNTHETIC FIXTURE for ephemeral postgres:16 in GitHub Actions.
-- NEVER apply to any Supabase project. No production schema or personal data.
-- Run only in database hfa_v31_synthetic on an isolated test service.
DO $hfa_fixture$
BEGIN
  IF current_database() <> 'hfa_v31_synthetic' THEN
    RAISE EXCEPTION 'HFA_V31_SYNTHETIC_DATABASE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'HFA_V31_FIXTURE_REQUIRES_FRESH_POSTGRES';
  END IF;
END;
$hfa_fixture$;

CREATE ROLE anon LOGIN PASSWORD 'local-v31-synthetic-only';
CREATE ROLE authenticated LOGIN PASSWORD 'local-v31-synthetic-only';
CREATE ROLE service_role LOGIN PASSWORD 'local-v31-synthetic-only';

CREATE TYPE public.tenant_plan AS ENUM ('trial', 'basic', 'pro', 'enterprise', 'free');
CREATE TYPE public.credit_transaction_type AS ENUM ('purchase', 'consumption', 'refund', 'bonus');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan public.tenant_plan NOT NULL DEFAULT 'trial',
  credits_balance integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  trial_expires_at timestamptz
);
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  deleted_at timestamptz,
  credits_used integer NOT NULL DEFAULT 0
);
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  type public.credit_transaction_type NOT NULL,
  amount integer NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT USAGE ON TYPE public.tenant_plan, public.credit_transaction_type TO service_role;
GRANT SELECT, UPDATE ON public.tenants TO service_role;
GRANT SELECT ON public.users TO service_role;
GRANT SELECT, UPDATE ON public.events TO service_role;
GRANT SELECT, INSERT ON public.credit_transactions TO service_role;
