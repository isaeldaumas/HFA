/**
 * Platform-wide operations must NEVER be authorized by a customer's tenant
 * plan and role alone. A server-side allowlist explicitly grants the global
 * operator capability to authenticated auth.users identities.
 *
 * HFA_PLATFORM_ADMIN_AUTH_USER_IDS is a comma-separated allowlist of auth.users
 * UUIDs, configured in a protected environment by the operator. This is not
 * a token or secret; bearer authentication and DB-authoritative role checks
 * remain mandatory at the call site.
 *
 * Absent, empty, malformed or duplicate entries are fail-closed. Do not fall
 * back to customer role, user_metadata, email, or request input.
 */
const AUTH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPlatformAdminAuthorized(args: {
  authUserId: string
  role: string
  allowlistedAuthUserIds: string | undefined
}): boolean {
  if (String(args.role).toLowerCase() !== 'admin') return false
  const id = args.authUserId.trim().toLowerCase()
  if (!AUTH_UUID.test(id)) return false
  if (!args.allowlistedAuthUserIds?.trim()) return false
  const ids = args.allowlistedAuthUserIds.split(',').map(x => x.trim().toLowerCase())
  if (!ids.length || ids.some(x => !AUTH_UUID.test(x))) return false
  if (new Set(ids).size !== ids.length) return false
  return ids.includes(id)
}
