"""FastAPI TestClient contracts against the *real* Python handlers.

Runs with FastAPI, Supabase Python and httpx in an isolated local Python 3.12
environment; DB/Auth methods are replaced with deterministic in-memory fakes.
No external HTTP, credential usage or database mutation.
"""
import os
import sys
import unittest
from types import SimpleNamespace as NS
from unittest.mock import patch

sys.path.insert(0, os.path.abspath("backend/tests"))
sys.path.insert(0, os.path.abspath("backend"))

from fastapi.testclient import TestClient
from app.api.deps import get_current_user, get_authorized_user
from main import app
from test_legacy_routes_hardening import FakeDb, signup_for, AUTH_1


class FastApiWireTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        app.dependency_overrides.clear()

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()

    def test_cross_project_vercel_origin_is_not_credentialed(self):
        malicious = self.client.options("/auth/me", headers={
            "Origin": "https://unrelated-app.vercel.app",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        })
        self.assertNotIn("access-control-allow-origin", malicious.headers)
        self.assertNotEqual(malicious.status_code, 200)

        allowed = self.client.options("/auth/me", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        })
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.headers.get("access-control-allow-origin"),
                         "http://localhost:3000")

    def test_real_register_bindings_and_free_entitlement(self):
        db = FakeDb()
        signup, calls = signup_for("test@syntheticmail.net")
        with (
            patch("app.api.routes.auth.get_supabase_admin", return_value=db),
            patch("app.api.routes.auth.get_supabase_client", return_value=NS(auth=NS(sign_up=signup))),
        ):
            response = self.client.post("/auth/register", json={
                "email": "test@syntheticmail.net",
                "password": "synthetic-password",
                "company_name": "Example Air",
                "slug": "example-air",
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(db.tables["tenants"][0]["plan"], "free")
        self.assertEqual(db.tables["users"][0]["auth_user_id"], AUTH_1)
        self.assertEqual(len(calls), 1)
        self.assertNotIn("options", calls[0])

    def test_real_register_invalid_slug_does_not_call_auth(self):
        db = FakeDb()
        signup, calls = signup_for()
        with (
            patch("app.api.routes.auth.get_supabase_admin", return_value=db),
            patch("app.api.routes.auth.get_supabase_client", return_value=NS(auth=NS(sign_up=signup))),
        ):
            response = self.client.post("/auth/register", json={
                "email": "new@syntheticmail.net", "password": "synthetic-password",
                "company_name": "Example Air", "slug": "../other",
            })
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(db.writes, [])
        self.assertEqual(calls, [])

    def test_real_register_obfuscated_identity_denied(self):
        db = FakeDb()
        signup, _ = signup_for(identities=False)
        with (
            patch("app.api.routes.auth.get_supabase_admin", return_value=db),
            patch("app.api.routes.auth.get_supabase_client", return_value=NS(auth=NS(sign_up=signup))),
        ):
            response = self.client.post("/auth/register", json={
                "email": "new@syntheticmail.net", "password": "synthetic-password",
                "company_name": "Example Air", "slug": "example-air",
            })
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(db.writes, [])

    def test_get_me_free_plan_tenant_admin_not_global(self):
        db = FakeDb(tenants=[{"id": "tenant-a", "plan": "free",
                              "credits_balance": 3, "is_active": True}])
        app.dependency_overrides[get_authorized_user] = lambda: NS(tenant_id="tenant-a", role="admin")
        with patch("app.api.routes.auth.get_supabase_admin", return_value=db):
            response = self.client.get("/auth/me")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["plan"], "free")
        self.assertTrue(response.json()["is_admin"])

    def test_patch_action_viewer_denied_on_wire(self):
        db = FakeDb(actions=[{"id": "a-1", "tenant_id": "alpha", "status": "open"}])
        app.dependency_overrides[get_authorized_user] = lambda: NS(tenant_id="alpha", role="viewer")
        with patch("app.api.routes.actions.get_supabase_admin", return_value=db):
            response = self.client.patch("/actions/a-1", json={"status": "completed"})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(db.calls, [])

    def test_patch_action_analyst_must_not_cross_tenant(self):
        db = FakeDb(actions=[{"id": "a-1", "tenant_id": "beta", "status": "open"}])
        app.dependency_overrides[get_authorized_user] = lambda: NS(tenant_id="alpha", role="analyst")
        with patch("app.api.routes.actions.get_supabase_admin", return_value=db):
            response = self.client.patch("/actions/a-1", json={"status": "completed"})
        self.assertEqual(response.status_code, 404, response.text)
        self.assertEqual(db.tables["corrective_actions"][0]["status"], "open")

    def test_recalculate_viewer_denied_and_analyst_foreign_denied(self):
        payload = {"step_altered": "2", "field": "perception_code", "new_value": "P-A"}
        db = FakeDb()
        app.dependency_overrides[get_authorized_user] = lambda: NS(tenant_id="alpha", role="viewer")
        with patch("app.api.routes.analyses.get_supabase_admin", return_value=db):
            denied_viewer = self.client.post("/analyses/foreign/recalculate", json=payload)
            self.assertEqual(denied_viewer.status_code, 403, denied_viewer.text)
            self.assertEqual(db.calls, [])
            app.dependency_overrides[get_authorized_user] = lambda: NS(tenant_id="alpha", role="analyst")
            denied_foreign = self.client.post("/analyses/foreign/recalculate", json=payload)
            self.assertEqual(denied_foreign.status_code, 404, denied_foreign.text)
        self.assertEqual(db.writes, [])

    def test_bootstrap_existing_identity_never_uses_forged_metadata(self):
        db = FakeDb(
            users=[{"id": AUTH_1, "auth_user_id": AUTH_1, "tenant_id": "legitimate",
                    "role": "viewer", "is_active": True, "email": "new@syntheticmail.net"}],
            tenants=[{"id": "legitimate", "is_active": True}],
        )
        app.dependency_overrides[get_current_user] = lambda: NS(
            user=NS(id=AUTH_1, email="new@syntheticmail.net",
                    email_confirmed_at="2026-11-05T10:00:00Z",
                    user_metadata={"tenant_id": "foreign-tenant", "role": "admin"}),
        )
        with patch("app.api.routes.auth.get_supabase_admin", return_value=db):
            response = self.client.post("/auth/oauth/bootstrap")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["tenant_id"], "legitimate")
        self.assertEqual(db.writes, [])


if __name__ == "__main__":
    unittest.main()
