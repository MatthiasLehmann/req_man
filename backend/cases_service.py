"""Fallspeicher (L2): Urteile zu Befunden und angenommene Vorschläge als Fälle, gleiche Bauart wie der Wissensindex.

Liegt je Projekt unter data/rag/<projekt-id>/ (cases.json + cases.npy), nie im Projektordner. Eingebettet wird der
Text der Anforderung. Ein Fall ist entweder
  kind="finding":  Urteil zu einem Befund (verdict "applies" | "not_applies"), Schlüssel uid|Kategorie|Befund|Benutzer
  kind="proposal": angenommener Vorschlag „alt → neu“ (text = alter, new_text = neuer Text), Schlüssel proposal|<id>

Wirkung nur im Code (ai_quality_service.apply_feedback): ähnliche Fälle gleicher Kategorie stufen einen Befund herab.
Der Einbetter ist über embedding_service.set_embedder austauschbar (Tests ohne Ollama).
"""
import hashlib
import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

import embedding_service as emb
import rag_service as rag

logger = logging.getLogger(__name__)

VERDICTS = ("applies", "not_applies")
_lock = threading.Lock()


def _paths(project_id: str) -> Tuple[Path, Path]:
    base = rag.RAG_ROOT / project_id
    return base / "cases.json", base / "cases.npy"


def _empty() -> Tuple[dict, np.ndarray]:
    return {"model": None, "entries": []}, np.zeros((0, 0), dtype=np.float32)


def _load(project_id: str) -> Tuple[dict, np.ndarray]:
    jp, npp = _paths(project_id)
    if not jp.exists() or not npp.exists():
        return _empty()
    try:
        with open(jp, "r", encoding="utf-8") as f:
            meta = json.load(f)
        vectors = np.load(npp, allow_pickle=False)
        if len(meta["entries"]) != len(vectors):
            raise ValueError("Fallspeicher inkonsistent")
        return meta, vectors
    except Exception as e:  # defekt -> leer beginnen (Fälle lassen sich aus der Datenbank neu aufbauen)
        logger.warning("Fallspeicher %s unbrauchbar (%s)", project_id, e)
        return _empty()


def _save(project_id: str, meta: dict, vectors: np.ndarray) -> None:
    jp, npp = _paths(project_id)
    jp.parent.mkdir(parents=True, exist_ok=True)
    jtmp, ntmp = jp.with_name("cases.json.tmp"), npp.with_name("cases.tmp.npy")
    with open(jtmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    with open(ntmp, "wb") as f:
        np.save(f, vectors, allow_pickle=False)
    os.replace(ntmp, npp)
    os.replace(jtmp, jp)


def text_hash(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def finding_key(uid: str, category: str, finding: str, user: str) -> str:
    return "finding|" + text_hash(f"{uid}|{category.lower()}|{finding}|{user}")[:24]


def upsert_cases(project_id: str, cases: List[Dict[str, Any]]) -> int:
    """Legt Fälle an oder ersetzt sie (nach Schlüssel). Je Fall: key, kind, text (Anforderungstext) und je nach Art
    verdict/category/finding/uid bzw. new_text/uid. Gibt die Zahl gespeicherter Fälle zurück."""
    prepared = []
    for c in cases or []:
        text = rag.clean_text(c.get("text") or "")
        if not text or not c.get("key"):
            continue
        entry = {k: v for k, v in c.items() if k != "text"}
        entry["text"] = text
        entry["hash"] = text_hash(text)
        prepared.append(entry)
    if not prepared:
        return 0
    with _lock:
        meta, vectors = _load(project_id)
        if meta.get("model") not in (None, emb.get_model()):
            meta, vectors = _empty()
        old = {e["key"]: (e, vectors[i]) for i, e in enumerate(meta["entries"])}
        new_vecs = emb.embed([p["text"] for p in prepared])
        for p, v in zip(prepared, new_vecs):
            old[p["key"]] = (p, v)
        entries = [e for e, _ in old.values()]
        mat = np.vstack([v for _, v in old.values()]).astype(np.float32)
        _save(project_id, {"model": emb.get_model(), "entries": entries}, mat)
    return len(prepared)


def remove_case(project_id: str, key: str) -> bool:
    with _lock:
        meta, vectors = _load(project_id)
        keep = [i for i, e in enumerate(meta["entries"]) if e["key"] != key]
        if len(keep) == len(meta["entries"]):
            return False
        mat = vectors[keep] if keep else np.zeros((0, 0), dtype=np.float32)
        _save(project_id, {"model": meta.get("model"), "entries": [meta["entries"][i] for i in keep]}, mat)
    return True


def count(project_id: str) -> int:
    return len(_load(project_id)[0]["entries"])


def similar_cases(project_id: str, text: str, kind: Optional[str] = None, category: Optional[str] = None,
                  min_score: float = 0.0, k: int = 10) -> List[Dict[str, Any]]:
    """Die ähnlichsten Fälle zum Anforderungstext (Kosinus), optional nach Art und Kategorie gefiltert."""
    meta, vectors = _load(project_id)
    t = rag.clean_text(text)
    if not meta["entries"] or not t:
        return []
    if meta.get("model") != emb.get_model():
        return []
    scores = vectors @ emb.embed([t])[0]
    out: List[Dict[str, Any]] = []
    for i in np.argsort(-scores):
        e = meta["entries"][i]
        if scores[i] < min_score:
            break
        if kind and e.get("kind") != kind:
            continue
        if category and (e.get("category") or "").lower() != category.lower():
            continue
        out.append({**e, "score": round(float(scores[i]), 3)})
        if len(out) >= k:
            break
    return out


# ─── Aus der Datenbank aufbauen ───────────────────────────────────────────────

def finding_case(row) -> Dict[str, Any]:
    return {"key": finding_key(row.uid, row.category, row.finding, row.created_by or ""), "kind": "finding",
            "verdict": row.verdict, "category": row.category, "finding": row.finding, "uid": row.uid,
            "text": row.requirement_text}


def proposal_case(p) -> Optional[Dict[str, Any]]:
    """Angenommener Textvorschlag (change_text) als Fall „alt → neu“."""
    if p.kind != "change_text" or p.status != "accepted":
        return None
    payload = json.loads(p.payload or "{}")
    if not payload.get("old_text") or not payload.get("new_text"):
        return None
    return {"key": f"proposal|{p.id}", "kind": "proposal", "uid": p.uid, "text": payload["old_text"],
            "new_text": payload["new_text"], "reason": p.reason}


def rebuild_from_db(db, project_id: str) -> Dict[str, int]:
    """Gleicht den Fallspeicher mit finding_feedback und angenommenen Vorschlägen ab (idempotent)."""
    from database import FindingFeedback, Proposal
    cases = [finding_case(r) for r in db.query(FindingFeedback).filter_by(project_id=project_id).all()]
    n_find = len(cases)
    for p in db.query(Proposal).filter_by(project_id=project_id, status="accepted").all():
        c = proposal_case(p)
        if c:
            cases.append(c)
    upsert_cases(project_id, cases)
    return {"findings": n_find, "proposals": len(cases) - n_find}
