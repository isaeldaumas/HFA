from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user, get_authorized_user
from app.api.authoritative_user import resolve_authorized_user, AuthorizationBindingError
from app.database import get_supabase_client, get_supabase_admin

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginInput(BaseModel):
    email: EmailStr
    password: str


@router.post("/register", status_code=410)
async def register():
    """Disable legacy public signup; canonical Next.js owns enrollment.

    The old Python path bypassed the canonical signup WAF and could leave
    an orphan Auth identity or tenant after partial Supabase failures.
    """
    raise HTTPException(
        status_code=410,
        detail="Cadastro legado indisponível. Utilize /api/auth/register no HFA.",
    )


@router.post("/login")
async def login(data: LoginInput):
    client = get_supabase_client()
    result = client.auth.sign_in_with_password({
        "email": data.email,
        "password": data.password
    })
    return {
        "access_token": result.session.access_token,
        "user": result.user.email
    }


@router.get("/me")
async def get_me(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    tenant = admin.table("tenants").select("plan, credits_balance").eq("id", tenant_id).single().execute()
    if not tenant.data:
        raise HTTPException(status_code=403, detail="Acesso negado")
    plan = tenant.data.get("plan", "free")
    credits_balance = tenant.data.get("credits_balance", 0)
    role = user.role
    # Tenant admin is a tenant permission, independent of Enterprise billing.
    # This flag must NEVER be used as a global platform-admin permission.
    is_admin = role == "admin"
    return {
        "plan": plan,
        "credits_balance": "unlimited" if credits_balance == -1 else credits_balance,
        "role": role,
        "is_admin": is_admin,
    }


@router.post("/oauth/bootstrap")
async def oauth_bootstrap(user=Depends(get_current_user)):
    """Read an existing DB-bound profile; do not provision a legacy tenant.

    Supabase Auth has already validated the bearer session. Enrollment of a
    new identity is exclusively handled by the Next.js bootstrap endpoint.
    """
    admin = get_supabase_admin()
    auth_user = user.user

    try:
        existing = resolve_authorized_user(admin, auth_user)
        return {"ok": True, "tenant_id": existing.tenant_id, "created": False}
    except AuthorizationBindingError as exc:
        if exc.code != "ACCOUNT_NOT_FOUND_OR_AMBIGUOUS":
            status = exc.status_code
            raise HTTPException(
                status_code=status,
                detail="Não foi possível validar a identidade" if status == 503 else "Acesso negado",
            ) from exc

    # Existing users are resolved above without a database write.
    # Canonical Next.js bootstrap owns all new tenant provisioning.
    raise HTTPException(
        status_code=410,
        detail="Bootstrap legado indisponível. Utilize /api/auth/oauth/bootstrap no HFA.",
    )
