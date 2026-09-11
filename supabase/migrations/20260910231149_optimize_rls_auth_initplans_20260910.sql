-- Already applied on staging vbdpweliprcsktyxodss.
-- Versioned for GitHub/repo parity. Do NOT re-apply on the same staging project.
alter policy users_own_ai_settings on public.ai_settings
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter policy ede_select_admin on public.event_deletion_events
using (
  (tenant_id = get_tenant_id())
  and exists (
    select 1
    from public.users
    where users.id = (select auth.uid())
      and users.tenant_id = get_tenant_id()
      and users.role = 'admin'::user_role
  )
);
