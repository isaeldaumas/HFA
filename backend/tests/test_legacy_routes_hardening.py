"""Execution tests for legacy FastAPI route handlers with isolated API/database doubles.

The runtime deps are intentionally shimmed in this *test only*; real Supabase
credentials, network calls, SMTP, and service-role writes are never accessed.
The route source itself is executed and its async handlers invoked.
"""
import asyncio
import pathlib
import sys
import types
import unittest
from dataclasses import dataclass
from types import SimpleNamespace as NS
from unittest.mock import Mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


class HttpError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def load_route(relative: str, admin, signup=None):
    """Compile actual route sources against test-only dependency stubs."""
    class Router:
        def __init__(self, **kw): pass
        def get(self, *a, **kw): return lambda fn: fn
        def post(self, *a, **kw): return lambda fn: fn
        def patch(self, *a, **kw): return lambda fn: fn
        def delete(self, *a, **kw): return lambda fn: fn

    fake_fastapi = types.ModuleType("fastapi")
    fake_fastapi.APIRouter = Router
    fake_fastapi.Depends = lambda fn: fn
    fake_fastapi.HTTPException = HttpError

    fake_responses = types.ModuleType("fastapi.responses")
    fake_responses.Response = lambda **kw: kw

    fake_pydantic = types.ModuleType("pydantic")
    fake_pydantic.BaseModel = object
    fake_pydantic.EmailStr = str

    fake_deps = types.ModuleType("app.api.deps")
    fake_deps.get_current_user = lambda: None
    fake_deps.get_authorized_user = lambda: None

    fake_database = types.ModuleType("app.database")
    fake_database.get_supabase_admin = lambda: admin
    fake_database.get_supabase_client = lambda: NS(auth=NS(sign_up=signup))

    modules = {
        "fastapi": fake_fastapi,
        "fastapi.responses": fake_responses,
        "pydantic": fake_pydantic,
        "app.api.deps": fake_deps,
        "app.database": fake_database,
    }
    saved = {name: sys.modules.get(name) for name in modules}
    sys.modules.update(modules)
    path = ROOT / "backend/app/api/routes" / relative
    namespace = {"__name__": "test_only_" + relative.replace(".", "_")}
    try:
        exec(compile(path.read_text(), str(path), "exec"), namespace)
    finally:
        for name, prev in saved.items():
            if prev is None: sys.modules.pop(name, None)
            else: sys.modules[name] = prev
    return namespace


@dataclass
class Result:
    data: object = None
    error: object = None


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.name = db, table
        self.filters = []
        self.operation = "select"
        self.payload = None
        self.limit_count = None

    def select(self, fields):
        return self

    def eq(self, field, value):
        self.filters.append((field, value))
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def single(self):
        self.operation = "single"
        return self

    def maybe_single(self):
        self.operation = "single"
        return self

    def order(self, *args, **kwargs): return self

    def insert(self, data):
        self.operation, self.payload = "insert", dict(data)
        return self

    def update(self, data):
        self.operation, self.payload = "update", dict(data)
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def execute(self):
        self.db.calls.append((self.name, self.operation, tuple(self.filters)))
        if self.operation == "insert":
            if self.name in self.db.insert_failures:
                return Result(data=None, error={"code": "TEST_INSERT_FAIL"})
            payload = dict(self.payload)
            if self.name == "tenants" and "id" not in payload:
                payload["id"] = "tenant-new-%s" % (len(self.db.tables["tenants"]) + 1)
                payload["is_active"] = True
            self.db.tables.setdefault(self.name, []).append(payload)
            self.db.writes.append((self.name, payload))
            return Result(data=[payload])
        matching = [r for r in self.db.tables.get(self.name, []) if all(
            str(r.get(key)) == str(value) for key, value in self.filters
        )]
        if self.limit_count is not None: matching = matching[:self.limit_count]
        if self.operation == "single": return Result(data=matching[0] if matching else None)
        if self.operation == "select": return Result(data=matching)
        if self.operation == "update":
            for r in matching: r.update(self.payload)
            return Result(data=matching)
        if self.operation == "delete":
            for r in matching: self.db.tables[self.name].remove(r)
            return Result(data=matching)
        raise AssertionError(self.operation)


class FakeDb:
    def __init__(self, users=(), tenants=(), actions=()):
        self.tables = {
            "users": list(users),
            "tenants": list(tenants),
            "corrective_actions": list(actions),
            "analyses": [],
            "analysis_edits": [],
        }
        self.writes, self.calls = [], []
        self.insert_failures = set()

    def table(self, name): return FakeQuery(self, name)


