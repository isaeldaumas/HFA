-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
revoke all privileges on table public.sera_vnext_shadow_metrics from service_role;
grant select on table public.sera_vnext_shadow_metrics to service_role;
