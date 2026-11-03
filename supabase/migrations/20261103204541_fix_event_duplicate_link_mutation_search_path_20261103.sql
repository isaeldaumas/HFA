-- HFA security remediation, Supabase advisor 0011_function_search_path_mutable.
-- Applied in production via Supabase migration 20261103204541.
-- Keep the exact body and UPDATE/DELETE triggers unchanged: configuration only.
ALTER FUNCTION public.reject_event_duplicate_link_mutation()
  SET search_path = '';
