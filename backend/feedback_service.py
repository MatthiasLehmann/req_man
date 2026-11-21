"""Rückmeldung zu KI-Befunden (L2): „trifft zu“ / „trifft nicht zu“.

Je Benutzer gilt pro Befund (Anforderung, Kategorie, Befundtext) das letzte Urteil. Jedes Urteil wird zugleich als
Fall im Fallspeicher (cases_service) abgelegt. Die Rückmeldung ändert nichts an Anforderungen.
"""
import logging
from typing import List, Optional

from sqlalchemy.orm import Session

import cases_service
import doorstop_service as ds
from database import FindingFeedback

logger = logging.getLogger(__name__)

VERDICTS = cases_service.VERDICTS


def record(db: Session, project_id: str, uid: str, category: str, finding: str, verdict: str, user: str) -> FindingFeedback:
    if verdict not in VERDICTS:
        raise ValueError(f"Unbekanntes Urteil '{verdict}' (erlaubt: {', '.join(VERDICTS)})")
    category, finding = (category or "").strip(), (finding or "").strip()
    if not category or not finding:
        raise ValueError("Kategorie und Befundtext werden gebraucht")
    if not ds.get_project(project_id):
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    item = ds.get_item(project_id, uid)
    if not item or item.get("header"):
        raise ValueError(f"Anforderung {uid} nicht gefunden")
    text = item.get("text") or ""
    row = (db.query(FindingFeedback)
           .filter_by(project_id=project_id, uid=uid, category=category, finding=finding, created_by=user).first())
    if row is None:
        row = FindingFeedback(project_id=project_id, uid=uid, category=category, finding=finding, created_by=user)
        db.add(row)
    row.verdict = verdict
    row.requirement_text = text
    row.text_hash = cases_service.text_hash(text)
    db.commit()
    db.refresh(row)
    _store(project_id, row)
    return row


def _store(project_id: str, row: FindingFeedback) -> None:
    try:
        cases_service.upsert_cases(project_id, [cases_service.finding_case(row)])
    except Exception as e:  # noqa: BLE001 – ohne Ollama bleibt das Urteil in der Datenbank, Fälle lassen sich neu aufbauen
        logger.warning("Fallspeicher nicht aktualisiert (%s): %s", row.uid, e)


def list_feedback(db: Session, project_id: str, uid: Optional[str] = None, user: Optional[str] = None) -> List[FindingFeedback]:
    q = db.query(FindingFeedback).filter_by(project_id=project_id)
    if uid:
        q = q.filter_by(uid=uid)
    if user:
        q = q.filter_by(created_by=user)
    return q.order_by(FindingFeedback.id.desc()).all()


def withdraw(db: Session, project_id: str, feedback_id: int, user: str, is_admin: bool = False) -> None:
    row = db.query(FindingFeedback).filter_by(id=feedback_id, project_id=project_id).first()
    if not row:
        raise ValueError(f"Rückmeldung {feedback_id} nicht gefunden")
    if row.created_by != user and not is_admin:
        raise PermissionError("Nur eigene Urteile können zurückgenommen werden")
    key = cases_service.finding_key(row.uid, row.category, row.finding, row.created_by or "")
    db.delete(row)
    db.commit()
    try:
        cases_service.remove_case(project_id, key)
    except Exception as e:  # noqa: BLE001
        logger.warning("Fall nicht entfernt: %s", e)


def sync_cases(db: Session, project_id: str) -> dict:
    return cases_service.rebuild_from_db(db, project_id)
