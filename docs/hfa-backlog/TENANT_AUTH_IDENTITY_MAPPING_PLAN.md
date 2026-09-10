# Tenant Auth Identity Mapping Plan

**Status:** DRAFT — requires dev/staging validation before any migration
**Classification:** P0_CANDIDATE_USER_METADATA_AUTHORIZATION_TRUST
**Created:** 2026-09-10

---

## 1. Problem statement

`public.users.id` was historically set to `gen_random_uuid()` (not necessarily `auth.uid()`).

Some flows use the same UUID for both `auth.users.id` and `public.users.id`. Other legacy rows may not.

Existing RLS (e.g., `analysis_edits.tenant_isolation`) uses:
```sql
auth.jwt() -> 'user_metadata' ->> 'tenant_id'
```
This is insecure because `user_metadata` is user-controlled.

The authoritative source is `public.users` (service-role query), which is now enforced at app-layer by `resolveAuthorizedUserContext`.

DB-layer RLS hardening requires a stable, verified binding between `auth.users.id` and `public.users.id`.

---

## 2. Proposed schema change

```sql
-- Add auth_user_id column to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Unique partial index: at most one public.users row per auth user
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_auth_user_id
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
```

Optional FK (requires `auth.users` to be accessible, verify in dev first):
```sql
-- Only add if pg_catalog confirms auth.users is referenceable
ALTER TABLE public.users
  ADD CONSTRAINT fk_users_auth_user_id
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

## 3. Safe backfill strategy

**Safe backfill candidate:** rows where `public.users.id = auth.users.id` (provably equivalent).

```sql
-- DRAFT — DO NOT RUN without dev/staging validation
UPDATE public.users pu
SET auth_user_id = pu.id
WHERE pu.auth_user_id IS NULL
  AND EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = pu.id
  );
```

**NOT safe:** backfill by email match without additional validation.
- Email match must be: unique, active, email-confirmed (check `auth.users.email_confirmed_at`), auditable.
- Must be idempotent and protected against race conditions (use `WHERE auth_user_id IS NULL`).

---

## 4. Impact analysis

### RLS impact
Once `auth_user_id` is populated and verified:
```sql
-- Replace insecure user_metadata pattern with:
CREATE OR REPLACE POLICY "tenant_isolation" ON public.analysis_edits
  USING (
    tenant_id = (
      SELECT pu.tenant_id
      FROM public.users pu
      WHERE pu.auth_user_id = auth.uid()
        AND pu.is_active = true
      LIMIT 1
    )
  );
```
Or alternatively, use a secure helper function:
```sql
CREATE OR REPLACE FUNCTION public.get_current_tenant_id_secure()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id FROM public.users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;
```

### OAuth bootstrap impact
- `bootstrap/route.ts` already resolves by `auth.users.id = public.users.id` (primary path)
- After `auth_user_id` column: secondary lookup can use `auth_user_id = auth.uid()`
- Legacy email path remains as fallback until backfill is complete

### Register impact
- New registrations via `register/route.ts`: insert with `id = auth.users.id` AND `auth_user_id = auth.users.id` simultaneously
- This makes both columns consistent from day 1 for new users

### Foreign key impact
- All FKs referencing `public.users(id)` remain unchanged
- `public.users.id` continues to be the PK used by `submitted_by`, `created_by`, `actor_id`, etc.
- `auth_user_id` is an additional lookup column, not a replacement PK

---

## 5. Affected `get_tenant_id` functions

### `public.get_tenant_id()` (historical, legacy)
Uses root JWT claim `tenant_id` — already insecure, superseded by newer functions.
**Action:** replace with `get_current_tenant_id_secure()` after `auth_user_id` backfill.

### `public.get_current_tenant_id()` (vNext)
Uses `app_metadata` → root → fallback. More secure than `user_metadata` but still JWT-dependent.
**Action:** replace with DB-authoritative lookup after `auth_user_id` backfill.

---

## 6. Rollback plan

1. `auth_user_id` column: `ALTER TABLE public.users DROP COLUMN auth_user_id` (safe, no FK deps initially)
2. RLS policies: revert to previous policy text (preserved in migration history)
3. App-layer: `resolveAuthorizedUserContext` remains safe regardless of DB state

---

## 7. Prerequisites before applying migration

- [ ] Dev/staging environment configured (issue #12)
- [ ] Isolated dev tenant fixture (issue #11)
- [ ] Real JWT tenant claim validated in dev (issue #10)
- [ ] `auth.users` → `public.users.id` equivalence verified for all active prod accounts
- [ ] Email-confirmed backfill candidates audited
- [ ] Migration tested in dev with rollback verified
- [ ] Cross-tenant isolation test suite run in staging (issue #9)

---

## 8. Current state

| Layer | Status |
|-------|--------|
| App-layer (api-auth.ts) | HARDENED — never uses user_metadata |
| App-layer (bootstrap) | HARDENED — fast-path removed |
| App-layer (register) | HARDENED — app_metadata only, public.users is authoritative |
| DB-layer RLS (analysis_edits) | INSECURE — pending migration |
| DB-layer RLS (other tables) | REVIEW NEEDED |
| `auth_user_id` column | NOT YET ADDED |
| Backfill | NOT EXECUTED |

---

## 9. Do not declare closed until

`HFA_RLS_REAL_VALIDATED` — requires real execution in dev/staging
`HFA_CROSS_TENANT_REAL_VALIDATED` — requires issue #9 in staging
`HFA_P0_FULLY_CLOSED` — requires all above + production decision
