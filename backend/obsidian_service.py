"""Export eines Projekts als Obsidian-Ordner (B1): Markdown-Notizen, Start.md, .base, .canvas.

Nur ReqMan -> Obsidian. Der Ordner liegt unter data/obsidian/<Projekt>/ (nie im Projektordner:
doorstop würde jede *.yml dort als Item lesen). ReqMan führt in `.reqman-export.json` eine Liste
seiner Dateien mit Hash; nur diese Dateien werden geschrieben oder gelöscht. Alles andere im Ordner
(eigene Notizen, `.obsidian/`) wird nie angefasst. Kein Sprachmodell, kein Ollama: gibt es keinen
Wissensindex, fehlt nur der Abschnitt „Ähnlich“.
"""
import hashlib
import html
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import yaml
from doorstop.common import DoorstopError

import ai_quality_service as aqs
import doorstop_service as ds
import rag_service as rag

logger = logging.getLogger(__name__)

MANIFEST = ".reqman-export.json"
EXPORT_ROOT = Path(__file__).parent.parent / "data" / "obsidian"
SHORT = 120                 # Länge gekürzter Texte in den Verweislisten
SIMILAR_K = 3
CANVAS_MAX_NODES = 300      # darüber: je Dokumentpaar eine Karte
NODE_W, NODE_H, NODE_GAP = 260, 70, 20
COL_W, COL_PAD, GROUP_HEAD = 340, 20, 50
COLOR_NO_LINK = "1"         # JSON-Canvas-Preset 1 = rot


def export_root() -> Path:
    env = os.environ.get("OBSIDIAN_EXPORT_ROOT")
    return Path(env) if env else EXPORT_ROOT


def _safe_name(name: str) -> str:
    n = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name or "").strip(" .")
    return n or "Projekt"


def project_dir(project: dict) -> Path:
    return (export_root() / _safe_name(project["name"])).resolve()


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _short(text: str, n: int = SHORT) -> str:
    t = rag.clean_text(text)
    return t if len(t) <= n else t[:n].rstrip() + "…"


# ─── HTML (TipTap) -> Markdown ───────────────────────────────────────────────

