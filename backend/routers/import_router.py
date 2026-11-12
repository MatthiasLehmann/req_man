"""Tabellen-Import: Excel/CSV lesen, Zeilen prüfen, gültige Zeilen anlegen (siehe import_service)."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from auth import get_current_user, require_editor
from database import User
import import_service

router = APIRouter(prefix="/api/projects/{project_id}/documents/{prefix}/import", tags=["import"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class ImportRows(BaseModel):
    rows: List[Dict[str, str]]


class ParsedTable(BaseModel):
    rows: List[List[str]]


class RowCheck(BaseModel):
    errors: List[str]
    notes: List[str]
    item: Optional[Dict[str, Any]] = None


class ImportCheck(BaseModel):
    rows: List[RowCheck]
    valid: int
    invalid: int


class ImportResult(BaseModel):
    created: List[str]


@router.post("/parse", response_model=ParsedTable)
async def parse_file(
    project_id: str,
    prefix: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Liest eine .xlsx-, .csv- oder .tsv-Datei und gibt die Zellen als Text zurück."""
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Datei ist größer als 10 MB")
    try:
        return {"rows": import_service.parse_table_file(file.filename or "", content)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/validate", response_model=ImportCheck)
async def validate_import(
    project_id: str,
    prefix: str,
    body: ImportRows,
    current_user: User = Depends(get_current_user),
):
    """Prüft die zugeordneten Zeilen, ohne etwas anzulegen."""
    try:
        return import_service.validate_rows(project_id, prefix, body.rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("", response_model=ImportResult, status_code=201)
async def run_import(
    project_id: str,
    prefix: str,
    body: ImportRows,
    current_user: User = Depends(require_editor),
):
    """Legt alle Zeilen an – nur wenn jede Zeile gültig ist (alles oder nichts)."""
    try:
        return import_service.import_rows(project_id, prefix, body.rows)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
