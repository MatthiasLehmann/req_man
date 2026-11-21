"""Gesetztes Lastenheft als PDF (B3) – GET /api/projects/{id}/export/pdf?document=PREFIX."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from auth import get_current_user
from database import User
import doorstop_service as ds
import typst_service as ts

router = APIRouter(prefix="/api/projects/{project_id}", tags=["export"])


@router.get("/export/pdf")
def export_pdf(
    project_id: str,
    document: Optional[str] = Query(None, description="Dokument-Präfix; leer = alle Dokumente"),
    current_user: User = Depends(get_current_user),
):
    """Setzt das Projekt (oder ein Dokument) mit Typst zu einem PDF."""
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    if not ts.typst_available():
        raise HTTPException(
            status_code=503,
            detail="PDF-Satz nicht verfügbar: Typst ist nicht installiert "
                   "(pip install typst oder TYPST_BIN auf das Typst-Programm setzen).",
        )
    try:
        pdf = ts.build_pdf(project_id, document or None)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Dokument '{document}' nicht gefunden")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ts.TypstUnavailable:
        raise HTTPException(status_code=503, detail="PDF-Satz nicht verfügbar: Typst ist nicht installiert.")
    except ts.TypstFailed as e:
        raise HTTPException(status_code=500, detail=f"PDF-Satz fehlgeschlagen: {e}")

    base = re.sub(r"[^A-Za-z0-9_-]", "_", project["name"])
    name = f"{base}_{document}.pdf" if document else f"{base}_Lastenheft.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
