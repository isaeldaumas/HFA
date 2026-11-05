import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user, get_authorized_user
from app.api.authoritative_user import resolve_authorized_user, AuthorizationBindingError
from app.database import get_supabase_client, get_supabase_admin

router = APIRouter(prefix="/auth", tags=["auth"])

def _tenant_defaults(_email: str) -> dict:
    """Public self-signup never grants an Enterprise plan by email.

    Enterprise provisioning must be an explicitly authorized platform action.
    """
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
    """Legacy self-signup — reject duplicates before DB writes, bind Auth ID.

    Auth signup comes before tenant creation to avoid orphan tenant creation
    when signup is rejected. The response may require email verification,
    depending on the Supabase project settings. If a later database insert
    fails, the user can return via the authenticated OAuth/bootstrap route;
    we never delete Auth users as an unsafe compensation.
    """
    email = str(data.email).strip().lower()
    company_name = data.company_name.strip()
    slug = data.slug.strip().lower()
    # Input validation must precede the Auth sign-up call. Otherwise a bad
    # slug or blank company creates an Auth identity with no business record.
    if not company_name or len(company_name) > 255:
        raise HTTPException(status_code=400, detail="Nome da empresa inválido")
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", slug):
        raise HTTPException(status_code=400, detail="Identificador da empresa inválido")

    admin = get_supabase_admin()
    try:
        existing = (
            admin.table("users").select("id")
            .eq("email", email).limit(2).execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Cadastro temporariamente indisponível") from exc
    if getattr(existing, "error", None):
        raise HTTPException(status_code=503, detail="Cadastro temporariamente indisponível")
    if existing.data:
        raise HTTPException(status_code=409, detail="Cadastro já existente")

    client = get_supabase_client()
    try:
        signup_result = client.auth.sign_up({
            "email": email,
            "password": data.password,
            # No tenant/role fields in mutable auth user_metadata.
        })
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Não foi possível iniciar o cadastro") from exc

    signed_user = getattr(signup_result, "user", None)
    signed_id = getattr(signed_user, "id", None)
    identities = getattr(signed_user, "identities", None)
    signed_email = (getattr(signed_user, "email", "") or "").strip().lower()
    # Supabase may return an obfuscated user for an already registered email
    # when email confirmation is enabled. Never provision it as a new tenant.
    if not signed_id or not identities or signed_email != email:
        raise HTTPException(status_code=409, detail="Não foi possível concluir o cadastro")

    try:
        new_tenant = admin.table("tenants").insert({
            "name": company_name,
            "slug": slug,
            **_tenant_defaults(email),
        }).execute()
        if getattr(new_tenant, "error", None) or not new_tenant.data:
            raise ValueError("Tenant insert did not return a row")
        tenant_id = new_tenant.data[0]["id"]

        new_user = admin.table("users").insert({
            "id": str(signed_id),
            "auth_user_id": str(signed_id),
            "tenant_id": tenant_id,
            "email": email,
            "full_name": email.split("@")[0],
            "role": "admin",
            "is_active": True,
        }).execute()
        if getattr(new_user, "error", None) or not new_user.data:
            raise ValueError("User insert did not return a row")
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Cadastro iniciado; vínculo empresarial pendente de confirmação",
        ) from exc

    return {
        "message": "Cadastro iniciado. Confirme seu e-mail, se solicitado.",
        "tenant_id": tenant_id,
    }


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
