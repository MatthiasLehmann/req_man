"""PDF-Berichte (Reihe E): Anfrage-Modell und Verteiler auf die Vorlagen.

`RENDERERS` bildet den Vorlagennamen auf eine Funktion `(project_id, PdfRequest) -> bytes` ab.
E2 (Spezifikation) und E3 (Review-Unterlage) tragen ihre Funktion dort ein; solange ein Eintrag fehlt,
fällt `render` auf das einfache Lastenheft (`typst_service.build_pdf`) zurück.
"""
from __future__ import annotations

import re
from typing import Callable, Dict, List, Literal, Optional, Tuple

from pydantic import BaseModel, Field

import doorstop_service as ds
import typst_service as ts

Status = Literal["nicht geprüft", "geändert nach Prüfung", "geprüft"]


class PdfAttributeFilter(BaseModel):
    name: str = ""
    value: str = ""


class PdfFilter(BaseModel):
    uids: List[str] = Field(default_factory=list)
    status: List[Status] = Field(default_factory=list)
    changed_since: str = ""  # Datum (JJJJ-MM-TT) oder Commit
    attribute: Optional[PdfAttributeFilter] = None


class PdfMeta(BaseModel):
    doc_number: str = ""
    version: str = ""
    status: Literal["entwurf", "pruefung", "freigegeben"] = "entwurf"
    confidentiality: str = ""


class PdfMeeting(BaseModel):
    title: str = ""
    date: str = ""
    place: str = ""
    participants: List[str] = Field(default_factory=list)


class PdfOptions(BaseModel):
    layout: Literal["fliesstext", "tabelle"] = "fliesstext"
    attributes: List[str] = Field(default_factory=list)
    appendices: List[Literal["trace", "offen", "glossar"]] = Field(default_factory=list)
    meta: PdfMeta = Field(default_factory=PdfMeta)
    meeting: PdfMeeting = Field(default_factory=PdfMeeting)


class PdfRequest(BaseModel):
    """Körper von POST /api/projects/{id}/export/pdf (Schnittstelle Abschnitt 3a im E-Plan). Alle Felder optional."""
    template: Literal["spezifikation", "review"] = "spezifikation"
    documents: List[str] = Field(default_factory=list)
    filter: PdfFilter = Field(default_factory=PdfFilter)
    options: PdfOptions = Field(default_factory=PdfOptions)
    save_defaults: bool = False


Renderer = Callable[[str, PdfRequest], bytes]
RENDERERS: Dict[str, Renderer] = {}


def render(project_id: str, req: PdfRequest) -> Tuple[bytes, str]:
    """Erzeugt das PDF; Rückgabe (Bytes, Dateiname).

    Raises: ValueError (Projekt fehlt), KeyError (Dokument fehlt), ts.TypstUnavailable, ts.TypstFailed.
    """
    project = ds.get_project(project_id)
    if not project:
        raise ValueError("Projekt nicht gefunden")
    fn = RENDERERS.get(req.template)
    if fn:
        pdf = fn(project_id, req)
    else:
        # Rückfall: einfaches Lastenheft, höchstens ein Dokument
        pdf = ts.build_pdf(project_id, req.documents[0] if req.documents else None)
    base = re.sub(r"[^A-Za-z0-9_-]", "_", project["name"])
    suffix = "Review" if req.template == "review" else (req.documents[0] if len(req.documents) == 1 else "Spezifikation")
    return pdf, f"{base}_{suffix}.pdf"


# E3: Review-Unterlage registrieren (am Ende, wegen Importzyklus)
from pdf_review import render as _render_review  # noqa: E402
RENDERERS["review"] = _render_review
