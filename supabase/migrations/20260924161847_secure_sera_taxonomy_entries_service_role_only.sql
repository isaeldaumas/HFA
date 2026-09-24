alter table public.sera_taxonomy_entries enable row level security;
revoke all privileges on table public.sera_taxonomy_entries from anon, authenticated;
