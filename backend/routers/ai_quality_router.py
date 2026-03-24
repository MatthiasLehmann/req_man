"""
API-Router für KI-Qualitätsprüfung von Anforderungen.

Endpunkte:
  POST  /api/projects/{pid}/items/{uid}/ai-quality         – Analyse anstoßen
  GET   /api/projects/{pid}/items/{uid}/ai-quality         – Letztes Ergebnis abrufen
  POST  /api/projects/{pid}/documents/{pfx}/ai-quality-batch – Batch-Analyse
  GET   /api/ai-quality/profiles                           – Verfügbare Profile
  GET   /api/ai-quality/settings                           – API-Key-Status
"""
import asyncio
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

import ai_quality_service as aqs
import doorstop_service as ds
from auth import get_current_user
from database import User

# ─── Router-Definitionen ──────────────────────────────────────────────────────

# Router für projektbezogene Endpunkte
router = APIRouter(prefix="/api/projects/{project_id}", tags=["ai-quality"])

# Router für globale Einstellungs-Endpunkte
settings_router = APIRouter(prefix="/api/ai-quality", tags=["ai-quality"])


# ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _get_analyzer() -> aqs.QualityAnalyzer:
    """Erstellt den Analyzer; wirft 503 wenn API-Key fehlt."""
    try:
        return aqs.get_analyzer()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ─── Endpunkte ────────────────────────────────────────────────────────────────


@router.post(
    "/items/{uid}/ai-quality",
    response_model=aqs.AiQualityResult,
    status_code=200,
    summary="KI-Qualitätsprüfung für eine Anforderung anstoßen",
)
async def trigger_ai_quality(
    project_id: str,
    uid: str,
    body: aqs.AiQualityRequest = aqs.AiQualityRequest(),
    current_user: User = Depends(get_current_user),
):
    """
    Analysiert eine Anforderung mit Claude und speichert das Ergebnis als
    Sidecar-YAML (`<uid>.ai-quality.yml`) neben der Anforderungsdatei.

    Gibt HTTP 503 zurück wenn ANTHROPIC_API_KEY nicht gesetzt ist.
    Gibt HTTP 422 zurück bei header=True oder zu kurzem Text.
    """
    if not ds.get_project(project_id):
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    analyzer = _get_analyzer()
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: asyncio.run(
                analyzer.analyze(
                    project_id=project_id,
                    uid=uid,
                    profile_name=body.profile,
                    model=body.model,
                )
            ),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        msg = str(e)
        if "rate_limit" in msg.lower() or "429" in msg:
            raise HTTPException(status_code=429, detail="Claude API Rate-Limit erreicht")
        if "api_key" in msg.lower() or "auth" in msg.lower():
            raise HTTPException(status_code=402, detail="Claude API-Key ungültig oder abgelaufen")
        raise HTTPException(status_code=502, detail=f"Claude API Fehler: {msg}")


@router.get(
    "/items/{uid}/ai-quality",
    response_model=Optional[aqs.AiQualityResult],
    summary="Letztes gespeichertes KI-Qualitätsergebnis abrufen",
)
async def get_ai_quality(
    project_id: str,
    uid: str,
    current_user: User = Depends(get_current_user),
):
    """
    Gibt das zuletzt gespeicherte KI-Qualitätsergebnis für eine Anforderung zurück.
    Gibt null zurück wenn noch keine Analyse durchgeführt wurde.
    """
    if not ds.get_project(project_id):
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    return aqs.load_quality_result(project_id, uid)


@router.post(
    "/documents/{prefix}/ai-quality-batch",
    summary="Batch-Analyse aller Anforderungen in einem Dokument",
)
async def trigger_batch_ai_quality(
    project_id: str,
    prefix: str,
    body: aqs.AiQualityRequest = aqs.AiQualityRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Startet die KI-Analyse aller Anforderungen in einem Dokument als
    Hintergrundaufgabe. Gibt sofort zurück mit der Anzahl geplanter Analysen.
    """
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")

    # Items des Dokuments laden
    items = ds.list_items(project_id, prefix)
    # Nur echte Anforderungen (kein header, aktiv, Text > 10 Zeichen)
    analyzable = [
        i for i in items
        if not i.get("header") and i.get("active", True)
        and len((i.get("text") or "").strip()) >= 10
    ]

    if not analyzable:
        raise HTTPException(
            status_code=422,
            detail="Keine analysierbaren Anforderungen in diesem Dokument gefunden",
        )

    _get_analyzer()  # Frühzeitig prüfen ob API-Key vorhanden

    async def _run_batch():
        analyzer = _get_analyzer()
        for item in analyzable:
            try:
                await analyzer.analyze(
                    project_id=project_id,
                    uid=item["uid"],
                    profile_name=body.profile,
                    model=body.model,
                )
            except Exception:
                pass  # Einzelfehler überspringen, Batch läuft weiter

    background_tasks.add_task(lambda: asyncio.run(_run_batch()))

    return {
        "message": f"Batch-Analyse gestartet für {len(analyzable)} Anforderungen",
        "total": len(analyzable),
        "profile": body.profile,
    }


# ─── Globale Einstellungs-Endpunkte ───────────────────────────────────────────


@settings_router.get(
    "/profiles",
    response_model=List[str],
    summary="Verfügbare Qualitätsprofile auflisten",
)
async def list_profiles(current_user: User = Depends(get_current_user)):
    """Gibt alle verfügbaren Qualitätsprofile zurück."""
    return aqs.list_profiles()


@settings_router.get(
    "/settings",
    summary="KI-Qualitäts-Einstellungen und API-Key-Status",
)
async def get_settings(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Gibt den aktuellen Konfigurations-Status zurück."""
    return aqs.get_provider_info()
