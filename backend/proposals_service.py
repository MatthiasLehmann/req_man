"""Vorschlags-Eingang: Agenten und Assistent legen Änderungen als Vorschlag ab, ein Mensch übernimmt oder lehnt ab.

Ein Vorschlag ändert nichts an den Anforderungen. Erst `accept` (nur editor/admin, Router) schreibt über
doorstop_service. Bei `change_text` wird der Text zum Zeitpunkt des Vorschlags als Hash festgehalten; hat sich
die Anforderung inzwischen geändert, ist der Vorschlag veraltet (stale, 409).
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

import doorstop_service as ds
from database import Proposal

KINDS = ("change_text", "new_item", "add_link")
MIN_REASON = 10


class ProposalConflict(Exception):
    """Vorschlag ist veraltet oder nicht mehr offen (HTTP 409)."""


def _hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def _item(project_id: str, uid: str) -> Dict[str, Any]:
    item = ds.get_item(project_id, uid)
    if not item:
        raise ValueError(f"Anforderung {uid} nicht gefunden")
    return item


def _comparable(payload: Dict[str, Any]) -> str:
    return json.dumps({k: v for k, v in payload.items() if k != "old_text"}, sort_keys=True, ensure_ascii=False)


def create(db: Session, project_id: str, kind: str, user: str, reason: str, source: str = "mcp",
           uid: Optional[str] = None, prefix: Optional[str] = None,
           new_text: Optional[str] = None, text: Optional[str] = None,
           links: Optional[List[str]] = None, target_uid: Optional[str] = None) -> Proposal:
    if kind not in KINDS:
        raise ValueError(f"Unbekannte Art '{kind}' (erlaubt: {', '.join(KINDS)})")
    if len((reason or "").strip()) < MIN_REASON:
        raise ValueError(f"Die Begründung muss mindestens {MIN_REASON} Zeichen haben")
    if not ds.get_project(project_id):
        raise ValueError(f"Projekt {project_id} nicht gefunden")

    base_hash: Optional[str] = None
    if kind == "change_text":
        if not uid or not (new_text or "").strip():
            raise ValueError("change_text braucht uid und new_text")
        current = _item(project_id, uid)
        payload: Dict[str, Any] = {"new_text": new_text, "old_text": current["text"]}
        base_hash = _hash(current["text"])
        prefix = None
    elif kind == "new_item":
        if not prefix or not (text or "").strip():
            raise ValueError("new_item braucht prefix (Dokument) und text")
        if prefix not in {d["prefix"] for d in ds.list_documents(project_id)}:
            raise ValueError(f"Dokument {prefix} nicht gefunden")
        for target in links or []:
            _item(project_id, target)
        payload = {"text": text, "links": list(links or [])}
        uid = None
    else:  # add_link
        if not uid or not target_uid:
            raise ValueError("add_link braucht uid und target_uid")
        _item(project_id, uid)
        _item(project_id, target_uid)
        payload = {"target_uid": target_uid}
        prefix = None

    for existing in db.query(Proposal).filter_by(project_id=project_id, kind=kind, uid=uid, prefix=prefix,
                                                 status="open").all():
        if _comparable(json.loads(existing.payload)) == _comparable(payload):
            return existing  # gleicher offener Vorschlag: nicht doppelt anlegen

    p = Proposal(project_id=project_id, kind=kind, uid=uid, prefix=prefix,
                 payload=json.dumps(payload, ensure_ascii=False), reason=reason.strip(), source=source,
                 base_hash=base_hash, status="open", created_by=user)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def get(db: Session, project_id: str, proposal_id: int) -> Proposal:
    p = db.query(Proposal).filter_by(id=proposal_id, project_id=project_id).first()
    if not p:
        raise ValueError(f"Vorschlag {proposal_id} nicht gefunden")
    return p


def list_proposals(db: Session, project_id: str, status: Optional[str] = None, uid: Optional[str] = None) -> List[Proposal]:
    q = db.query(Proposal).filter_by(project_id=project_id)
    if status:
        q = q.filter_by(status=status)
    if uid:
        q = q.filter_by(uid=uid)
    return q.order_by(Proposal.id.desc()).all()


def count_open(db: Session, project_id: str) -> int:
    return db.query(Proposal).filter_by(project_id=project_id, status="open").count()


def _decide(db: Session, p: Proposal, status: str, user: str) -> None:
    p.status = status
    p.decided_by = user
    p.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)


def accept(db: Session, project_id: str, proposal_id: int, user: str) -> Proposal:
    p = get(db, project_id, proposal_id)
    if p.status != "open":
        raise ProposalConflict(f"Der Vorschlag ist nicht mehr offen (Status: {p.status})")
    payload = json.loads(p.payload)
    if p.kind == "change_text":
        current = ds.get_item(project_id, p.uid)
        if not current:
            raise ValueError(f"Anforderung {p.uid} nicht gefunden")
        if _hash(current["text"]) != p.base_hash:
            _decide(db, p, "stale", user)
            raise ProposalConflict("Die Anforderung wurde inzwischen geändert")
        ds.update_item(project_id, p.uid, {"text": payload["new_text"]})
    elif p.kind == "new_item":
        ds.create_item(project_id, p.prefix, {"text": payload["text"], "links": payload.get("links", [])})
    else:
        ds.add_link(project_id, p.uid, payload["target_uid"])
    _decide(db, p, "accepted", user)
    return p


def reject(db: Session, project_id: str, proposal_id: int, user: str) -> Proposal:
    p = get(db, project_id, proposal_id)
    if p.status != "open":
        raise ProposalConflict(f"Der Vorschlag ist nicht mehr offen (Status: {p.status})")
    _decide(db, p, "rejected", user)
    return p


def next_step_rule(project_id: str) -> Optional[Dict[str, Any]]:
    """Regel für next_steps_service.EXTRA_RULES: offene Vorschläge stehen an erster Stelle."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        open_ = list_proposals(db, project_id, status="open")
    finally:
        db.close()
    if not open_:
        return None
    n = len(open_)
    return {
        "key": "open_proposals",
        "title": f"{n} {'Vorschlag wartet' if n == 1 else 'Vorschläge warten'} auf deine Entscheidung",
        "count": n,
        "explanation": "Agenten oder der Assistent haben Änderungen vorgeschlagen. Nichts wird übernommen, "
                       "bevor du es bestätigst.",
        "route": f"/proposals/{project_id}",
        "uids": [p.uid for p in open_ if p.uid][:10],
    }
