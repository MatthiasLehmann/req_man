"""
API-Router für Validierungsoperationen (Konzept 2).

Endpunkte:
  POST   /api/projects/{pid}/items/{uid}/validate          – Validierung erstellen
  GET    /api/projects/{pid}/items/{uid}/validations        – History eines Items
  GET    /api/projects/{pid}/items/{uid}/validations/latest – Neueste Validierung
  GET    /api/projects/{pid}/validations                    – Alle Validierungen im Projekt
  GET    /api/projects/{pid}/git/log                        – Git-Log des Projekts
"""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import doorstop_service as ds
import git_service
import validation_service as vs
from auth import get_current_user, require_editor
from database import User

router = APIRouter(prefix="/api/projects/{project_id}", tags=["validation"])


# ─── Request / Response Models ────────────────────────────────────────────────

class ChecklistItem(BaseModel):
    value: bool
    note: Optional[str] = ""
    refs: Optional[List[str]] = None
    applicable: Optional[bool] = True
    coverage_percent: Optional[int] = None
    test_run_id: Optional[str] = None
    reviewer_username: Optional[str] = None
    reviewer_display_name: Optional[str] = None
    review_date: Optional[str] = None


class ValidationCreate(BaseModel):
    status: str                          # APPROVED | REJECTED | NEEDS_REVISION
    checklist: Dict[str, ChecklistItem]
    summary: str
    skip_doorstop_check: bool = False    # Für Projekte ohne vollst. doorstop-Baum


class ValidationCreateResponse(BaseModel):
    validation_id: str
    commit_hash: str
    commit_hash_short: str
    report_path: str
    status: str


class ValidationStatusResponse(BaseModel):
    """Kompakter Status für die ItemEditor-Anzeige."""
    status: Optional[str] = None          # APPROVED | REJECTED | NEEDS_REVISION | None
    validation_date: Optional[str] = None
    validator_username: Optional[str] = None
    validator_display_name: Optional[str] = None
    fingerprint_is_current: bool = False
    validation_id: Optional[str] = None
    commit_hash: Optional[str] = None


# ─── Endpunkte ────────────────────────────────────────────────────────────────

@router.post(
    "/items/{uid}/validate",
    response_model=ValidationCreateResponse,
    status_code=201,
)
async def create_validation(
    project_id: str,
    uid: str,
    body: ValidationCreate,
    current_user: User = Depends(require_editor),
):
    """Erstellt einen Validierungsreport und committet ihn in Git."""
    if not ds.get_item(project_id, uid):
        raise HTTPException(status_code=404, detail="Anforderung nicht gefunden")

    if body.status not in ("APPROVED", "REJECTED", "NEEDS_REVISION"):
        raise HTTPException(
            status_code=422,
            detail="Ungültiger Status. Erlaubt: APPROVED, REJECTED, NEEDS_REVISION",
        )

    if not body.summary.strip():
        raise HTTPException(status_code=422, detail="Zusammenfassung darf nicht leer sein")

    try:
        result = vs.create_validation(
            project_id=project_id,
            item_uid=uid,
            status=body.status,
            checklist={
                k: v.model_dump(exclude_none=True)
                for k, v in body.checklist.items()
            },
            summary=body.summary.strip(),
            validator_username=current_user.username,
            validator_display_name=current_user.full_name,
            validator_email=current_user.email,
            skip_doorstop_check=body.skip_doorstop_check,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/items/{uid}/validations/latest", response_model=ValidationStatusResponse)
async def get_latest_validation(
    project_id: str,
    uid: str,
    current_user: User = Depends(get_current_user),
):
    """Gibt den aktuellen Validierungsstatus eines Items zurück."""
    latest = vs.get_latest_validation(project_id, uid)
    if not latest:
        return ValidationStatusResponse()

    stored_fp = latest.get("requirement_text_hash", "")
    is_current = vs.fingerprint_is_current(project_id, uid, stored_fp)

    validator = latest.get("validator", {})
    return ValidationStatusResponse(
        status=latest.get("status"),
        validation_date=latest.get("validation_date"),
        validator_username=validator.get("username"),
        validator_display_name=validator.get("display_name"),
        fingerprint_is_current=is_current,
        validation_id=latest.get("validation_id"),
    )


@router.get("/items/{uid}/validations")
async def list_validations(
    project_id: str,
    uid: str,
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Gibt alle Validierungsreports eines Items zurück (neueste zuerst)."""
    return vs.get_validation_history(project_id, uid)


@router.get("/validations")
async def list_all_validations(
    project_id: str,
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Gibt alle Validierungsreports des Projekts zurück."""
    return vs.get_all_validations(project_id)


@router.get("/git/log")
async def get_git_log(
    project_id: str,
    max_count: int = 50,
    current_user: User = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Gibt die letzten Commits des Projekt-Git-Repos zurück."""
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return git_service.get_repo_log(project["path"], max_count=max_count)


@router.get("/git/status")
async def get_git_status(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Gibt zurück ob das Projekt ein Git-Repo hat."""
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return {"has_git": git_service.is_git_repo(project["path"])}
