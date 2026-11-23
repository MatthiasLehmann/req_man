"""PDF-Export (B3, Reihe E): GET/POST /api/projects/{id}/export/pdf, GET/PUT /api/projects/{id}/pdf-settings."""
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from auth import get_current_user, require_editor
from database import User
import doorstop_service as ds
import pdf_reports as pr
import pdf_settings_service as pss
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


def _project_or_404(project_id: str) -> dict:
    project = ds.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden")
    return project


@router.post("/export/pdf")
def export_pdf_post(
    project_id: str,
    req: pr.PdfRequest,
    current_user: User = Depends(get_current_user),
):
    """PDF-Bericht nach Vorlage und Optionen; `save_defaults` speichert die Einstellungen im Projekt."""
    project = _project_or_404(project_id)
    if req.save_defaults and current_user.role not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Einstellungen speichern darf nur, wer bearbeiten darf")
    if not ts.typst_available():
        raise HTTPException(
            status_code=503,
            detail="PDF-Satz nicht verfügbar: Typst ist nicht installiert "
                   "(pip install typst oder TYPST_BIN auf das Typst-Programm setzen).",
        )
    try:
        pdf, name = pr.render(project_id, req)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Dokument {e} nicht gefunden")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ts.TypstUnavailable:
        raise HTTPException(status_code=503, detail="PDF-Satz nicht verfügbar: Typst ist nicht installiert.")
    except ts.TypstFailed as e:
        raise HTTPException(status_code=500, detail=f"PDF-Satz fehlgeschlagen: {e}")
    if req.save_defaults:
        pss.save(project["path"], req)
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/pdf-settings", response_model=pr.PdfRequest)
def get_pdf_settings(project_id: str, current_user: User = Depends(get_current_user)):
    """Gespeicherte PDF-Einstellungen des Projekts (`.reqman/pdf.yml`); ohne Datei die Vorgaben."""
    return pss.load(_project_or_404(project_id)["path"])


@router.put("/pdf-settings", response_model=pr.PdfRequest)
def put_pdf_settings(project_id: str, req: pr.PdfRequest, current_user: User = Depends(require_editor)):
    """Speichert die PDF-Einstellungen im Projekt (ohne `filter.uids`)."""
    return pss.save(_project_or_404(project_id)["path"], req)