AUTH_1 = "10000000-aaaa-4000-a000-000000000001"
AUTH_2 = "20000000-bbbb-4000-b000-000000000002"


def signup_for(email="new@example.test", id=AUTH_1, identities=True):
    calls = []
    def signup(input):
        calls.append(input)
        return NS(user=NS(
            id=id, email=email,
            identities=[{"id": id}] if identities else [],
            email_confirmed_at=None,
        ))
    return signup, calls


def run(coro):
    return asyncio.run(coro)


class RouteSecurityTests(unittest.TestCase):
    def test_no_enterprise_from_self_claimed_email(self):
        db = FakeDb()
        signup, calls = signup_for("operator@example.test")
        route = load_route("auth.py", db, signup)
        result = run(route["register"](NS(
            email="operator@example.test", password="synthetic",
            company_name="Example Co", slug="example-co")))
        self.assertEqual(result["tenant_id"], "tenant-new-1")
        self.assertEqual(db.tables["tenants"][0]["plan"], "free")
        self.assertEqual(db.tables["tenants"][0]["credits_balance"], 5)
        self.assertEqual(db.tables["users"][0]["id"], AUTH_1)
        self.assertEqual(db.tables["users"][0]["auth_user_id"], AUTH_1)
        self.assertEqual(db.tables["users"][0]["role"], "admin")
        self.assertEqual(db.tables["users"][0]["tenant_id"], "tenant-new-1")
        self.assertEqual(calls[0]["email"], "operator@example.test")
        self.assertNotIn("options", calls[0])
        self.assertEqual(len(db.writes), 2)

    def test_invalid_slug_denied_before_signup(self):
        db = FakeDb()
        signup, calls = signup_for()
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="X",
                slug="../../other-tenant")))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(calls, [])
        self.assertEqual(db.writes, [])

    def test_blank_company_denied_before_signup(self):
        db = FakeDb()
        signup, calls = signup_for()
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="   ",
                slug="valid-slug")))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(calls, [])
        self.assertEqual(db.writes, [])

    def test_duplicate_email_denies_signup_before_writes(self):
        db = FakeDb(users=[{"email": "new@example.test"}])
        signup, calls = signup_for()
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="X", slug="x")))
        self.assertEqual(exc.exception.status_code, 409)
        self.assertEqual(calls, [])
        self.assertEqual(db.writes, [])

    def test_fake_supabase_existing_user_does_not_create_tenant(self):
        db = FakeDb()
        signup, _ = signup_for(identities=False)
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="X", slug="x")))
        self.assertEqual(exc.exception.status_code, 409)
        self.assertEqual(db.writes, [])

    def test_signup_failure_does_not_create_tenant(self):
        db = FakeDb()
        def signup(_): raise ValueError("synthetic signup failure")
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="X", slug="x")))
        self.assertEqual(exc.exception.status_code, 400)
        self.assertEqual(db.writes, [])

    def test_tenant_db_failure_reports_pending_instead_of_success(self):
        db = FakeDb()
        db.insert_failures.add("tenants")
        signup, _ = signup_for()
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic", company_name="X", slug="x")))
        self.assertEqual(exc.exception.status_code, 503)
        self.assertEqual(db.tables["users"], [])

    def test_bootstrap_new_confirmed_user_is_free_and_bound_to_auth_id(self):
        db = FakeDb()
        route = load_route("auth.py", db)
        auth_user = NS(id=AUTH_1, email="new@example.test",
                       email_confirmed_at="2026-11-05T10:00:00Z",
                       user_metadata={"tenant_id": "foreign-tenant", "role": "admin"})
        result = run(route["oauth_bootstrap"](NS(user=auth_user)))
        self.assertEqual(result["created"], True)
        self.assertEqual(db.tables["tenants"][0]["plan"], "free")
        self.assertEqual(db.tables["users"][0]["auth_user_id"], AUTH_1)
        self.assertNotEqual(db.tables["users"][0]["tenant_id"], "foreign-tenant")

    def test_tenant_admin_flag_is_not_billing_plan_privilege(self):
        db = FakeDb(tenants=[{"id": "tenant-free", "plan": "free",
                              "credits_balance": 3, "is_active": True}])
        route = load_route("auth.py", db)
        response = run(route["get_me"](NS(tenant_id="tenant-free", role="admin")))
        self.assertEqual(response["role"], "admin")
        self.assertTrue(response["is_admin"])
        response_viewer = run(route["get_me"](NS(tenant_id="tenant-free", role="viewer")))
        self.assertFalse(response_viewer["is_admin"])

    def test_mismatched_auth_sign_up_identity_does_not_create_tenant(self):
        db = FakeDb()
        signup, _ = signup_for(email="different@example.test")
        route = load_route("auth.py", db, signup)
        with self.assertRaises(HttpError) as exc:
            run(route["register"](NS(
                email="new@example.test", password="synthetic",
                company_name="X", slug="x")))
        self.assertEqual(exc.exception.status_code, 409)
        self.assertEqual(db.writes, [])

    def test_bootstrap_unconfirmed_identity_denied(self):
        db = FakeDb()
        route = load_route("auth.py", db)
        auth_user = NS(id=AUTH_1, email="new@example.test", email_confirmed_at=None,
                       user_metadata={"tenant_id": "foreign", "role": "admin"})
        with self.assertRaises(HttpError) as exc:
            run(route["oauth_bootstrap"](NS(user=auth_user)))
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(db.writes, [])

    def test_bootstrap_existing_user_ignores_forged_tenant(self):
        db = FakeDb(
            users=[{"id": AUTH_1, "auth_user_id": AUTH_1, "tenant_id": "legitimate",
                    "role": "viewer", "is_active": True, "email": "new@example.test"}],
            tenants=[{"id": "legitimate", "is_active": True}],
        )
        route = load_route("auth.py", db)
        auth_user = NS(id=AUTH_1, email="new@example.test",
                       email_confirmed_at="2026-11-05T10:00:00Z",
                       user_metadata={"tenant_id": "foreign", "role": "admin"})
        result = run(route["oauth_bootstrap"](NS(user=auth_user)))
        self.assertEqual(result["tenant_id"], "legitimate")
        self.assertEqual(result["created"], False)
        self.assertEqual(db.writes, [])

    def test_actions_viewer_denied_before_database(self):
        db = FakeDb(actions=[{"id": "action-1", "tenant_id": "alpha", "status": "open"}])
        route = load_route("actions.py", db)
        with self.assertRaises(HttpError) as exc:
            run(route["update_action"](
                "action-1",
                NS(status="completed", responsible=None, due_date=None,
                   model_dump=lambda exclude_none=False: {"status": "completed", "responsible": None, "due_date": None}),
                NS(tenant_id="alpha", role="viewer")))
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(db.calls, [])

    def test_action_analyst_update_remains_tenant_scoped(self):
        db = FakeDb(actions=[
            {"id": "action-1", "tenant_id": "alpha", "status": "open"},
            {"id": "action-1", "tenant_id": "beta", "status": "open"},
        ])
        route = load_route("actions.py", db)
        result = run(route["update_action"](
            "action-1",
            NS(status="completed", responsible=None, due_date=None,
               model_dump=lambda exclude_none=False: {"status": "completed", "responsible": None, "due_date": None}),
            NS(tenant_id="alpha", role="analyst")))
        self.assertEqual(result["status"], "completed")
        self.assertEqual(db.tables["corrective_actions"][1]["status"], "open")
        self.assertIn(("tenant_id", "alpha"), db.calls[-1][-1])

    def test_nonexistent_action_fails_closed_404(self):
        db = FakeDb()
        route = load_route("actions.py", db)
        with self.assertRaises(HttpError) as exc:
            run(route["update_action"](
                "unknown", NS(status="completed", responsible=None, due_date=None,
                    model_dump=lambda exclude_none=False: {"status": "completed", "responsible": None, "due_date": None}),
                NS(tenant_id="alpha", role="analyst")))
        self.assertEqual(exc.exception.status_code, 404)

    def test_recalculate_viewer_denied_before_db(self):
        db = FakeDb()
        route = load_route("analyses.py", db)
        with self.assertRaises(HttpError) as exc:
            run(route["recalculate_analysis"](
                "not-owned", NS(field="perception_code"), NS(tenant_id="alpha", role="viewer")))
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(db.calls, [])

    def test_revert_edit_viewer_denied_before_db(self):
        db = FakeDb()
        route = load_route("analyses.py", db)
        with self.assertRaises(HttpError) as exc:
            run(route["revert_edit"](
                "analysis-1", "edit-1", NS(tenant_id="alpha", role="viewer")))
        self.assertEqual(exc.exception.status_code, 403)
        self.assertEqual(db.calls, [])

    def test_recalculate_missing_or_foreign_analysis_denied(self):
        db = FakeDb()
        route = load_route("analyses.py", db)
        with self.assertRaises(HttpError) as exc:
            run(route["recalculate_analysis"](
                "foreign", NS(field="perception_code"), NS(tenant_id="alpha", role="admin")))
        self.assertEqual(exc.exception.status_code, 404)
        self.assertIn(("tenant_id", "alpha"), db.calls[-1][-1])


if __name__ == "__main__":
    unittest.main()
