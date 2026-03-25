"""
API-Router für Simulink Traceability (Konzept 1: JSON-Import).

Endpunkte:
  POST   /api/projects/{id}/simulink/import         – JSON-Datei importieren
  GET    /api/projects/{id}/simulink/coverage        – Coverage-Statistik
  GET    /api/projects/{id}/items/{uid}/simulink-links – Links einer Anforderung
  DELETE /api/projects/{id}/simulink/links           – Alle Links zurücksetzen
"""

import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status

import doorstop_service as ds
import simulink_service as ss
from auth import get_current_user
from database import User

router = APIRouter(prefix="/api/projects/{project_id}", tags=["simulink"])


# ─── Hilfsfunktion ────────────────────────────────────────────────────────────


def _require_project(project_id: str) -> dict:
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Projekt '{project_id}' nicht gefunden")
    return project


# ─── Endpunkte ────────────────────────────────────────────────────────────────


@router.post(
    "/simulink/import",
    response_model=ss.SimulinkImportResult,
    status_code=200,
    summary="Simulink-Traceability-JSON importieren",
    description=(
        "Importiert eine simulink_trace.json-Datei (erzeugt durch export_simulink_trace.m). "
        "Verknüpfungen werden als Sidecar-YAMLs neben den Anforderungsdateien gespeichert. "
        "Bestehende Links für das jeweilige Modell werden überschrieben."
    ),
)
async def import_simulink(
    project_id: str,
    file: UploadFile = File(..., description="simulink_trace.json vom MATLAB-Exportskript"),
    _user: User = Depends(get_current_user),
) -> ss.SimulinkImportResult:
    _require_project(project_id)

    # Datei lesen & JSON parsen
    content = await file.read()
    try:
        json_data = json.loads(content.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise HTTPException(
            status_code=422,
            detail=f"Ungültige JSON-Datei: {e}",
        )

    # Grundlegende Struktur prüfen
    if "links" not in json_data:
        raise HTTPException(
            status_code=422,
            detail="JSON enthält kein 'links'-Feld. Wurde die Datei mit export_simulink_trace.m erzeugt?",
        )

    try:
        return ss.import_simulink_trace(project_id, json_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import fehlgeschlagen: {e}")


@router.get(
    "/simulink/coverage",
    response_model=ss.SimulinkCoverage,
    summary="Simulink-Coverage-Statistik abrufen",
    description="Gibt zurück wie viele Anforderungen durch mindestens einen Simulink-Block abgedeckt sind.",
)
async def get_simulink_coverage(
    project_id: str,
    _user: User = Depends(get_current_user),
) -> ss.SimulinkCoverage:
    _require_project(project_id)
    try:
        return ss.get_coverage(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/items/{uid}/simulink-links",
    response_model=ss.SimulinkSidecar | None,
    summary="Simulink-Links einer Anforderung abrufen",
)
async def get_item_simulink_links(
    project_id: str,
    uid: str,
    _user: User = Depends(get_current_user),
) -> ss.SimulinkSidecar | None:
    _require_project(project_id)
    return ss.load_simulink_links(project_id, uid)


@router.delete(
    "/simulink/links",
    status_code=200,
    summary="Alle Simulink-Links des Projekts löschen",
)
async def delete_simulink_links(
    project_id: str,
    _user: User = Depends(get_current_user),
) -> dict:
    _require_project(project_id)
    try:
        count = ss.delete_all_simulink_links(project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"deleted": count, "message": f"{count} Sidecar-Datei(en) gelöscht"}
