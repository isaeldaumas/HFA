from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_authorized_user
from app.database import get_supabase_admin
from postgrest.exceptions import APIError

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
async def create_event(data: EventInput, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    # public.users is already resolved and active by the server-side
    # database authorization dependency. Never bootstrap from untrusted metadata,
    # nor re-bind by an unconfirmed email during event submission.
    submitted_by_id = user.public_user_id

    # Verifica créditos (enterprise plan = ilimitado)
    tenant = admin.table("tenants")\
        .select("plan, credits_balance")\
        .eq("id", tenant_id)\
        .single()\
        .execute()

    is_enterprise = tenant.data.get("plan") == "enterprise" or tenant.data.get("credits_balance") == -1
    if not is_enterprise and tenant.data["credits_balance"] < 1:
        raise HTTPException(402, "Créditos insuficientes")

    # Cria evento
    try:
        event = admin.table("events").insert({
            "tenant_id": tenant_id,
            "submitted_by": submitted_by_id,
            "title": data.title,
            "raw_input": data.raw_input,
            "input_type": data.input_type,
            "operation_type": data.operation_type,
            "aircraft_type": data.aircraft_type,
            "status": "received"
        }).execute()
    except APIError as e:
        raise HTTPException(status_code=400, detail=f"Falha ao criar evento: {str(e)}")

    event_id = event.data[0]["id"]

    # Debita crédito (enterprise = sem débito)
    if not is_enterprise:
        admin.table("tenants")\
            .update({"credits_balance": tenant.data["credits_balance"] - 1})\
            .eq("id", tenant_id)\
            .execute()

    admin.table("credit_transactions").insert({
        "tenant_id": tenant_id,
        "user_id": submitted_by_id,
        "type": "consumption",
        "amount": -1,
        "event_id": event_id,
        "description": f"Análise SERA: {data.title}"
    }).execute()

    # Dispara análise em background
    from app.sera.pipeline import run_analysis
    import asyncio
    asyncio.create_task(run_analysis(event_id, data.raw_input, tenant_id))

    return {"event_id": event_id, "status": "received"}


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
