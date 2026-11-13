"""Wissensindex (RAG): Suche nach Bedeutung über alle Anforderungen eines Projekts.

Der Index liegt je Projekt unter data/rag/<projekt-id>/ (items.json + items.npy) –
nie im Projektordner (doorstop würde jede *.yml dort als Item lesen). Vor jeder
Abfrage gleicht er sich per Text-Hash selbst mit dem Projekt ab.
"""
import hashlib
import html
import json
import logging
import os
import re
import threading
import time
from collections import deque
from pathlib import Path
from typing import Dict, List, Tuple, TypedDict

import numpy as np
from doorstop.common import DoorstopError

import ai_quality_service as aqs
import doorstop_service as ds
import embedding_service as emb

logger = logging.getLogger(__name__)

RAG_ROOT = Path(__file__).parent.parent / "data" / "rag"
MIN_CHARS = 10
# Konstanten aus A2 (reqman-benchmark: results/RAG_suche.md)
SIMILAR_MIN = 0.62      # Median der Kosinus-Werte verlinkter Paare
DUPLICATE_MIN = 0.90    # 95 %-Wert zwischen verschiedenen echten Anforderungen
# Abschnittstitel beim Einbetten voranstellen: in A2 nicht bewertbar (Korpus ohne Überschriften)
USE_SECTION_TITLE = False

_locks: Dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


class Hit(TypedDict):
    uid: str
    prefix: str
    level: str
    text: str
    score: float
    linked: bool


