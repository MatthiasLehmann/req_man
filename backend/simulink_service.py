"""
Simulink Traceability Service – Konzept 1: MATLAB-Export-basierte Integration.

Ablauf:
  1. Ingenieur trägt UIDs in Simulink-Block-Properties ein (Description: "REQ: SRS001")
  2. MATLAB-Skript export_simulink_trace.m erzeugt simulink_trace.json
  3. req_man importiert die JSON-Datei via POST /api/projects/{id}/simulink/import
  4. Links werden als Sidecar-YAML gespeichert: <UID>.simulink.yml
  5. Coverage-Auswertung via GET /api/projects/{id}/simulink/coverage

Kernklassen:
  - SimulinkLink          – ein Block→Anforderung-Link
  - SimulinkSidecar       – alle Links einer Anforderung (Sidecar-YAML)
  - SimulinkImportResult  – Ergebnis eines Import-Vorgangs
  - SimulinkCoverage      – Coverage-Statistik über ein ganzes Projekt
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel

import doorstop_service as ds


# ─── Pydantic-Modelle ─────────────────────────────────────────────────────────


class SimulinkLink(BaseModel):
    """Ein einzelner Block→Anforderung-Link (Simulink-Block oder MATLAB-.m-Datei)."""
    block_path: str                        # z. B. "Model/Subsystem/PID_Controller" (leer bei matlab)
    block_type: str                        # z. B. "SubSystem", "Gain" (leer bei matlab)
    model_file: str                        # z. B. "SpeedController.slx" (leer bei matlab)
    uid: str                               # Anforderungs-UID in req_man
    link_type: str = "implements"          # implements | verifies | refines
    imported_at: str                       # ISO-8601-Zeitstempel des Imports
    source_type: str = "simulink"          # "simulink" | "matlab"
    file: Optional[str] = None            # Absoluter Pfad zur .m-Datei (nur bei matlab)
    line: Optional[int] = None            # Zeilennummer in der .m-Datei (nur bei matlab)


class SimulinkSidecar(BaseModel):
    """Sidecar-YAML pro Anforderung: alle verlinkten Blöcke."""
    requirement_uid: str
    links: List[SimulinkLink] = []
    last_import: str                   # ISO-8601 des letzten Imports
    model: str                         # Modellname des letzten Imports


class SimulinkImportResult(BaseModel):
    """Ergebnis eines Import-Vorgangs."""
    imported: int                      # Anzahl gespeicherter Links
    unknown_uids: List[str]            # UIDs in JSON die in req_man nicht existieren
    updated_requirements: List[str]    # UIDs die neu/aktualisiert wurden
    model: str                         # Modellname aus der JSON
    timestamp: str                     # Zeitpunkt des Imports


class SimulinkCoverage(BaseModel):
    """Coverage-Statistik über alle Anforderungen eines Projekts."""
    total_requirements: int
    covered: int
    not_covered: int
    coverage_percent: float
    not_covered_uids: List[str]
    model: Optional[str] = None        # Zuletzt importiertes Modell
    last_import: Optional[str] = None  # Zeitpunkt des letzten Imports


# ─── Pfad-Hilfsfunktionen ─────────────────────────────────────────────────────


def get_simulink_yaml_path(project_id: str, uid: str) -> Optional[Path]:
    """Gibt den Pfad zur Sidecar-YAML-Datei zurück (<UID>.simulink.yml)."""
    project = ds.get_project(project_id)
    if not project:
        return None
    project_path = Path(project["path"])

    m = re.match(r"^(.+)-\d+$", uid)
    if not m:
        return None
    doc_prefix = m.group(1).upper()

    # Verzeichnis suchen (case-insensitive)
    doc_dir = project_path / doc_prefix
    if not doc_dir.exists():
        for d in project_path.iterdir():
            if d.is_dir() and d.name.upper() == doc_prefix:
                doc_dir = d
                break

    return doc_dir / f"{uid}.simulink.yml"


# ─── Persistenz ───────────────────────────────────────────────────────────────


def load_simulink_links(project_id: str, uid: str) -> Optional[SimulinkSidecar]:
    """Lädt die Simulink-Links einer Anforderung aus der Sidecar-YAML."""
    path = get_simulink_yaml_path(project_id, uid)
    if not path or not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not data:
        return None
    try:
        return SimulinkSidecar(**data)
    except Exception:
        return None


def save_simulink_links(project_id: str, sidecar: SimulinkSidecar) -> Path:
    """Speichert die Simulink-Links als Sidecar-YAML."""
    path = get_simulink_yaml_path(project_id, sidecar.requirement_uid)
    if not path:
        raise ValueError(f"Konnte Speicherpfad für {sidecar.requirement_uid} nicht bestimmen")
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.dump(sidecar.model_dump(), f, allow_unicode=True, default_flow_style=False)
    return path


def delete_all_simulink_links(project_id: str) -> int:
    """Löscht alle Simulink-Sidecar-YAMLs eines Projekts. Gibt Anzahl zurück."""
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    project_path = Path(project["path"])
    count = 0
    for f in project_path.rglob("*.simulink.yml"):
        f.unlink()
        count += 1
    return count


# ─── Import-Logik ─────────────────────────────────────────────────────────────


def import_simulink_trace(project_id: str, json_data: Dict[str, Any]) -> SimulinkImportResult:
    """
    Verarbeitet eine simulink_trace.json und speichert Links als Sidecar-YAMLs.

    Ablauf:
    1. Alle vorhandenen UIDs im Projekt ermitteln
    2. Links aus JSON lesen und auf bekannte UIDs filtern
    3. Links pro UID gruppieren
    4. Sidecar-YAML pro UID schreiben (überschreibt vorherigen Stand)
    5. Ergebnis zurückgeben
    """
    now = datetime.now(timezone.utc).isoformat()

    # Modell-Metadaten aus JSON
    model_info = json_data.get("model", {})
    model_name = model_info.get("name", "unbekannt")

    # Alle bekannten UIDs im Projekt sammeln
    known_uids: set[str] = set()
    try:
        for doc in ds.list_documents(project_id):
            prefix = doc.get("prefix", "")
            for item in ds.list_items(project_id, prefix):
                if not item.get("header"):
                    known_uids.add(item["uid"])
    except Exception:
        pass

    # Links aus JSON einlesen
    raw_links: List[Dict[str, Any]] = json_data.get("links", [])

    unknown_uids: set[str] = set()
    links_by_uid: Dict[str, List[SimulinkLink]] = {}

    for raw in raw_links:
        uid = raw.get("uid", "").strip()
        if not uid:
            continue

        if uid not in known_uids:
            unknown_uids.add(uid)
            continue

        raw_line = raw.get("line")
        link = SimulinkLink(
            block_path=raw.get("block_path", ""),
            block_type=raw.get("block_type", ""),
            model_file=raw.get("model_file", ""),
            uid=uid,
            link_type=raw.get("link_type", "implements"),
            imported_at=now,
            source_type=raw.get("source_type", "simulink"),
            file=raw.get("file") or None,
            line=int(raw_line) if isinstance(raw_line, (int, float)) else None,
        )
        links_by_uid.setdefault(uid, []).append(link)

    # Sidecar-YAMLs schreiben
    updated: List[str] = []
    total_imported = 0

    for uid, links in links_by_uid.items():
        sidecar = SimulinkSidecar(
            requirement_uid=uid,
            links=links,
            last_import=now,
            model=model_name,
        )
        save_simulink_links(project_id, sidecar)
        updated.append(uid)
        total_imported += len(links)

    return SimulinkImportResult(
        imported=total_imported,
        unknown_uids=sorted(unknown_uids),
        updated_requirements=sorted(updated),
        model=model_name,
        timestamp=now,
    )


# ─── Coverage-Berechnung ──────────────────────────────────────────────────────


def get_coverage(project_id: str) -> SimulinkCoverage:
    """
    Berechnet die Simulink-Coverage über alle (nicht-Header-)Anforderungen des Projekts.
    """
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")

    all_uids: List[str] = []
    try:
        for doc in ds.list_documents(project_id):
            prefix = doc.get("prefix", "")
            for item in ds.list_items(project_id, prefix):
                if not item.get("header"):
                    all_uids.append(item["uid"])
    except Exception:
        pass

    covered_uids: List[str] = []
    not_covered_uids: List[str] = []
    last_import: Optional[str] = None
    last_model: Optional[str] = None

    for uid in all_uids:
        sidecar = load_simulink_links(project_id, uid)
        if sidecar and sidecar.links:
            covered_uids.append(uid)
            # Neuesten Import-Zeitstempel merken
            if last_import is None or sidecar.last_import > last_import:
                last_import = sidecar.last_import
                last_model = sidecar.model
        else:
            not_covered_uids.append(uid)

    total = len(all_uids)
    covered = len(covered_uids)
    percent = round((covered / total * 100), 1) if total > 0 else 0.0

    return SimulinkCoverage(
        total_requirements=total,
        covered=covered,
        not_covered=total - covered,
        coverage_percent=percent,
        not_covered_uids=sorted(not_covered_uids),
        model=last_model,
        last_import=last_import,
    )