def to_markdown(raw: str) -> str:
    """Einfache Abbildung: Absätze, Listen, fett, kursiv; Rest wird zu Text. Bilder entfallen."""
    t = raw or ""
    t = re.sub(r"<img[^>]*>", "", t)
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", t)
    t = re.sub(r"<(strong|b)>(.*?)</\1>", r"**\2**", t, flags=re.S)
    t = re.sub(r"<(em|i)>(.*?)</\1>", r"*\2*", t, flags=re.S)
    t = re.sub(r"<li[^>]*>", "\n- ", t)
    t = re.sub(r"<br\s*/?>", "\n", t)
    t = re.sub(r"</(p|div|ul|ol|h[1-6]|tr)>", "\n\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


# ─── Daten einsammeln ────────────────────────────────────────────────────────

def _collect(project: dict) -> Tuple[List[dict], List[dict]]:
    """(Dokumente in Hierarchie-Reihenfolge, Items). Der doorstop-Baum wird einmal gebaut."""
    path = project["path"]
    if not os.path.exists(path):
        return [], []
    try:
        tree = ds._build_tree(path)
        docs = list(tree.documents)
    except DoorstopError as e:
        raise ValueError(f"Doorstop-Fehler beim Laden des Projekts: {e}")
    doc_infos = []
    for d in docs:
        try:
            parent = str(d.parent) if d.parent else None
        except Exception:
            parent = None
        doc_infos.append({"prefix": str(d.prefix), "parent": parent})
    prefixes = {d["prefix"] for d in doc_infos}
    for d in doc_infos:
        if d["parent"] not in prefixes:
            d["parent"] = None
    depth_cache: Dict[str, int] = {}

    def depth(p: str, seen=()) -> int:
        if p in depth_cache:
            return depth_cache[p]
        par = next(x["parent"] for x in doc_infos if x["prefix"] == p)
        v = 0 if not par or par in seen else depth(par, seen + (p,)) + 1
        depth_cache[p] = v
        return v

    for d in doc_infos:
        d["depth"] = depth(d["prefix"])
    doc_infos.sort(key=lambda d: (d["depth"], d["prefix"]))

    items: List[dict] = []
    for doc in docs:
        prefix = str(doc.prefix)
        dicts = [ds._item_to_dict(i) for i in ds._real_items(doc)]
        dicts.sort(key=lambda d: rag._level_key(d["level"]))
        for d in dicts:
            if not d["active"]:
                continue
            items.append({**d, "prefix": prefix})
    return doc_infos, items


def _quality(project_id: str, uid: str) -> Tuple[Optional[int], Optional[bool]]:
    try:
        r = aqs.load_quality_result(project_id, uid)
    except Exception:
        return None, None
    if r is None:
        return None, None
    return r.score.overall, r.score.passed


def _open_proposals(project_id: str, db) -> Dict[str, int]:
    if db is None:
        return {}
    try:
        import proposals_service as ps
        out: Dict[str, int] = {}
        for p in ps.list_proposals(db, project_id, status="open"):
            if p.uid:
                out[p.uid] = out.get(p.uid, 0) + 1
        return out
    except Exception as e:  # Vorschläge sind Beiwerk, nie Grund für einen Fehlschlag
        logger.warning("Obsidian-Export: Vorschläge nicht lesbar: %s", e)
        return {}


def _similar_map(project_id: str, uids: set) -> Dict[str, List[Tuple[str, float]]]:
    """Ähnliche, nicht verlinkte Anforderungen aus dem vorhandenen Index – ohne Einbetter-Aufruf."""
    try:
        meta, vectors = rag._load(project_id)
        entries = meta["entries"]
        if not entries or not len(vectors):
            return {}
        by_uid = {e["uid"]: i for i, e in enumerate(entries)}
        out: Dict[str, List[Tuple[str, float]]] = {}
        for uid in uids:
            i = by_uid.get(uid)
            if i is None:
                continue
            e = entries[i]
            related = set(e["links"]) | {x["uid"] for x in entries if uid in x["links"]}
            scores = vectors @ vectors[i]
            hits: List[Tuple[str, float]] = []
            for j in scores.argsort()[::-1]:
                o = entries[j]
                if o["uid"] == uid or o["uid"] in related or o["uid"] not in uids:
                    continue
                if scores[j] < rag.SIMILAR_MIN:
                    break
                hits.append((o["uid"], round(float(scores[j]), 2)))
                if len(hits) >= SIMILAR_K:
                    break
            if hits:
                out[uid] = hits
        return out
    except Exception as e:
        logger.warning("Obsidian-Export: Wissensindex nicht nutzbar (%s) – ohne Ähnlichkeiten", e)
        return {}


# ─── Dateien erzeugen ────────────────────────────────────────────────────────

def _frontmatter(data: Dict[str, Any]) -> str:
    body = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False, width=1000)
    return f"---\n{body}---\n"


def _file_key(it: dict) -> str:
    return f"{it['prefix']}/{it['uid']}.md"


