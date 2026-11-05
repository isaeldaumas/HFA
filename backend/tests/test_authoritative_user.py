"""Dependency-free auth/tenant boundary tests. No external network or services."""
import os
import sys
import unittest
from dataclasses import dataclass

sys.path.insert(0, os.path.abspath("backend"))

from app.api.authoritative_user import AuthorizationBindingError, resolve_authorized_user


class Response:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error


class Query:
    def __init__(self, db, table):
        self.db = db
        self.table = table
        self.field = None
        self.value = None
        self.limit_size = None

    def select(self, fields):
        self.fields = fields
        return self

    def eq(self, field, value):
        self.field = field
        self.value = value
        return self

    def limit(self, limit):
        self.limit_size = limit
        return self

    def execute(self):
        self.db.reads.append((self.table, self.field, self.value, self.limit_size))
        if self.db.fail_table == self.table:
            raise ConnectionError("Synthetic Supabase timeout")
        rows = [
            row for row in self.db.tables.get(self.table, [])
            if str(row.get(self.field, "")) == str(self.value)
        ]
        return Response(rows[:self.limit_size] if self.limit_size else rows)


class Db:
    def __init__(self, users, tenants, fail_table=None):
        self.tables = {"users": users, "tenants": tenants}
        self.fail_table = fail_table
        self.reads = []

    def table(self, name):
        return Query(self, name)


@dataclass
class Auth:
    id: str
    email: str | None
    email_confirmed_at: str | None
    user_metadata: dict | None = None


AUTH_A = "10000000-aaaa-4000-a000-000000000001"
AUTH_B = "20000000-bbbb-4000-b000-000000000002"
PUBLIC_B_LEGACY = "30000000-cccc-4000-b000-000000000003"
TENANT_A = "tenant-alpha"
TENANT_B = "tenant-beta"


def row(id=AUTH_A, tenant=TENANT_A, auth_id=None, email="a@example.test", active=True, role="viewer"):
    return dict(
        id=id, auth_user_id=auth_id, tenant_id=tenant, role=role,
        is_active=active, email=email,
    )


def db(users=None, tenants=None, fail_table=None):
    if users is None:
        users = [row(id=AUTH_A, auth_id=AUTH_A)]
    if tenants is None:
        tenants = [{"id": TENANT_A, "is_active": True}, {"id": TENANT_B, "is_active": True}]
    return Db(users, tenants, fail_table)


class AuthoritativeUserTests(unittest.TestCase):
    def auth(self, id=AUTH_A, email="a@example.test", confirmed=True, meta=None):
        return Auth(id, email, "2026-11-05T10:00:00Z" if confirmed else None, meta)

    def deny(self, expected_code, database, user):
        with self.assertRaises(AuthorizationBindingError) as failure:
            resolve_authorized_user(database, user)
        self.assertEqual(failure.exception.code, expected_code)

    def test_direct_match_ignores_forged_tenant_and_role_metadata(self):
        instance = db()
        user = self.auth(meta={"tenant_id": TENANT_B, "role": "admin"})
        actual = resolve_authorized_user(instance, user)
        self.assertEqual(actual.tenant_id, TENANT_A)
        self.assertEqual(actual.role, "viewer")
        self.assertEqual(actual.public_user_id, AUTH_A)
        self.assertEqual(actual.identity_binding, "DIRECT_AUTH_ID")
        self.assertTrue(all(table in {"users", "tenants"} for table, *_ in instance.reads))

    def test_explicit_binding_with_legacy_public_id(self):
        instance = db(users=[row(id=PUBLIC_B_LEGACY, auth_id=AUTH_B, tenant=TENANT_B,
                                 email="b@example.test", role="analyst")])
        actual = resolve_authorized_user(instance, self.auth(AUTH_B, "b@example.test"))
        self.assertEqual(actual.tenant_id, TENANT_B)
        self.assertEqual(actual.public_user_id, PUBLIC_B_LEGACY)
        self.assertEqual(actual.identity_binding, "EXPLICIT_AUTH_BINDING")

    def test_legacy_email_requires_confirmed_email(self):
        instance = db(users=[row(id=PUBLIC_B_LEGACY, auth_id=None,
                                 tenant=TENANT_A, email="b@example.test")])
        valid = resolve_authorized_user(instance, self.auth(AUTH_B, "b@example.test"))
        self.assertEqual(valid.identity_binding, "LEGACY_CONFIRMED_EMAIL")
        self.deny("MISSING_CONFIRMED_IDENTITY", instance,
                  self.auth(AUTH_B, "b@example.test", confirmed=False))

    def test_ambiguous_legacy_email_is_denied(self):
        instance = db(users=[
            row(id=PUBLIC_B_LEGACY, auth_id=None, tenant=TENANT_A, email="b@example.test"),
            row(id="40000000-dddd-4000-b000-000000000004", auth_id=None,
                tenant=TENANT_B, email="b@example.test"),
        ])
        self.deny("ACCOUNT_NOT_FOUND_OR_AMBIGUOUS", instance, self.auth(AUTH_B, "b@example.test"))

    def test_conflicting_explicit_auth_binding_is_denied(self):
        instance = db(users=[
            row(id=AUTH_A, auth_id=AUTH_B, tenant=TENANT_B),
        ])
        self.deny("CONFLICTING_AUTH_BINDING", instance, self.auth(AUTH_A))

    def test_duplicate_bindings_are_denied(self):
        instance = db(users=[
            row(id=AUTH_A, auth_id=AUTH_A),
            row(id=PUBLIC_B_LEGACY, auth_id=AUTH_A, tenant=TENANT_B),
        ])
        self.deny("AMBIGUOUS_AUTH_BINDING", instance, self.auth(AUTH_A))

    def test_inactive_user_is_denied(self):
        instance = db(users=[row(id=AUTH_A, auth_id=AUTH_A, active=False)])
        self.deny("USER_INACTIVE", instance, self.auth())

    def test_inactive_tenant_is_denied(self):
        instance = db(tenants=[{"id": TENANT_A, "is_active": False}])
        self.deny("TENANT_INACTIVE_OR_NOT_FOUND", instance, self.auth())

    def test_missing_tenant_is_denied(self):
        instance = db(tenants=[])
        self.deny("TENANT_INACTIVE_OR_NOT_FOUND", instance, self.auth())

    def test_auth_binding_lookup_error_fails_closed(self):
        self.deny("AUTHORIZATION_DB_UNAVAILABLE", db(fail_table="users"), self.auth())

    def test_tenant_lookup_error_fails_closed(self):
        self.deny("AUTHORIZATION_DB_UNAVAILABLE", db(fail_table="tenants"), self.auth())

    def test_missing_confirmed_email_or_account_never_provisions_implicitly(self):
        self.deny("MISSING_CONFIRMED_IDENTITY", db(users=[]),
                  self.auth(email="orphan@example.test", confirmed=False))
        self.deny("ACCOUNT_NOT_FOUND_OR_AMBIGUOUS", db(users=[]),
                  self.auth(email="orphan@example.test"))

    def test_invalid_auth_id_is_denied(self):
        self.deny("INVALID_AUTH_IDENTITY", db(), self.auth("not-a-uuid"))


if __name__ == "__main__":
    unittest.main()
