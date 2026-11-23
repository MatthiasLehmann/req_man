"""Standardeinstellungen für PDF-Berichte je Projekt: `.reqman/pdf.yml` im Projektordner (liegt im Repo)."""
from __future__ import annotations

import os
from typing import Optional

import yaml

from pdf_reports import PdfRequest

SETTINGS_REL = os.path.join(".reqman", "pdf.yml")


def settings_path(project_path: str) -> str:
    return os.path.join(project_path, SETTINGS_REL)


def _clean(req: PdfRequest) -> dict:
    """Speicherbarer Inhalt: ohne `filter.uids` (Auswahl gilt nur für diesen Aufruf) und ohne `save_defaults`."""
    data = req.model_dump(exclude_none=True)
    data["filter"].pop("uids", None)
    data.pop("save_defaults", None)
    return data


def load(project_path: str) -> PdfRequest:
    """Gespeicherte Einstellungen; ohne Datei oder bei kaputtem Inhalt die Vorgaben."""
    try:
        with open(settings_path(project_path), encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
        if not isinstance(raw, dict):
            raise ValueError
        raw.pop("save_defaults", None)
        if isinstance(raw.get("filter"), dict):
            raw["filter"].pop("uids", None)
        return PdfRequest.model_validate(raw)
    except (OSError, ValueError, yaml.YAMLError):
        return PdfRequest()


def save(project_path: str, req: PdfRequest) -> PdfRequest:
    path = settings_path(project_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        yaml.safe_dump(_clean(req), f, allow_unicode=True, sort_keys=False)
    return load(project_path)
