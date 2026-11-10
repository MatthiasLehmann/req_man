"""Excel-Rückweg (U4): exportieren, in Excel bearbeiten, Änderungen geprüft zurückholen."""

import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from auth import get_current_user, require_editor
from database import User
import roundtrip_service

router = APIRouter(prefix="/api/projects/{project_id}/roundtrip", tags=["roundtrip"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class FieldChange(BaseModel):
    field: str
    label: str
    old: str
    new: str
    conflict: bool


class ItemChange(BaseModel):
    row: int
    uid: str
    label: Optional[str] = None
    comment: str
    fields: List[FieldChange]
    errors: List[str]
    conflicts: List[str]
    patch: Optional[Dict[str, Any]] = None


class NewRow(BaseModel):
    row: int
    text: str
    comment: str
    errors: List[str] = []
    notes: List[str] = []
    item: Optional[Dict[str, Any]] = None


class RoundtripCompare(BaseModel):
    prefix: str
    exported: str
    changes: List[ItemChange]
    new: List[NewRow]
    unchanged: int
    not_in_file: List[str]
    ignored_columns: List[str]


class RoundtripDetect(BaseModel):
    prefix: Optional[str] = None


class RoundtripResult(BaseModel):
    updated: List[str]
    created: List[str]


async def _read(file: UploadFile) -> bytes:
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Datei ist größer als 10 MB")
    return content


@router.get("/export/{prefix}")
async def export_for_excel(project_id: str, prefix: str, current_user: User = Depends(get_current_user)):
    """Dokument als Excel-Datei zum Bearbeiten und Kommentieren (mit Abgleichsdaten für den Rückweg)."""
    try:
        data = roundtrip_service.export_workbook(project_id, prefix)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(content=data, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{prefix}_zum_Bearbeiten.xlsx"'})


@router.post("/detect", response_model=RoundtripDetect)
async def detect(project_id: str, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Ist die Datei ein ReqMan-Export (Rückweg)? Dann das Dokument dazu, sonst None."""
    rt = roundtrip_service.read_roundtrip(file.filename or "", await _read(file))
    if rt is None:
        return {"prefix": None}
    if rt["project"] != project_id:
        raise HTTPException(status_code=400, detail="Die Datei wurde aus einem anderen ReqMan-Projekt exportiert")
    return {"prefix": rt["prefix"]}


@router.post("/compare", response_model=RoundtripCompare)
async def compare(project_id: str, file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Zeigt, was sich in der Excel-Datei gegenüber ReqMan geändert hat – ändert nichts."""
    try:
        return roundtrip_service.compare(project_id, file.filename or "", await _read(file))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/apply", response_model=RoundtripResult)
async def apply(
    project_id: str,
    file: UploadFile = File(...),
    selection: str = Form(..., description='JSON: {"uids": [...], "new_rows": [...]}'),
    current_user: User = Depends(require_editor),
):
    """Übernimmt die ausgewählten Änderungen – alle oder keine."""
    try:
        sel = json.loads(selection)
        uids = [str(u) for u in sel.get("uids", [])]
        rows = [int(r) for r in sel.get("new_rows", [])]
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(status_code=400, detail="Ungültige Auswahl")
    try:
        return roundtrip_service.apply(project_id, file.filename or "", await _read(file), uids, rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
