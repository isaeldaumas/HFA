from fastapi import Header, HTTPException, Depends
from supabase import Client
from app.database import get_supabase_client, get_supabase_admin
from app.api.authoritative_user import resolve_authorized_user, AuthorizationBindingError


async def get_current_user(authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token inválido")
    token = authorization.split(" ")[1]
    client = get_supabase_client()
    try:
        user = client.auth.get_user(token)
        return user
    except Exception:
        raise HTTPException(status_code=401, detail="Não autorizado")



async def get_authorized_user(user=Depends(get_current_user)):
    """Resolve database-bound tenant and role after validating the bearer JWT."""
    try:
        return resolve_authorized_user(get_supabase_admin(), user.user)
    except AuthorizationBindingError as exc:
        detail = (
            "Não foi possível verificar a autorização"
            if exc.status_code == 503 else "Acesso negado"
        )
        raise HTTPException(status_code=exc.status_code, detail=detail) from exc
