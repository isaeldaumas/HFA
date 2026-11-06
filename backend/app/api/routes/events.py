from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_authorized_user
from app.database import get_supabase_admin

router = APIRouter(prefix="/events", tags=["events"])


class EventInput(BaseModel):
    title: str
    raw_input: str
    input_type: str = "text"
    operation_type: Optional[str] = None
    aircraft_type: Optional[str] = None
    occurred_at: Optional[str] = None


@router.get("/")
async def list_events(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("events")\
        .select("*")\
        .eq("tenant_id", tenant_id)\
        .order("created_at", desc=True)\
        .execute()
    return result.data


@router.post("/")
async def create_event():
    """Retired: canonical Next.js /api/events is the only event enrollment path.

    The old Python handler changed tenants.credits_balance and then inserted
    credit_transactions in unrelated requests, allowing lost updates,
    duplicate debits and unsafe background scientific execution.
    Never fall back to a non-atomic path if the V31 RPC is unavailable.
    """
    raise HTTPException(
        status_code=410,
        detail="Registro de eventos descontinuado nesta API; utilize /api/events na origem HFA.",
    )


@router.get("/{event_id}")
async def get_event(event_id: str, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("events")\
        .select("*, analyses(*)")\
        .eq("id", event_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    if not result.data:
        raise HTTPException(404, "Evento não encontrado")
    return result.data