def _build_files(project: dict, db, base_url: str) -> Tuple[Dict[str, str], dict]:
    """Alle zu exportierenden Dateien als {relativer Pfad: Inhalt}."""
    pid = project["id"]
    docs, items = _collect(project)
    reqs = [i for i in items if not i["header"]]
    heads = [i for i in items if i["header"]]
    by_uid = {i["uid"]: i for i in reqs}
    known = set(by_uid)
    parent_doc = {d["prefix"]: d["parent"] for d in docs}
    children: Dict[str, List[str]] = {}
    for i in reqs:
        for p in i["links"]:
            if p in known:
                children.setdefault(p, []).append(i["uid"])
    proposals = _open_proposals(pid, db)
    similar = _similar_map(pid, known)
    files: Dict[str, str] = {}
    ohne_link: set = set()

    for it in reqs:
        uid, prefix = it["uid"], it["prefix"]
        ups = [p for p in it["links"] if p in known]
        downs = sorted(children.get(uid, []))
        needs_parent = bool(parent_doc.get(prefix)) and not it["derived"]
        no_link = needs_parent and not it["links"]
        if no_link:
            ohne_link.add(uid)
        rc = it["reviewed_current"]
        note, passed = _quality(pid, uid)
        fm: Dict[str, Any] = {
            "typ": "anforderung", "uid": uid, "dokument": prefix, "level": it["level"],
            "review": "veraltet" if rc is False else ("aktuell" if rc else "fehlt"),
        }
        if note is not None:
            fm["ki_note"] = note
            fm["ki_bestanden"] = passed
        fm.update({
            "eltern": [f"[[{p}]]" for p in ups],
            "kinder_anzahl": len(downs),
            "ohne_link_oben": no_link,
            "offene_vorschlaege": proposals.get(uid, 0),
            "reqman_hash": _sha(it["text"]),
            "reqman_url": f"{base_url.rstrip('/')}/requirements/{pid}?uid={uid}" if base_url else "",
        })
        parts = [_frontmatter(fm), to_markdown(it["text"]) + "\n"]
        if ups:
            parts.append("\n## Verlinkt nach oben\n" + "\n".join(
                f"- [[{p}]] – {_short(by_uid[p]['text'])}" for p in ups) + "\n")
        if downs:
            parts.append("\n## Abgeleitet\n" + "\n".join(
                f"- [[{c}]] – {_short(by_uid[c]['text'])}" for c in downs) + "\n")
        if uid in similar:
            parts.append("\n## Ähnlich, aber nicht verlinkt\n" + "\n".join(
                f"- [[{o}]] ({str(s).replace('.', ',')})" for o, s in similar[uid]) + "\n")
        files[_file_key(it)] = "".join(parts)

    for h in heads:
        key = f"{h['prefix']}/_Abschnitt {h['level']}.md"
        files[key] = _frontmatter({"typ": "abschnitt", "dokument": h["prefix"], "level": h["level"]}) \
            + f"# {_short(h['text'], 300) or 'Abschnitt ' + h['level']}\n"

    canvases = _canvases(docs, reqs, ohne_link)
    files.update(canvases)
    files["Uebersicht.base"] = _base([d["prefix"] for d in docs])
    files["Start.md"] = _start(project, docs, reqs, ohne_link, sorted(canvases))
    stats = {"documents": len(docs), "requirements": len(reqs), "sections": len(heads),
             "without_link": len(ohne_link), "canvases": sorted(canvases)}
    return files, stats


def _start(project: dict, docs: List[dict], reqs: List[dict], ohne_link: set, canvases: List[str]) -> str:
    pid = project["id"]
    n_by = {d["prefix"]: sum(1 for r in reqs if r["prefix"] == d["prefix"]) for d in docs}
    lines = [_frontmatter({"typ": "start", "projekt": project["name"]}),
             f"# {project['name']}\n",
             f"Stand: {datetime.now().strftime('%d.%m.%Y %H:%M')} · {len(reqs)} Anforderungen in "
             f"{len(docs)} Dokumenten · Quelle der Wahrheit ist ReqMan, diese Dateien werden bei jedem "
             f"Export neu erzeugt.\n",
             "## Dokumente\n", "| Dokument | Eltern | Anforderungen |", "|---|---|---|"]
    for d in docs:
        lines.append(f"| {d['prefix']} | {d['parent'] or '–'} | {n_by[d['prefix']]} |")
    lines += ["", "## Dokumenthierarchie\n", "```mermaid", "graph TD"]
    for d in docs:
        lines.append(f"  {d['prefix']}[\"{d['prefix']} ({n_by[d['prefix']]})\"]")
    for d in docs:
        if d["parent"]:
            lines.append(f"  {d['parent']} --> {d['prefix']}")
    lines += ["```", "", "## Ansichten\n", "- [[Uebersicht.base|Übersicht (Tabellen und Karten)]]"]
    if "Traceability.canvas" in canvases:
        lines.append("- [[Traceability.canvas|Traceability-Landkarte]]")
    else:
        lines += [f"- [[{c}]]" for c in canvases]
    try:
        import next_steps_service as ns
        steps = ns.next_steps(pid)
    except Exception as e:
        logger.warning("Obsidian-Export: Nächste Schritte nicht verfügbar: %s", e)
        steps = []
    lines += ["", "## Nächste Schritte\n"]
    if not steps:
        lines.append("Keine offenen Schritte.")
    for s in steps:
        refs = ", ".join(f"[[{u}]]" for u in s["uids"])
        more = " …" if s["count"] > len(s["uids"]) else ""
        lines.append(f"- **{s['title']}** – {refs}{more}" if refs else f"- **{s['title']}**")
    return "\n".join(lines) + "\n"


