import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user, get_authorized_user
from app.api.authoritative_user import resolve_authorized_user, AuthorizationBindingError
from app.database import get_supabase_client, get_supabase_admin

router = APIRouter(prefix="/auth", tags=["auth"])

ENTERPRISE_EMAIL = "filipe.daumas@icloud.com"


def _tenant_defaults(email: str) -> dict:
    if email == ENTERPRISE_EMAIL:
        return {"plan": "enterprise", "credits_balance": -1}
    return {"plan": "free", "credits_balance": 5}


class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    company_name: str
    slug: str


class LoginInput(BaseModel):
    email: EmailStr
    password: str


@router.post("/register")
async def register(data: RegisterInput):
    admin = get_supabase_admin()
    # Cria tenant
    tenant = admin.table("tenants").insert({
        "name": data.company_name,
        "slug": data.slug,
        **_tenant_defaults(data.email),
    }).execute()

    if not tenant.data:
        raise HTTPException(400, "Erro ao criar empresa")

    tenant_id = tenant.data[0]["id"]

    # Cria usuário no Supabase Auth
    client = get_supabase_client()
    client.auth.sign_up({
        "email": data.email,
        "password": data.password,
        "options": {
            "data": {
                "tenant_id": tenant_id,
                "role": "admin"
            }
        }
    })

    # Cria registro na tabela users
    admin.table("users").insert({
        "tenant_id": tenant_id,
        "email": data.email,
        "full_name": data.email.split("@")[0],
        "role": "admin"
    }).execute()

    return {"message": "Conta criada com sucesso", "tenant_id": tenant_id}


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
    # Tenant administrator privilege does not imply global platform privilege.
    is_admin = role == "admin" and plan == "enterprise"
    return {
        "plan": plan,
        "credits_balance": "unlimited" if credits_balance == -1 else credits_balance,
        "role": role,
        "is_admin": is_admin,
    }


@router.post("/oauth/bootstrap")
async def oauth_bootstrap(user=Depends(get_current_user)):
    """Provision a new OAuth user without trusting user-editable metadata.

    Auth.getUser verified the bearer JWT. An existing binding is taken only
    from the database. A new tenant can be created only for an identity with
    a confirmed email and no pre-existing or ambiguous public.users binding.
    """
    admin = get_supabase_admin()
    auth_user = user.user
    uid = str(auth_user.id)

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

    # The resolver reports the same NOT_FOUND code when no public user is
    # found; ambiguous matches MUST NOT be treated as permission to create.
    email = (getattr(auth_user, "email", None) or "").strip().lower()
    if not email or not getattr(auth_user, "email_confirmed_at", None):
        raise HTTPException(status_code=403, detail="Email não confirmado")

    # Explicitly disallow onboarding if an email row already exists. This
    # check does not bind accounts by user_metadata or by caller-supplied ID.
    matches = (admin.table("users").select("id").eq("email", email).limit(2).execute())
    if getattr(matches, "error", None):
        raise HTTPException(status_code=503, detail="Cadastro indisponível")
    if matches.data:
        raise HTTPException(status_code=403, detail="Associação de conta existente requer revisão")

    local = email.split("@")[0] or "user"
    base_slug = re.sub(r"[^a-z0-9-]", "-", local.lower()).strip("-") or "org"
    slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"

    tenant = admin.table("tenants").insert({
        "name": local[:255],
        "slug": slug,
        **_tenant_defaults(email),
    }).execute()
    if not tenant.data:
        raise HTTPException(status_code=500, detail="Falha ao criar empresa")

    tenant_id = tenant.data[0]["id"]
    # DB-bound identity, not user_metadata. A registration with a conflicting
    # id/email must fail instead of linking an unrelated tenant.
    user_record = admin.table("users").insert({
        "id": uid,
        "auth_user_id": uid,
        "tenant_id": tenant_id,
        "email": email,
        "full_name": local[:255],
        "role": "admin",
        "is_active": True,
    }).execute()
    if not user_record.data:
        raise HTTPException(status_code=503, detail="Cadastro pendente de revisão")
    return {"ok": True, "tenant_id": tenant_id, "created": True}
