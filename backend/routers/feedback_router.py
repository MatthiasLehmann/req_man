"""
API-Router für Rückmeldungen zu KI-Befunden (L2).

Endpunkte (Präfix /api/projects/{pid}/finding-feedback):
  GET    ""            – Urteile (Filter uid, only_mine)
  POST   ""            – Urteil abgeben „applies“ | „not_applies“ (editor/admin; ändert keine Anforderung)
  POST   "/sync-cases" – Fallspeicher aus Urteilen und angenommenen Vorschlägen neu abgleichen (editor/admin)
  DELETE "/{id}"       – eigenes Urteil zurücknehmen
"""
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import feedback_service as svc
from auth import get_current_user, require_editor
from database import FindingFeedback, User, get_db

router = APIRouter(prefix="/api/projects/{project_id}/finding-feedback", tags=["finding-feedback"])


class FeedbackCreate(BaseModel):
    uid: str
    category: str
    finding: str = Field(min_length=1, description="Befundtext (Beschreibung)")
    verdict: str = Field(description="applies | not_applies")


class FeedbackResponse(BaseModel):
    id: int
    project_id: str
    uid: str
    category: str
    finding: str
    requirement_text: str
    text_hash: str
    verdict: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None


class SyncResult(BaseModel):
    findings: int
    proposals: int


def _to_response(r: FindingFeedback) -> FeedbackResponse:
    return FeedbackResponse(id=r.id, project_id=r.project_id, uid=r.uid, category=r.category, finding=r.finding,
                            requirement_text=r.requirement_text, text_hash=r.text_hash, verdict=r.verdict,
                            created_by=r.created_by, created_at=r.created_at)


@router.get("", response_model=List[FeedbackResponse])
async def list_feedback(project_id: str, uid: Optional[str] = None, only_mine: bool = False,
                        db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = svc.list_feedback(db, project_id, uid, current_user.username if only_mine else None)
    return [_to_response(r) for r in rows]


@router.post("", response_model=FeedbackResponse, status_code=201)
async def create_feedback(project_id: str, body: FeedbackCreate, db: Session = Depends(get_db),
                          current_user: User = Depends(require_editor)):
    try:
        row = svc.record(db, project_id, body.uid, body.category, body.finding, body.verdict, current_user.username)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "nicht gefunden" in msg else 400, detail=msg)
    return _to_response(row)


@router.post("/sync-cases", response_model=SyncResult)
async def sync_cases(project_id: str, db: Session = Depends(get_db), current_user: User = Depends(require_editor)):
    try:
        return SyncResult(**svc.sync_cases(db, project_id))
    except Exception as e:  # noqa: BLE001 – z. B. Ollama nicht erreichbar
        raise HTTPException(status_code=503, detail=str(e))


@router.delete("/{feedback_id}", status_code=204)
async def delete_feedback(project_id: str, feedback_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(require_editor)):
    try:
        svc.withdraw(db, project_id, feedback_id, current_user.username, getattr(current_user, "role", "") == "admin")
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