def _base(prefixes: List[str]) -> str:
    """Obsidian Bases (help.obsidian.md/bases/syntax): filters/views/order/groupBy, Frontmatter als note.*."""
    order = ["file.name", "dokument", "level", "review", "ki_note", "kinder_anzahl", "offene_vorschlaege"]

    def table(name: str, flt: Optional[str], group: bool = False) -> dict:
        v: Dict[str, Any] = {"type": "table", "name": name}
        if flt:
            v["filters"] = {"and": [flt]}
        if group:
            v["groupBy"] = {"property": "dokument", "direction": "ASC"}
        v["order"] = order
        return v

    views = [
        table("Alle", None, group=True),
        table("Ohne Link nach oben", "ohne_link_oben == true"),
        table("Seit Review geändert", 'review == "veraltet"'),
        table("Unter Mindestnote", "ki_bestanden == false"),
        table("Offene Vorschläge", "offene_vorschlaege > 0"),
    ]
    for p in prefixes:
        views.append({"type": "cards", "name": f"Karten {p}", "filters": {"and": [f'dokument == "{p}"']},
                      "order": ["file.name", "level", "review"]})
    data = {"filters": {"and": ['typ == "anforderung"']},
            "properties": {"dokument": {"displayName": "Dokument"}, "ki_note": {"displayName": "KI-Note"},
                           "kinder_anzahl": {"displayName": "Abgeleitet"},
                           "offene_vorschlaege": {"displayName": "Vorschläge"}},
            "views": views}
    return yaml.safe_dump(data, allow_unicode=True, sort_keys=False, default_flow_style=False, width=1000)


# ─── JSON Canvas 1.0 (jsoncanvas.org/spec/1.0) ───────────────────────────────

def _canvas_json(cols: List[Tuple[str, List[dict]]], edges: List[Tuple[str, str]], ohne_link: set) -> str:
    nodes: List[dict] = []
    for ci, (prefix, its) in enumerate(cols):
        x0 = ci * COL_W
        nodes.append({"id": f"g-{prefix}", "type": "group", "label": prefix, "x": x0, "y": 0,
                      "width": NODE_W + 2 * COL_PAD,
                      "height": GROUP_HEAD + len(its) * (NODE_H + NODE_GAP) + COL_PAD})
    for ci, (prefix, its) in enumerate(cols):
        for ri, it in enumerate(its):
            n = {"id": f"n-{it['uid']}", "type": "file", "file": _file_key(it),
                 "x": ci * COL_W + COL_PAD, "y": GROUP_HEAD + ri * (NODE_H + NODE_GAP),
                 "width": NODE_W, "height": NODE_H}
            if it["uid"] in ohne_link:
                n["color"] = COLOR_NO_LINK
            nodes.append(n)
    col_of = {it["uid"]: ci for ci, (_, its) in enumerate(cols) for it in its}
    out_edges = []
    for child, parent in edges:
        right = col_of[child] > col_of[parent]
        out_edges.append({"id": f"e-{child}-{parent}", "fromNode": f"n-{child}",
                          "fromSide": "left" if right else "right",
                          "toNode": f"n-{parent}", "toSide": "right" if right else "left", "toEnd": "arrow"})
    return json.dumps({"nodes": nodes, "edges": out_edges}, ensure_ascii=False, indent=1) + "\n"


