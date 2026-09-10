/**
 * CONTRACT TEST — DB-authoritative tenant authorization migration
 *
 * Proves structural properties of:
 *   supabase/migrations/20260910193000_db_authoritative_tenant_authorization.sql
 *
 * Run: npx tsx tests/hfa-audit/tenant-isolation/db-authoritative-tenant-rls-migration-contract-trial-001.ts
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..', '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')
const MIGRATION_NAME = '20260910193000_db_authoritative_tenant_authorization.sql'
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_NAME)

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

check(existsSync(MIGRATION_PATH), `migration file exists: ${MIGRATION_NAME}`)

const src = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, 'utf8') : ''

// No authorization via user_metadata / app_metadata (comments that forbid them are OK)
check(
  !src.match(/auth\.jwt\(\)[\s\S]{0,80}user_metadata/) &&
    !src.match(/auth\.jwt\(\)[\s\S]{0,80}app_metadata/) &&
    !src.match(/raw_user_meta_data/) &&
    !src.match(/->>\s*'tenant_id'/) &&
    !src.match(/->>\s*'role'/),
  'migration: no JWT metadata authorization patterns'
)

// auth.uid() + auth_user_id
check(src.includes('auth.uid()'), 'migration: resolver uses auth.uid()')
check(src.includes('auth_user_id'), 'migration: uses auth_user_id binding column')
check(
  src.includes('uq_users_auth_user_id'),
  'migration: unique partial index on auth_user_id'
)

// Inactive fail-closed
check(
  src.includes('u.is_active = true') && src.includes('t.is_active = true'),
  'migration: inactive user and inactive tenant fail closed'
)

// Role from DB
check(
  src.includes('private.current_user_role') && src.includes('u.role::text'),
  'migration: role comes from public.users.role via private.current_user_role'
)

// Private SECURITY DEFINER + empty search_path
check(
  src.includes('CREATE OR REPLACE FUNCTION private.current_tenant_id()') &&
    src.includes('SECURITY DEFINER') &&
    src.includes("SET search_path = ''"),
  'migration: private.current_tenant_id is SECURITY DEFINER with empty search_path'
)

// Public wrappers are INVOKER (no SECURITY DEFINER on public wrappers)
const publicGetTenant = src.match(
  /CREATE OR REPLACE FUNCTION public\.get_tenant_id\(\)[\s\S]*?AS \$\$[\s\S]*?\$\$;/
)
const publicGetCurrent = src.match(
  /CREATE OR REPLACE FUNCTION public\.get_current_tenant_id\(\)[\s\S]*?AS \$\$[\s\S]*?\$\$;/
)
check(
  !!publicGetTenant && !/SECURITY DEFINER/i.test(publicGetTenant[0]),
  'migration: public.get_tenant_id is not SECURITY DEFINER (INVOKER)'
)
check(
  !!publicGetCurrent && !/SECURITY DEFINER/i.test(publicGetCurrent[0]),
  'migration: public.get_current_tenant_id is not SECURITY DEFINER (INVOKER)'
)
check(
  src.includes('SELECT private.current_tenant_id()'),
  'migration: public wrappers delegate to private.current_tenant_id()'
)

// analysis_edits USING + WITH CHECK
check(
  src.includes('DROP POLICY IF EXISTS "tenant_isolation" ON public.analysis_edits') &&
    src.includes('USING (tenant_id = public.get_tenant_id())') &&
    src.includes('WITH CHECK (tenant_id = public.get_tenant_id())'),
  'migration: analysis_edits has USING and WITH CHECK via get_tenant_id()'
)

// Legacy RPCs not open to anon/authenticated
check(
  src.includes('REVOKE ALL ON FUNCTION public.rpc_soft_delete_event') &&
    src.includes('FROM anon, authenticated') &&
    src.includes('GRANT EXECUTE ON FUNCTION public.rpc_soft_delete_event') &&
    src.includes('TO postgres, service_role'),
  'migration: rpc_soft_delete_event closed to anon/authenticated'
)
check(
  src.includes('REVOKE ALL ON FUNCTION public.rpc_restore_soft_deleted_event') &&
    src.includes('GRANT EXECUTE ON FUNCTION public.rpc_restore_soft_deleted_event'),
  'migration: rpc_restore_soft_deleted_event closed similarly'
)

// bind trigger not generally executable
check(
  src.includes('private.bind_direct_auth_user_id') &&
    src.includes('REVOKE ALL ON FUNCTION private.bind_direct_auth_user_id() FROM anon, authenticated'),
  'migration: bind_direct_auth_user_id not generically executable'
)

// analyses_backup closed
check(
  src.includes('analyses_backup_pt_en') &&
    src.includes('ENABLE ROW LEVEL SECURITY') &&
    src.includes('REVOKE ALL ON TABLE public.analyses_backup_pt_en FROM anon, authenticated'),
  'migration: analyses_backup_pt_en RLS enabled and client grants revoked'
)

// Historical migrations untouched — insecure historical pattern still present only in original file
const historical = readFileSync(
  join(MIGRATIONS_DIR, '20260507180000_add_analysis_edits.sql'),
  'utf8'
)
check(
  historical.includes("auth.jwt() -> 'user_metadata' ->> 'tenant_id'"),
  'historical analysis_edits migration unchanged (insecure pattern still documented there)'
)

// No fixture PII / hardcoded emails / passwords
check(
  !src.match(/@[a-z0-9.-]+\.[a-z]{2,}/i) &&
    !src.match(/password/i) &&
    !src.match(/eyJ[A-Za-z0-9_-]{10,}/),
  'migration: no emails, passwords, or JWT-like secrets'
)

// Migration is the latest hardening for analysis_edits tenant_isolation
const laterHardening = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql') && f > '20260507180000_add_analysis_edits.sql')
  .filter((f) => {
    const c = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    return c.includes('analysis_edits') && c.includes('tenant_isolation')
  })
check(
  laterHardening.includes(MIGRATION_NAME),
  'migration: registered as superseding hardening for analysis_edits.tenant_isolation'
)

if (failures > 0) {
  console.error(`\n${failures} failure(s) — db-authoritative-tenant-rls-migration-contract: FAIL`)
  process.exit(1)
}
console.log('\ndb-authoritative-tenant-rls-migration-contract: PASS')
console.log('HFA_DB_AUTHORITATIVE_TENANT_MIGRATION_VERSIONED')
