"""
Externe Datei-Referenzen (doorstop `references`-Feld).

Endpunkte:
  GET  /api/projects/{project_id}/items/{uid}/references
       Gibt alle gespeicherten Referenzen zurück (ohne Hash-Prüfung).

  PUT  /api/projects/{project_id}/items/{uid}/references
       Speichert eine neue Referenz-Liste; berechnet SHA256 für jede Datei neu.

  POST /api/projects/{project_id}/items/{uid}/references/check
       Prüft den Hash-Status aller Referenzen (ok/changed/missing/no_hash).

  POST /api/projects/{project_id}/items/{uid}/references/refresh
       Berechnet SHA256 aller Referenzen neu und speichert das Ergebnis.
"""

from typing import List, Optional

import doorstop_service
from auth import get_current_user
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["references"])


# ─── Pydantic-Modelle ──────────────────────────────────────────────────────────


class ReferenceIn(BaseModel):
    type: str = "file"
    path: str
    keyword: str = ""
    sha: Optional[str] = None


class ReferenceOut(BaseModel):
    type: str
    path: str
    keyword: str
    sha: Optional[str] = None


class ReferenceStatusOut(BaseModel):
    type: str
    path: str
    keyword: str
    sha: Optional[str] = None
    status: str           # 'ok' | 'changed' | 'missing' | 'no_hash'
    current_sha: Optional[str] = None


# ─── Endpunkte ─────────────────────────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/items/{uid}/references",
    response_model=List[ReferenceOut],
)
async def get_references(
    project_id: str,
    uid: str,
    _=Depends(get_current_user),
):
    """Gibt die gespeicherten Referenzen zurück (keine Hash-Prüfung)."""
    try:
        return doorstop_service.get_references(project_id, uid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put(
    "/projects/{project_id}/items/{uid}/references",
    response_model=List[ReferenceOut],
)
async def update_references(
    project_id: str,
    uid: str,
    references: List[ReferenceIn],
    _=Depends(get_current_user),
):
    """
    Speichert die Referenz-Liste. SHA256 wird für alle Dateien neu berechnet
    (sofern die Datei am angegebenen Pfad existiert).
    """
    try:
        data = [r.model_dump() for r in references]
        return doorstop_service.update_references(project_id, uid, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post(
    "/projects/{project_id}/items/{uid}/references/check",
    response_model=List[ReferenceStatusOut],
)
async def check_references(
    project_id: str,
    uid: str,
    _=Depends(get_current_user),
):
    """
    Prüft den SHA256-Status aller gespeicherten Referenzen.
    Status: 'ok' | 'changed' | 'missing' | 'no_hash'
    """
    try:
        return doorstop_service.check_reference_hashes(project_id, uid)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/projects/{project_id}/items/{uid}/references/refresh",
    response_model=List[ReferenceOut],
)
async def refresh_reference_hashes(
    project_id: str,
    uid: str,
    _=Depends(get_current_user),
):
    """
    Berechnet SHA256 aller Referenzen neu und speichert das Ergebnis.
    Nützlich wenn Dateien bewusst geändert wurden und der Hash aktualisiert
    werden soll.
    """
    try:
        existing = doorstop_service.get_references(project_id, uid)
        return doorstop_service.update_references(project_id, uid, existing)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