def _canvases(docs: List[dict], reqs: List[dict], ohne_link: set) -> Dict[str, str]:
    if not reqs:
        return {}
    by_uid = {r["uid"]: r for r in reqs}
    per_doc = {d["prefix"]: [r for r in reqs if r["prefix"] == d["prefix"]] for d in docs}
    all_edges = [(r["uid"], p) for r in reqs for p in r["links"] if p in by_uid]
    if len(reqs) <= CANVAS_MAX_NODES:
        cols = [(d["prefix"], per_doc[d["prefix"]]) for d in docs if per_doc[d["prefix"]]]
        return {"Traceability.canvas": _canvas_json(cols, all_edges, ohne_link)}
    out: Dict[str, str] = {}
    pairs = sorted({(by_uid[p]["prefix"], by_uid[c]["prefix"]) for c, p in all_edges
                    if by_uid[p]["prefix"] != by_uid[c]["prefix"]})
    for par, chi in pairs:
        edges = [(c, p) for c, p in all_edges if by_uid[p]["prefix"] == par and by_uid[c]["prefix"] == chi]
        cols = [(par, per_doc[par]), (chi, per_doc[chi])]
        out[f"Traceability_{par}_{chi}.canvas"] = _canvas_json(cols, edges, ohne_link)
    return out


# ─── Abgleich ────────────────────────────────────────────────────────────────

def _read_manifest(target: Path) -> Dict[str, str]:
    try:
        with open(target / MANIFEST, "r", encoding="utf-8") as f:
            files = json.load(f).get("files", {})
        return {k: v for k, v in files.items() if isinstance(k, str) and isinstance(v, str)}
    except (OSError, ValueError):
        return {}


def _inside(target: Path, rel: str) -> Optional[Path]:
    p = (target / rel).resolve()
    try:
        p.relative_to(target)
    except ValueError:
        return None
    return p


def _file_sha(p: Path) -> Optional[str]:
    try:
        return _sha(p.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return None


def open_url(target: Path) -> str:
    return "obsidian://open?path=" + quote(str(target / "Start.md"), safe="")


def export_project(project_id: str, db=None, base_url: str = "", dry_run: bool = False) -> dict:
    t0 = time.time()
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    target = project_dir(project)
    files, stats = _build_files(project, db, base_url)
    manifest = _read_manifest(target)
    new_hashes = {rel: _sha(c) for rel, c in files.items()}
    written, kept, removed, skipped = [], [], [], 0

    for rel, content in files.items():
        p = _inside(target, rel)
        if p is None:
            continue
        on_disk = _file_sha(p)
        if on_disk == new_hashes[rel]:
            skipped += 1
            continue
        if rel in manifest and on_disk is not None and on_disk != manifest[rel] \
                and manifest[rel] == new_hashes[rel]:
            kept.append(rel)   # in Obsidian geändert, ReqMan unverändert: Änderung nicht überschreiben (B2)
            new_hashes[rel] = on_disk
            continue
        written.append(rel)
        if not dry_run:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8", newline="\n")

    for rel in sorted(set(manifest) - set(files)):
        p = _inside(target, rel)
        if p is None or not p.is_file():
            continue
        if _file_sha(p) != manifest[rel]:
            kept.append(rel)   # vom Nutzer geändert: nicht löschen
            new_hashes[rel] = _file_sha(p) or manifest[rel]
            continue
        removed.append(rel)
        if not dry_run:
            p.unlink()
            try:
                p.parent.rmdir()   # nur wenn leer
            except OSError:
                pass

    if not dry_run and (written or removed or kept or not (target / MANIFEST).exists()):
        target.mkdir(parents=True, exist_ok=True)
        with open(target / MANIFEST, "w", encoding="utf-8") as f:
            json.dump({"version": 1, "project": project["name"],
                       "exported_at": datetime.now(timezone.utc).isoformat(), "files": new_hashes},
                      f, ensure_ascii=False, indent=1)
    return {"path": str(target), "start_path": str(target / "Start.md"), "written": len(written),
            "removed": len(removed), "unchanged": skipped, "kept_edited": len(kept),
            "seconds": round(time.time() - t0, 3), "open_url": open_url(target), **stats}


def status(project_id: str, db=None, base_url: str = "") -> dict:
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    target = project_dir(project)
    manifest = _read_manifest(target)
    exported_at = None
    try:
        with open(target / MANIFEST, "r", encoding="utf-8") as f:
            exported_at = json.load(f).get("exported_at")
    except (OSError, ValueError):
        pass
    pending = None
    if manifest:
        r = export_project(project_id, db, base_url, dry_run=True)
        pending = r["written"] + r["removed"]
    return {"path": str(target), "exported": bool(manifest), "files": len(manifest),
            "exported_at": exported_at, "pending_changes": pending, "open_url": open_url(target)}
