"""
Validation-Service für req_man – Konzept 2.

Erzeugt Validierungsreports als YAML-Dateien im validation/-Verzeichnis
des Projekts und committet sie zusammen mit dem Anforderungs-YAML in Git.
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

import doorstop
import yaml

import doorstop_service as ds
import git_service

SCHEMA_VERSION = "1.0"


# ─── Doorstop-Fingerprint ────────────────────────────────────────────────────

def get_fingerprint(project_id: str, item_uid: str) -> Optional[str]:
    """
    Liest den aktuellen doorstop-SHA256-Fingerprint eines Items.
    Gibt None zurück wenn das Item noch nicht reviewed wurde.
    """
    project = ds.get_project(project_id)
    if not project:
        return None
    try:
        tree = ds._build_tree(project["path"])
        item = tree.find_item(item_uid)
        rv = item.reviewed
        if rv and rv is not False:
            return str(rv)
    except Exception:
        pass
    return None


def fingerprint_is_current(project_id: str, item_uid: str, stored_hash: str) -> bool:
    """True wenn stored_hash mit dem aktuellen doorstop-Fingerprint übereinstimmt."""
    if not stored_hash:
        return False
    current = get_fingerprint(project_id, item_uid)
    return bool(current and current == stored_hash)


# ─── doorstop check ──────────────────────────────────────────────────────────

def run_doorstop_check(project_path: str) -> tuple[bool, str]:
    """
    Führt doorstop-Validierung über die Python-API durch (kein subprocess).
    Gibt (success, output) zurück.
    In doorstop 3.x gibt tree.validate() einen bool zurück.
    """
    try:
        tree = doorstop.build(cwd=project_path, root=project_path)
        valid = tree.validate()
        if valid:
            return True, "doorstop check OK"
        return False, "doorstop check: Validierungsfehler im Anforderungsbaum"
    except doorstop.DoorstopError as e:
        return False, str(e)
    except Exception as e:
        return False, str(e)


# ─── Datei-Hilfsfunktionen ───────────────────────────────────────────────────

def _next_report_filename(project_path: str, item_uid: str) -> str:
    """Erzeugt den nächsten verfügbaren Report-Dateinamen."""
    val_dir = Path(project_path) / "validation"
    val_dir.mkdir(exist_ok=True)
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    base = f"{item_uid}-val-{date_str}"
    nr = 1
    while (val_dir / f"{base}-{nr:03d}.yml").exists():
        nr += 1
    return f"{base}-{nr:03d}.yml"


def _req_yaml_rel_path(project_path: str, item_uid: str) -> Optional[str]:
    """
    Gibt den Pfad der Anforderungs-YAML relativ zu project_path zurück.
    z.B. 'SYS/SYS-042.yml'
    """
    try:
        tree = ds._build_tree(project_path)
        item = tree.find_item(item_uid)
        item_path = Path(str(item.path))
        rel = item_path.relative_to(Path(project_path))
        return str(rel)
    except Exception:
        return None


# ─── Haupt-Validierungsfunktion ───────────────────────────────────────────────

def create_validation(
    project_id: str,
    item_uid: str,
    status: str,
    checklist: Dict[str, Any],
    summary: str,
    validator_username: str,
    validator_display_name: str,
    validator_email: str,
    skip_doorstop_check: bool = False,
) -> Dict[str, Any]:
    """
    Erstellt einen Validierungsreport und committet ihn in Git.

    Schritte:
    1. Fingerprint aus doorstop auslesen
    2. doorstop check ausführen (kann per skip_doorstop_check übersprungen werden)
    3. Report-YAML generieren
    4. Report in validation/ schreiben
    5. git add + git commit (req YAML + report YAML)
    6. Commit-Hash zurückgeben

    Raises ValueError bei Fehlern.
    """
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")

    project_path = project["path"]

    # 1. Fingerprint
    fingerprint = get_fingerprint(project_id, item_uid) or ""

    # 2. doorstop check
    if not skip_doorstop_check:
        ok, check_out = run_doorstop_check(project_path)
        if not ok:
            raise ValueError(f"doorstop check fehlgeschlagen:\n{check_out}")

    # 3. Dateiname
    filename = _next_report_filename(project_path, item_uid)
    validation_id = filename.replace(".yml", "")
    val_dir = Path(project_path) / "validation"
    val_dir.mkdir(exist_ok=True)
    report_abs = val_dir / filename

    # 4. Report-Dict aufbauen
    now = datetime.now(timezone.utc)
    # Dokument-Prefix aus dem Pfad ermitteln (zuverlässiger als String-Split)
    try:
        _tree = ds._build_tree(project_path)
        _item = _tree.find_item(item_uid)
        doc_prefix = _item.document.prefix
    except Exception:
        doc_prefix = item_uid.split("-")[0]

    report = {
        "schema_version": SCHEMA_VERSION,
        "requirement_id": item_uid,
        "requirement_document": doc_prefix,
        "requirement_text_hash": fingerprint,
        "validation_id": validation_id,
        "validation_date": now.date().isoformat(),
        "validation_time": now.strftime("%H:%M:%SZ"),
        "validator": {
            "username": validator_username,
            "display_name": validator_display_name,
        },
        "status": status,
        "checklist": checklist,
        "summary": summary,
        "related_commits": [],
        "supersedes": None,
    }

    # 5. Report schreiben
    with open(report_abs, "w", encoding="utf-8") as f:
        yaml.dump(report, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    # 6. Req-YAML-Pfad ermitteln
    req_rel = _req_yaml_rel_path(project_path, item_uid)
    if not req_rel:
        raise ValueError(f"Anforderungs-YAML für {item_uid} konnte nicht ermittelt werden")

    # 7. Commit-Message
    short_summary = summary[:70] + "..." if len(summary) > 70 else summary
    report_rel = f"validation/{filename}"
    commit_msg = (
        f"validate({item_uid}): {status} - {short_summary}\n\n"
        f"Validation-Report: {report_rel}\n"
        f"Validator: {validator_username}\n"
        f"Doorstop-Fingerprint: {fingerprint or 'n/a'}"
    )

    # 8. Git-Commit
    try:
        commit_hash = git_service.commit_validation(
            project_path=project_path,
            req_yaml_rel=req_rel,
            report_rel=report_rel,
            commit_message=commit_msg,
            author_name=validator_display_name or validator_username,
            author_email=validator_email,
        )
    except Exception as e:
        # Report-Datei wieder löschen wenn Commit fehlschlägt
        report_abs.unlink(missing_ok=True)
        raise ValueError(f"Git-Commit fehlgeschlagen: {e}")

    return {
        "validation_id": validation_id,
        "commit_hash": commit_hash,
        "commit_hash_short": commit_hash[:8],
        "report_path": report_rel,
        "status": status,
    }


# ─── Abfragen ────────────────────────────────────────────────────────────────

def get_validation_history(project_id: str, item_uid: str) -> list:
    """
    Gibt alle Validierungsreports eines Items zurück, sortiert nach Datum (neueste zuerst).
    Liest direkt aus dem Dateisystem.
    """
    project = ds.get_project(project_id)
    if not project:
        return []

    val_dir = Path(project["path"]) / "validation"
    if not val_dir.exists():
        return []

    results = []
    for f in sorted(val_dir.glob(f"{item_uid}-val-*.yml"), reverse=True):
        try:
            with open(f, encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
            if data:
                results.append(data)
        except Exception:
            pass
    return results


def get_latest_validation(project_id: str, item_uid: str) -> Optional[Dict]:
    """Gibt den neuesten Validierungsreport zurück (oder None)."""
    history = get_validation_history(project_id, item_uid)
    return history[0] if history else None


def get_all_validations(project_id: str) -> list:
    """
    Gibt alle Validierungsreports eines Projekts zurück (für Dashboard-Übersicht).
    Sortiert nach Datum, neueste zuerst.
    """
    project = ds.get_project(project_id)
    if not project:
        return []

    val_dir = Path(project["path"]) / "validation"
    if not val_dir.exists():
        return []

    results = []
    for f in sorted(val_dir.glob("*-val-*.yml"), reverse=True):
        try:
            with open(f, encoding="utf-8") as fh:
                data = yaml.safe_load(fh)
            if data:
                results.append(data)
        except Exception:
            pass
    return results