def _lock(project_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(project_id, threading.Lock())


def clean_text(raw: str) -> str:
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", raw or "")
    t = re.sub(r"<[^>]+>", " ", t)
    t = t.replace("&nbsp;", " ")
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def _paths(project_id: str) -> Tuple[Path, Path]:
    base = RAG_ROOT / project_id
    return base / "items.json", base / "items.npy"


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
            raise ValueError("Index inkonsistent")
        return meta, vectors
    except Exception as e:  # defekter Index -> neu aufbauen
        logger.warning("RAG-Index %s unbrauchbar (%s) – wird neu aufgebaut", project_id, e)
        return _empty()


def _save(project_id: str, meta: dict, vectors: np.ndarray) -> None:
    jp, npp = _paths(project_id)
    jp.parent.mkdir(parents=True, exist_ok=True)
    jtmp, ntmp = jp.with_name("items.json.tmp"), npp.with_name("items.tmp.npy")
    with open(jtmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    with open(ntmp, "wb") as f:
        np.save(f, vectors, allow_pickle=False)
    os.replace(ntmp, npp)
    os.replace(jtmp, jp)


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _level_key(level: str) -> list:
    return [int(x) if x.isdigit() else 0 for x in level.split(".")]


def _collect(project: dict) -> List[dict]:
    """Alle indexierbaren Items; der doorstop-Baum wird einmal gebaut."""
    path = project["path"]
    if not os.path.exists(path):
        return []
    try:
        tree = ds._build_tree(path)
        docs = list(tree.documents)
    except DoorstopError as e:
        logger.warning("doorstop-Fehler beim Indexieren: %s", e)
        return []
    out: List[dict] = []
    for doc in docs:
        section = ""
        dicts = [ds._item_to_dict(i) for i in ds._real_items(doc)]
        dicts.sort(key=lambda d: _level_key(d["level"]))
        for d in dicts:
            if d["header"]:
                section = clean_text(d["text"])
                continue
            if not d["active"]:
                continue
            text = clean_text(d["text"])
            if len(text) < MIN_CHARS:
                continue
            embed_text = f"{section}: {text}" if (USE_SECTION_TITLE and section) else text
            out.append({
                "uid": d["uid"], "prefix": str(doc.prefix), "level": d["level"], "text": text,
                "section": section, "links": d["links"], "reviewed": d["reviewed_current"],
                "hash": _sha(embed_text), "_embed": embed_text,
            })
    return out


_META_KEYS = ("level", "links", "reviewed", "section", "prefix")


def sync_project(project_id: str) -> dict:
    t0 = time.time()
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Project {project_id} not found")
    with _lock(project_id):
        current = _collect(project)
        meta, vectors = _load(project_id)
        if meta.get("model") != emb.get_model():
            meta, vectors = _empty()
        old = {e["uid"]: (e, vectors[i]) for i, e in enumerate(meta["entries"])}
        to_embed = [c for c in current if c["uid"] not in old or old[c["uid"]][0]["hash"] != c["hash"]]
        added = sum(1 for c in to_embed if c["uid"] not in old)
        updated = len(to_embed) - added
        removed = len(set(old) - {c["uid"] for c in current})
        new_by_uid = {}
        if to_embed:
            new_vecs = emb.embed([c["_embed"] for c in to_embed])
            new_by_uid = {c["uid"]: new_vecs[i] for i, c in enumerate(to_embed)}

        entries, rows, changed_meta = [], [], False
        for c in current:
            vec = new_by_uid.get(c["uid"])
            if vec is None:
                oe, vec = old[c["uid"]]
                if any(oe.get(k) != c[k] for k in _META_KEYS):
                    changed_meta = True
            entries.append({k: v for k, v in c.items() if k != "_embed"})
            rows.append(vec)
        if added or updated or removed or changed_meta or meta.get("model") is None:
            mat = np.vstack(rows).astype(np.float32) if rows else np.zeros((0, 0), dtype=np.float32)
            _save(project_id, {"model": emb.get_model(), "entries": entries}, mat)
    return {"total": len(current), "added": added, "updated": updated, "removed": removed,
            "seconds": round(time.time() - t0, 3), "model": emb.get_model()}


def _index(project_id: str) -> Tuple[List[dict], np.ndarray]:
    sync_project(project_id)
    meta, vectors = _load(project_id)
    return meta["entries"], vectors


def _short(text: str, n: int = 300) -> str:
    return text if len(text) <= n else text[:n].rstrip() + "…"


def _hit(e: dict, score: float, linked: bool = False) -> Hit:
    return Hit(uid=e["uid"], prefix=e["prefix"], level=e["level"], text=_short(e["text"]),
               score=round(float(score), 3), linked=linked)


def _rank(entries, scores, k, prefixes, exclude, linked_uids=frozenset()) -> List[Hit]:
    pf = {p.upper() for p in prefixes} if prefixes else None
    ex = set(exclude or ())
    hits: List[Hit] = []
    for i in np.argsort(-scores):
        e = entries[i]
        if e["uid"] in ex or (pf and e["prefix"].upper() not in pf):
            continue
        hits.append(_hit(e, scores[i], e["uid"] in linked_uids))
        if len(hits) >= k:
            break
    return hits


def _words(s: str) -> set:
    return {w.lower() for w in re.findall(r"\w+", s) if len(w) >= 4}


def search(project_id: str, query: str, k: int = 10, prefixes=None, exclude=None) -> List[Hit]:
    entries, vectors = _index(project_id)
    q = query.strip()
    if not entries or not q:
        return []
    first: List[Hit] = []
    exclude = set(exclude or ())
    for e in entries:
        if e["uid"].lower() == q.lower():
            first = [_hit(e, 1.0)]
            exclude.add(e["uid"])
            break
    scores = vectors @ emb.embed([q])[0]
    qw = _words(q)
    if qw:
        for i, e in enumerate(entries):
            scores[i] += 0.15 * (len(qw & _words(e["text"])) / len(qw))
    return (first + _rank(entries, scores, k, prefixes, exclude))[:k]


def similar_to_text(project_id: str, text: str, k: int = 5, prefixes=None, exclude=None) -> List[Hit]:
    entries, vectors = _index(project_id)
    t = clean_text(text)
    if not entries or not t:
        return []
    return _rank(entries, vectors @ emb.embed([t])[0], k, prefixes, exclude)


def similar(project_id: str, uid: str, k: int = 5, prefixes=None) -> List[Hit]:
    entries, vectors = _index(project_id)
    idx = next((i for i, e in enumerate(entries) if e["uid"] == uid), None)
    if idx is None:
        raise ValueError(f"Anforderung {uid} nicht im Index (Überschrift, inaktiv oder zu kurz?)")
    related = set(entries[idx]["links"]) | {e["uid"] for e in entries if uid in e["links"]}
    return _rank(entries, vectors @ vectors[idx], k, prefixes, {uid}, related)


def suggest_links(project_id: str, uid: str, k: int = 5) -> dict:
    prefix = aqs._uid_to_prefix(uid)
    parent = None
    for d in ds.list_documents(project_id):
        if prefix and d["prefix"].upper() == prefix.upper():
            parent = d["parent"]
    if not parent:
        return {"parent_document": None, "suggestions": []}
    entries, _ = _index(project_id)
    me = next((e for e in entries if e["uid"] == uid), None)
    have = set(me["links"]) if me else set()
    hits = similar(project_id, uid, k=k + len(have), prefixes=[parent])
    return {"parent_document": parent, "suggestions": [h for h in hits if h["uid"] not in have][:k]}


def _bfs(start: str, edges: Dict[str, List[str]], by_uid: dict, max_depth: int = 6) -> List[dict]:
    seen, out, queue = {start}, [], deque([(start, 0)])
    while queue:
        cur, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for nxt in edges.get(cur, []):
            if nxt in seen:
                continue
            seen.add(nxt)
            e = by_uid.get(nxt)
            out.append({"uid": nxt, "prefix": e["prefix"] if e else (aqs._uid_to_prefix(nxt) or ""),
                        "text": _short(e["text"]) if e else "", "depth": depth + 1,
                        "reviewed": e.get("reviewed") if e else None})
            queue.append((nxt, depth + 1))
    return out


def impact(project_id: str, uid: str, k_similar: int = 5) -> dict:
    entries, _ = _index(project_id)
    by_uid = {e["uid"]: e for e in entries}
    if uid not in by_uid:
        raise ValueError(f"Anforderung {uid} nicht im Index (Überschrift, inaktiv oder zu kurz?)")
    parents = {e["uid"]: list(e["links"]) for e in entries}
    children: Dict[str, List[str]] = {}
    for e in entries:
        for p in e["links"]:
            children.setdefault(p, []).append(e["uid"])
    down, up = _bfs(uid, children, by_uid), _bfs(uid, parents, by_uid)
    known = {uid} | {x["uid"] for x in down} | {x["uid"] for x in up}
    sim = [h for h in similar(project_id, uid, k=k_similar + 20)
           if h["uid"] not in known and h["score"] >= SIMILAR_MIN][:k_similar]
    return {"uid": uid, "downstream": down, "upstream": up, "similar_unlinked": sim}


# ─── Hilfetexte (A4): Bedienungswissen und Workflow durchsuchbar ─────────────
#
# Quelle: backend/knowledge/*.md (Kopien liegen unter frontend/src/features/help/, ein Test hält sie gleich).
# Ein Abschnitt je Überschrift ## oder ###; die Kennung ist wie auf der Hilfeseite (/help#<slug>).

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"
HELP_FILES = ("bedienung.md", "workflow.md")
HELP_ID = "_help"
_HELP_MIN_CHARS = 40


class HelpHit(TypedDict):
    id: str
    title: str
    text: str
    route: str
    anchor: str
    score: float


def slugify(text: str) -> str:
    """Wie slugify in frontend/src/features/help/pages/HelpPage.tsx (dort passt \\w nur auf ASCII)."""
    t = text.lower()
    t = re.sub(r"[äöü]", lambda m: {"ä": "a", "ö": "o", "ü": "u"}[m.group(0)], t)
    t = re.sub(r"[^\w\s-]", "", t, flags=re.ASCII)
    return re.sub(r"\s+", "-", t.strip(), flags=re.ASCII)


def _strip_md(text: str) -> str:
    t = re.sub(r"```.*?```", " ", text, flags=re.S)  # Codeblöcke (Diagramme, YAML) helfen der Suche nicht
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"[*_`>|]", " ", t)
    t = re.sub(r"-{3,}", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def help_sections() -> List[dict]:
    """Alle Abschnitte der Hilfetexte als Einträge (ohne Vektor)."""
    out: List[dict] = []
    for name in HELP_FILES:
        path = KNOWLEDGE_DIR / name
        if not path.exists():
            continue
        doc = path.stem
        title, body = None, []

        def flush():
            if title is None:
                return
            route = "/help"
            lines = list(body)
            for i, line in enumerate(lines):
                if line.strip():
                    m = re.match(r"\s*Seite:\s*(\S+)", line)
                    if m:
                        route = m.group(1)
                        del lines[i]
                    break
            text = _strip_md("\n".join(lines))
            clean_title = re.sub(r"[*_`]", "", title).strip()
            if len(text) < _HELP_MIN_CHARS or clean_title.lower() == "inhaltsverzeichnis":
                return
            anchor = slugify(clean_title)
            out.append({"id": f"{doc}#{anchor}", "title": clean_title, "text": text, "route": route,
                        "anchor": anchor, "hash": _sha(f"{clean_title}\n{text}")})

        for line in path.read_text(encoding="utf-8").splitlines():
            m = re.match(r"^(#{2,3})\s+(.+)", line)
            if m:
                flush()
                title, body = m.group(2), []
            elif title is not None:
                body.append(line)
        flush()
    return out


def _help_paths() -> Tuple[Path, Path]:
    base = RAG_ROOT / HELP_ID
    return base / "help.json", base / "help.npy"


def sync_help() -> dict:
    """Gleicht den Hilfe-Index mit den Wissensdateien ab (wie sync_project, Hash je Abschnitt)."""
    t0 = time.time()
    jp, npp = _help_paths()
    with _lock(HELP_ID):
        current = help_sections()
        meta, vectors = {"model": None, "entries": []}, np.zeros((0, 0), dtype=np.float32)
        if jp.exists() and npp.exists():
            try:
                with open(jp, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                vectors = np.load(npp, allow_pickle=False)
                if len(meta["entries"]) != len(vectors):
                    raise ValueError("Index inkonsistent")
            except Exception as e:
                logger.warning("Hilfe-Index unbrauchbar (%s) – wird neu aufgebaut", e)
                meta, vectors = {"model": None, "entries": []}, np.zeros((0, 0), dtype=np.float32)
        if meta.get("model") != emb.get_model():
            meta, vectors = {"model": None, "entries": []}, np.zeros((0, 0), dtype=np.float32)
        old = {e["hash"]: vectors[i] for i, e in enumerate(meta["entries"])}
        to_embed = [c for c in current if c["hash"] not in old]
        new = {}
        if to_embed:
            vecs = emb.embed([f"{c['title']}\n{c['text']}" for c in to_embed])
            new = {c["hash"]: vecs[i] for i, c in enumerate(to_embed)}
        changed = bool(to_embed) or [e["id"] for e in meta["entries"]] != [c["id"] for c in current] \
            or meta.get("model") is None
        if changed:
            rows = [new.get(c["hash"], old.get(c["hash"])) for c in current]
            mat = np.vstack(rows).astype(np.float32) if rows else np.zeros((0, 0), dtype=np.float32)
            jp.parent.mkdir(parents=True, exist_ok=True)
            jtmp, ntmp = jp.with_name("help.json.tmp"), npp.with_name("help.tmp.npy")
            with open(jtmp, "w", encoding="utf-8") as f:
                json.dump({"model": emb.get_model(), "entries": current}, f, ensure_ascii=False)
            with open(ntmp, "wb") as f:
                np.save(f, mat, allow_pickle=False)
            os.replace(ntmp, npp)
            os.replace(jtmp, jp)
    return {"total": len(current), "embedded": len(to_embed), "seconds": round(time.time() - t0, 3)}


def search_help(query: str, k: int = 5) -> List[HelpHit]:
    """Suche nach Bedeutung in den Hilfetexten, mit kleinem Wortbonus wie search()."""
    sync_help()
    q = (query or "").strip()
    jp, npp = _help_paths()
    if not q or not jp.exists():
        return []
    with open(jp, "r", encoding="utf-8") as f:
        entries = json.load(f)["entries"]
    vectors = np.load(npp, allow_pickle=False)
    if not entries:
        return []
    scores = vectors @ emb.embed([q])[0]
    qw = _words(q)
    if qw:
        for i, e in enumerate(entries):
            scores[i] += 0.15 * (len(qw & _words(e["title"] + " " + e["text"])) / len(qw))
    out: List[HelpHit] = []
    for i in np.argsort(-scores)[:k]:
        e = entries[i]
        out.append(HelpHit(id=e["id"], title=e["title"], text=_short(e["text"], 600), route=e["route"],
                           anchor=e["anchor"], score=round(float(scores[i]), 3)))
    return out
