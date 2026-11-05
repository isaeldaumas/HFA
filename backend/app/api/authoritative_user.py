"""Database-authoritative tenant/role binding for authenticated Supabase users.

Use only AFTER auth.get_user(token) succeeds. Never read user_metadata,
app_metadata, payload-provided tenant IDs or a client-supplied role. The
service-role client bypasses RLS, so every protected operation must use this
resolved tenant and scope its queries accordingly.

No remote calls are performed until resolve_authorized_user is invoked.
"""
from dataclasses import dataclass
from uuid import UUID


class AuthorizationBindingError(Exception):
    def __init__(self, code: str, status_code: int = 403):
        self.code = code
        self.status_code = status_code
        super().__init__(code)


@dataclass(frozen=True)
class AuthorizedUser:
    auth_user_id: str
    public_user_id: str
    tenant_id: str
    role: str
    email: str | None
    identity_binding: str


USER_FIELDS = "id,auth_user_id,tenant_id,role,is_active,email"


def _uuid(value: object) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise AuthorizationBindingError("INVALID_AUTH_IDENTITY", 401) from exc


def _rows(admin, field: str, value: str, *, limit: int = 2) -> list[dict]:
    try:
        result = (admin.table("users")
                  .select(USER_FIELDS)
                  .eq(field, value)
                  .limit(limit)
                  .execute())
    except Exception as exc:
        raise AuthorizationBindingError("AUTHORIZATION_DB_UNAVAILABLE", 503) from exc
    if getattr(result, "error", None):
        raise AuthorizationBindingError("AUTHORIZATION_DB_UNAVAILABLE", 503)
    return list(result.data or [])


def _assert_tenant_active(admin, tenant_id: str) -> None:
    try:
        result = (admin.table("tenants")
                  .select("id,is_active")
                  .eq("id", tenant_id)
                  .limit(2)
                  .execute())
    except Exception as exc:
        raise AuthorizationBindingError("AUTHORIZATION_DB_UNAVAILABLE", 503) from exc
    if getattr(result, "error", None):
        raise AuthorizationBindingError("AUTHORIZATION_DB_UNAVAILABLE", 503)
    tenants = result.data or []
    if len(tenants) != 1 or tenants[0].get("is_active") is not True:
        raise AuthorizationBindingError("TENANT_INACTIVE_OR_NOT_FOUND")


def resolve_authorized_user(admin, authenticated_user) -> AuthorizedUser:
    """Resolve public.users from a *validated* Auth user, with safe legacy fallback.

    1. DIRECT_AUTH_ID if public.users.id equals auth.users.id.
    2. EXPLICIT_AUTH_BINDING by public.users.auth_user_id.
    3. LEGACY_CONFIRMED_EMAIL if auth email is confirmed, unique, active and
       the public row has no conflicting auth_user_id.

    Any ambiguous/conflicting/missing association or inactive tenant fails
    closed. DB query errors are 503; no user-controlled claims are consulted.
    """
    auth_id = _uuid(getattr(authenticated_user, "id", None))
    email_raw = getattr(authenticated_user, "email", None)
    email = email_raw.strip().lower() if isinstance(email_raw, str) and email_raw.strip() else None
    email_confirmed = bool(getattr(authenticated_user, "email_confirmed_at", None))

    direct_rows = _rows(admin, "id", auth_id)
    bound_rows = _rows(admin, "auth_user_id", auth_id)

    if len(direct_rows) > 1 or len(bound_rows) > 1:
        raise AuthorizationBindingError("AMBIGUOUS_AUTH_BINDING")
    if direct_rows and bound_rows and direct_rows[0]["id"] != bound_rows[0]["id"]:
        raise AuthorizationBindingError("CONFLICTING_AUTH_BINDING")

    if direct_rows:
        row = direct_rows[0]
        binding = "DIRECT_AUTH_ID"
    elif bound_rows:
        row = bound_rows[0]
        binding = "EXPLICIT_AUTH_BINDING"
    else:
        if not email or not email_confirmed:
            raise AuthorizationBindingError("MISSING_CONFIRMED_IDENTITY")
        email_rows = _rows(admin, "email", email)
        if len(email_rows) != 1:
            raise AuthorizationBindingError("ACCOUNT_NOT_FOUND_OR_AMBIGUOUS")
        row = email_rows[0]
        binding = "LEGACY_CONFIRMED_EMAIL"

    linked_auth_id = row.get("auth_user_id")
    if linked_auth_id and _uuid(linked_auth_id) != auth_id:
        raise AuthorizationBindingError("CONFLICTING_AUTH_BINDING")
    if row.get("is_active") is not True:
        raise AuthorizationBindingError("USER_INACTIVE")
    tenant_id = str(row.get("tenant_id") or "").strip()
    public_id = str(row.get("id") or "").strip()
    role = str(row.get("role") or "").strip().lower()
    if not tenant_id or not public_id or not role:
        raise AuthorizationBindingError("INCOMPLETE_AUTHORIZATION_ROW")
    _assert_tenant_active(admin, tenant_id)
    return AuthorizedUser(
        auth_user_id=auth_id,
        public_user_id=public_id,
        tenant_id=tenant_id,
        role=role,
        email=email,
        identity_binding=binding,
    )
