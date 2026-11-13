"""
API-Router für den Vorschlags-Eingang (A6).

Endpunkte (Präfix /api/projects/{pid}/proposals):
  GET   ""            – Vorschläge (Filter status, uid)
  GET   "/count"      – Zahl offener Vorschläge
  POST  ""            – Vorschlag anlegen (jeder angemeldete Benutzer; ändert nichts)
  POST  "/{id}/accept" – übernehmen (editor/admin)
  POST  "/{id}/reject" – ablehnen (editor/admin)
"""
import json
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import proposals_service as svc
from auth import get_current_user, require_editor
from database import Proposal, User, get_db

router = APIRouter(prefix="/api/projects/{project_id}/proposals", tags=["proposals"])


class ProposalCreate(BaseModel):
    kind: str = Field(description="change_text | new_item | add_link")
    reason: str = Field(min_length=10, description="Begründung (mindestens 10 Zeichen)")
    source: str = "mcp"
    uid: Optional[str] = None
    prefix: Optional[str] = None
    new_text: Optional[str] = None
    text: Optional[str] = None
    links: Optional[List[str]] = None
    target_uid: Optional[str] = None


class ProposalResponse(BaseModel):
    id: int
    project_id: str
    kind: str
    uid: Optional[str] = None
    prefix: Optional[str] = None
    reason: str
    source: str
    status: str
    old_text: Optional[str] = None
    new_text: Optional[str] = None
    text: Optional[str] = None
    links: Optional[List[str]] = None
    target_uid: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None


class ProposalCount(BaseModel):
    open: int


def _to_response(p: Proposal) -> ProposalResponse:
    payload = json.loads(p.payload or "{}")
    return ProposalResponse(
        id=p.id, project_id=p.project_id, kind=p.kind, uid=p.uid, prefix=p.prefix, reason=p.reason,
        source=p.source, status=p.status, old_text=payload.get("old_text"), new_text=payload.get("new_text"),
        text=payload.get("text"), links=payload.get("links"), target_uid=payload.get("target_uid"),
        created_by=p.created_by, created_at=p.created_at, decided_by=p.decided_by, decided_at=p.decided_at,
    )


def _guard(fn):
    try:
        return fn()
    except svc.ProposalConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "nicht gefunden" in msg or "not found" in msg else 400, detail=msg)


@router.get("", response_model=List[ProposalResponse])
async def list_proposals(project_id: str, status: Optional[str] = None, uid: Optional[str] = None,
                         db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return [_to_response(p) for p in svc.list_proposals(db, project_id, status, uid)]


@router.get("/count", response_model=ProposalCount)
async def count_open(project_id: str, db: Session = Depends(get_db),
                     current_user: User = Depends(get_current_user)):
    return ProposalCount(open=svc.count_open(db, project_id))


@router.post("", response_model=ProposalResponse, status_code=201)
async def create_proposal(project_id: str, body: ProposalCreate, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    p = _guard(lambda: svc.create(
        db, project_id, body.kind, current_user.username, body.reason, body.source, uid=body.uid,
        prefix=body.prefix, new_text=body.new_text, text=body.text, links=body.links, target_uid=body.target_uid))
    return _to_response(p)


@router.post("/{proposal_id}/accept", response_model=ProposalResponse)
async def accept_proposal(project_id: str, proposal_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(require_editor)):
    return _to_response(_guard(lambda: svc.accept(db, project_id, proposal_id, current_user.username)))


@router.post("/{proposal_id}/reject", response_model=ProposalResponse)
async def reject_proposal(project_id: str, proposal_id: int, db: Session = Depends(get_db),
                          current_user: User = Depends(require_editor)):
    return _to_response(_guard(lambda: svc.reject(db, project_id, proposal_id, current_user.username)))
