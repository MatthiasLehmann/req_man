"""
API-Router für den Obsidian-Export (B1).

Endpunkte (Präfix /api/projects/{pid}/obsidian):
  POST  /export  – Projekt als Obsidian-Ordner schreiben (Abgleich per Hash)
  GET   /status  – Ziel, Zahl der Dateien, ausstehende Änderungen
  POST  /import-changes – Änderungen aus Obsidian als Vorschläge ablegen (B2, nur editor/admin)
"""
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import obsidian_service as svc
from auth import get_current_user, require_editor
from database import User, get_db

router = APIRouter(prefix="/api/projects/{project_id}/obsidian", tags=["obsidian"])


class ObsidianExport(BaseModel):
    path: str
    start_path: str
    written: int
    removed: int
    unchanged: int
    kept_edited: int
    seconds: float
    open_url: str
    documents: int
    requirements: int
    sections: int
    without_link: int
    canvases: List[str]


class ObsidianImport(BaseModel):
    created: int
    existing: int
    unchanged: int
    conflicts: int
    skipped: int
    changed: List[str]
    new: List[str]
    conflict_uids: List[str]
    proposal_ids: List[int]


class ObsidianStatus(BaseModel):
    path: str
    exported: bool
    files: int
    exported_at: Optional[str] = None
    pending_changes: Optional[int] = None
    open_url: str


def _base_url(request: Request) -> str:
    """Adresse der Oberfläche für `reqman_url`: REQMAN_PUBLIC_URL, sonst Origin des Aufrufs."""
    env = os.environ.get("REQMAN_PUBLIC_URL")
    if env:
        return env
    return request.headers.get("origin") or ""


@router.post("/export", response_model=ObsidianExport)
async def obsidian_export(project_id: str, request: Request, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    try:
        return await run_in_threadpool(svc.export_project, project_id, db, _base_url(request))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Export nicht möglich: {e}")


@router.get("/status", response_model=ObsidianStatus)
async def obsidian_status(project_id: str, request: Request, db: Session = Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    try:
        return await run_in_threadpool(svc.status, project_id, db, _base_url(request))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/import-changes", response_model=ObsidianImport)
async def obsidian_import_changes(project_id: str, db: Session = Depends(get_db),
                                  current_user: User = Depends(require_editor)):
    """Legt für in Obsidian geänderte oder neue Notizen Vorschläge an; übernommen wird nichts."""
    try:
        return await run_in_threadpool(svc.import_changes, project_id, db, current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=404 if "nicht gefunden" in str(e) else 409, detail=str(e))
