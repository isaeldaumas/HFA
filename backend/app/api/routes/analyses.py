import json
import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_authorized_user
from app.database import get_supabase_admin

router = APIRouter(prefix="/analyses", tags=["analyses"])


class RecalculateRequest(BaseModel):
    step_altered: str          # "2", "3", "4", "5"
    field: str                 # "perception_code", "objective_code", etc.
    new_value: str
    new_justification: Optional[str] = ""
    reason: Optional[str] = ""


@router.get("/")
async def list_analyses(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("analyses")\
        .select("*, events(title, occurred_at, operation_type, aircraft_type)")\
        .eq("tenant_id", tenant_id)\
        .order("created_at", desc=True)\
        .execute()
    return result.data


@router.get("/risk-profile")
async def risk_profile(user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("analyses")\
        .select("perception_code, objective_code, action_code, preconditions")\
        .eq("tenant_id", tenant_id)\
        .execute()

    # Agrega frequências
    from collections import Counter
    perception = Counter()
    objective = Counter()
    action = Counter()
    preconditions = Counter()

    for r in result.data:
        if r["perception_code"]:
            perception[r["perception_code"]] += 1
        if r["objective_code"]:
            objective[r["objective_code"]] += 1
        if r["action_code"]:
            action[r["action_code"]] += 1
        if r["preconditions"]:
            for p in r["preconditions"]:
                preconditions[p.get("code")] += 1

    return {
        "total_analyses": len(result.data),
        "perception_failures": dict(perception.most_common()),
        "objective_failures": dict(objective.most_common()),
        "action_failures": dict(action.most_common()),
        "top_preconditions": dict(preconditions.most_common(10))
    }


@router.get("/{analysis_id}")
async def get_analysis(analysis_id: str, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("analyses")\
        .select("*, events(title, raw_input, occurred_at)")\
        .eq("id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    if not result.data:
        raise HTTPException(404, "Análise não encontrada")
    return result.data


@router.get("/{analysis_id}/pdf")
async def download_pdf(analysis_id: str, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("analyses")\
        .select("*, events(title, operation_type, aircraft_type)")\
        .eq("id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    if not result.data:
        raise HTTPException(404, "Análise não encontrada")

    analysis = result.data
    event = analysis.pop("events", {})

    try:
        from app.sera.pdf_generator import generate_pdf
        pdf_bytes = generate_pdf(analysis, event)
    except Exception as exc:
        raise HTTPException(500, f"Falha ao gerar PDF: {exc}")

    # Build filename: SERA_[EventoSlug]_[YYYY-MM-DD].pdf
    import re
    import datetime
    raw_title = event.get("title", "evento")
    slug = re.sub(r"[^\w\-]", "-", raw_title)[:40].strip("-")
    date_str = datetime.date.today().isoformat()
    filename = f"SERA_{slug}_{date_str}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=\"{filename}\""}
    )


@router.post("/{analysis_id}/recalculate")
async def recalculate_analysis(
    analysis_id: str,
    body: RecalculateRequest,
    user=Depends(get_authorized_user),
):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id

    result = admin.table("analyses")\
        .select("*, events(raw_input)")\
        .eq("id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    if not result.data:
        raise HTTPException(404, "Análise não encontrada")

    analysis = result.data
    event = analysis.pop("events", {}) or {}
    raw_input = event.get("raw_input", "")

    from app.sera.recalculate import recalculate, DEPENDENCY_MAP

    # Capture before values for history
    field_map = {
        "perception_code": analysis.get("perception_code"),
        "objective_code":  analysis.get("objective_code"),
        "action_code":     analysis.get("action_code"),
        "escape_point":    analysis.get("escape_point"),
        "unsafe_act":      analysis.get("unsafe_act"),
    }
    value_before = field_map.get(body.field, analysis.get(body.field))

    try:
        result_data = recalculate(
            analysis=analysis,
            raw_input=raw_input,
            step_altered=body.step_altered,
            field=body.field,
            new_value=body.new_value,
            new_justification=body.new_justification or "",
        )
    except Exception as exc:
        raise HTTPException(500, f"Erro no recálculo: {exc}")

    updates = result_data["updates"]
    updates["edited_at"] = datetime.datetime.utcnow().isoformat()
    updates["edit_count"] = (analysis.get("edit_count") or 0) + 1

    # Persist updated analysis
    admin.table("analyses").update(updates).eq("id", analysis_id).execute()

    # Record edit history
    dep = DEPENDENCY_MAP.get(body.step_altered, {})
    edit_record = {
        "analysis_id":        analysis_id,
        "tenant_id":          tenant_id,
        "step_altered":       body.step_altered,
        "field_changed":      body.field,
        "value_before":       json.dumps(value_before) if value_before else None,
        "value_after":        json.dumps(body.new_value),
        "steps_recalculated": dep.get("recalculate", []),
        "steps_preserved":    dep.get("preserve", []),
        "reason":             body.reason or None,
    }
    edit_res = admin.table("analysis_edits").insert(edit_record).execute()

    # Return fresh analysis
    fresh = admin.table("analyses").select("*").eq("id", analysis_id).single().execute()
    return {
        "analysis": fresh.data,
        "edit": edit_res.data[0] if edit_res.data else edit_record,
        "steps_recalculated": result_data["steps_recalculated"],
        "steps_preserved": result_data["steps_preserved"],
    }


@router.get("/{analysis_id}/edits")
async def list_edits(analysis_id: str, user=Depends(get_authorized_user)):
    admin = get_supabase_admin()
    tenant_id = user.tenant_id
    result = admin.table("analysis_edits")\
        .select("*")\
        .eq("analysis_id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .order("created_at", desc=True)\
        .execute()
    return result.data


@router.delete("/{analysis_id}/edits/{edit_id}")
async def revert_edit(
    analysis_id: str,
    edit_id: str,
    user=Depends(get_authorized_user),
):
    """Revert a manual edit by re-running recalculate with the before value."""
    admin = get_supabase_admin()
    tenant_id = user.tenant_id

    edit_res = admin.table("analysis_edits")\
        .select("*")\
        .eq("id", edit_id)\
        .eq("analysis_id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    if not edit_res.data:
        raise HTTPException(404, "Edição não encontrada")

    edit = edit_res.data
    value_before = edit.get("value_before")
    if value_before is None:
        raise HTTPException(400, "Não há valor anterior para reverter")

    if isinstance(value_before, str):
        try:
            value_before = json.loads(value_before)
        except Exception:
            pass

    # Fetch current analysis
    analysis_res = admin.table("analyses")\
        .select("*, events(raw_input)")\
        .eq("id", analysis_id)\
        .eq("tenant_id", tenant_id)\
        .single()\
        .execute()
    analysis = analysis_res.data
    event = analysis.pop("events", {}) or {}
    raw_input = event.get("raw_input", "")

    from app.sera.recalculate import recalculate

    try:
        result_data = recalculate(
            analysis=analysis,
            raw_input=raw_input,
            step_altered=edit["step_altered"],
            field=edit["field_changed"],
            new_value=str(value_before),
        )
    except Exception as exc:
        raise HTTPException(500, f"Erro ao reverter: {exc}")

    updates = result_data["updates"]
    updates["edited_at"] = datetime.datetime.utcnow().isoformat()
    updates["edit_count"] = max(0, (analysis.get("edit_count") or 1) - 1)

    admin.table("analyses").update(updates).eq("id", analysis_id).execute()
    admin.table("analysis_edits").delete().eq("id", edit_id).execute()

    fresh = admin.table("analyses").select("*").eq("id", analysis_id).single().execute()
    return {"analysis": fresh.data, "reverted_edit_id": edit_id}


@router.get("/{analysis_id}/flows")
async def get_analysis_flows(analysis_id: str, current_user=Depends(get_authorized_user)):
    from app.sera.flow_renderer import (
        build_perception_mermaid,
        build_objective_mermaid,
        build_action_mermaid,
    )
    admin = get_supabase_admin()
    r = admin.table("analyses").select("*").eq("id", analysis_id).eq("tenant_id", current_user.tenant_id).single().execute()
    a = r.data
    if not a:
        raise HTTPException(404, "Análise não encontrada")

    # *_discarded is a JSONB column — already parsed by the Supabase client
    def _disc(raw) -> dict:
        if not raw:
            return {}
        if isinstance(raw, str):
            return json.loads(raw)
        return raw  # already a dict (JSONB)

    perception_disc = _disc(a.get("perception_discarded"))
    objective_disc  = _disc(a.get("objective_discarded"))
    action_disc     = _disc(a.get("action_discarded"))

    perception_flow = {"codigo": a.get("perception_code"), **perception_disc}
    objective_flow  = {"codigo": a.get("objective_code"),  **objective_disc}
    action_flow     = {"codigo": a.get("action_code"),     **action_disc}

    return {
        "perception": {
            "mermaid":            build_perception_mermaid(perception_flow),
            "codigo":             a.get("perception_code"),
            "nos_percorridos":    perception_disc.get("nos_percorridos", []),
            "falhas_descartadas": perception_disc.get("falhas_descartadas", ""),
        },
        "objective": {
            "mermaid":            build_objective_mermaid(objective_flow),
            "codigo":             a.get("objective_code"),
            "nos_percorridos":    objective_disc.get("nos_percorridos", []),
            "falhas_descartadas": objective_disc.get("falhas_descartadas", ""),
        },
        "action": {
            "mermaid":            build_action_mermaid(action_flow),
            "codigo":             a.get("action_code"),
            "nos_percorridos":    action_disc.get("nos_percorridos", []),
            "falhas_descartadas": action_disc.get("falhas_descartadas", ""),
        },
    }
