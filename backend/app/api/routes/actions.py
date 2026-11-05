from fastapi import APIRouter, Depends, HTTPException
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
    # Reading actions is tenant-scoped; updating requires an editing role.
    if user.role not in {"admin", "analyst"}:
        raise HTTPException(status_code=403, detail="Edição não autorizada")
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    update_data = data.model_dump(exclude_none=True)
    if data.status == "completed":
        from datetime import datetime, timezone
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = admin.table("corrective_actions")\
            .update(update_data)\
            .eq("id", action_id)\
            .eq("tenant_id", tenant_id)\
            .execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Ação temporariamente indisponível") from exc
    if getattr(result, "error", None):
        raise HTTPException(status_code=503, detail="Ação temporariamente indisponível")
    if not result.data:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    return result.data[0]
