from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.deps import get_authorized_user
from app.database import get_supabase_admin
import os
from app.config import settings

router = APIRouter(prefix="/credits", tags=["credits"])


class AddCreditsInput(BaseModel):
    amount: int
    description: str = "Compra de créditos"


@router.get("/packages")
async def list_packages():
    admin = get_supabase_admin()
    result = admin.table("credit_packages")\
        .select("*")\
        .eq("is_active", True)\
        .execute()
    return result.data


@router.get("/balance")
async def get_balance(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("tenants")\
        .select("credits_balance")\
        .eq("id", tenant_id)\
        .single()\
        .execute()
    return {"balance": result.data["credits_balance"]}


@router.get("/ai/providers")
async def list_providers():
    """Mostra providers disponíveis e qual está ativo."""
    return {
        "active": settings.AI_PROVIDER,
        "available": {
            "google":    { "model": settings.GOOGLE_MODEL,    "key_set": bool(settings.GOOGLE_API_KEY),    "free": True },
            "groq":      { "model": settings.GROQ_MODEL,      "key_set": bool(settings.GROQ_API_KEY),      "free": True },
            "anthropic": { "model": settings.ANTHROPIC_MODEL, "key_set": bool(settings.ANTHROPIC_API_KEY), "free": False },
            "openai":    { "model": settings.OPENAI_MODEL,    "key_set": bool(settings.OPENAI_API_KEY),    "free": False },
        }
    }
