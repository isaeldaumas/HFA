from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_authorized_user
from app.database import get_supabase_admin

router = APIRouter(prefix="/actions", tags=["actions"])


class ActionUpdate(BaseModel):
    status: Optional[str] = None
    responsible: Optional[str] = None
    due_date: Optional[str] = None


@router.get("/")
async def list_actions(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("corrective_actions")\
        .select("*")\
        .eq("tenant_id", tenant_id)\
        .order("created_at", desc=True)\
        .execute()
    return result.data


@router.patch("/{action_id}")
async def update_action(action_id: str, data: ActionUpdate, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if data.status == "completed":
        from datetime import datetime
        update_data["completed_at"] = datetime.utcnow().isoformat()
    result = admin.table("corrective_actions")\
        .update(update_data)\
        .eq("id", action_id)\
        .eq("tenant_id", tenant_id)\
        .execute()
    return result.data[0]
