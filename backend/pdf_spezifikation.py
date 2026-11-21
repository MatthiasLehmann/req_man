"""PDF-Vorlage „Spezifikation“ (E2): Lastenheft/Pflichtenheft mit Dokumentenlenkung.

Aufbau des Datengerüsts für `templates/spezifikation.typ`:
- `typst_service.build_data` (Anforderungen, Kapitel, Bilder, Trace, offene Punkte),
- `meta`: Dokumentenlenkung aus den Dokument-Eigenschaften (`extensions.reqman.control` der .doorstop.yml),
  überschrieben durch `options.meta` aus dem Dialog,
- `history`: Änderungshistorie aus Git (Commits, die die Ordner der Dokumente berühren),
- `glossary`: Begriffe aus Dokumenten mit Art „Glossar“ (nur wenn der Anhang gewählt ist),
- `options`: Darstellung (fliesstext | tabelle) und Anhänge.

Registrierung: am Ende von `pdf_reports.py` (`RENDERERS["spezifikation"]`).
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Dict, List, Optional

import doorstop_service as ds
import typst_service as ts

HISTORY_LIMIT = 30
LOGO_REL = os.path.join(".reqman", "logo.png")
STATUS_LABELS = {"entwurf": "Entwurf", "pruefung": "Zur Prüfung", "freigegeben": "Freigegeben"}
GLOSSARY_TERM_ATTRS = ("begriff", "term", "abkuerzung", "abkürzung", "abbreviation")


# ── Metadaten ─────────────────────────────────────────────────────────────────

def merge_meta(control: Dict[str, str], override, default_title: str) -> Dict[str, str]:
    """Dokument-Eigenschaften als Vorgabe, `options.meta` überschreibt (leere Felder überschreiben nicht).

    Sonderfall Status: Der Dialog schickt immer einen Status (Vorgabe „entwurf“). „entwurf“ gilt deshalb nur,
    wenn das Dokument selbst keinen Status hat; „pruefung“/„freigegeben“ aus dem Dialog gelten immer.
    """
    meta = {k: (control.get(k) or "") for k in
            ("title", "doc_number", "version", "status", "confidentiality", "author", "reviewer", "approver")}
    if override is not None:
        for k in ("doc_number", "version", "confidentiality"):
            v = (getattr(override, k, "") or "").strip()
            if v:
                meta[k] = v
        st = getattr(override, "status", "") or ""
        if st and (st != "entwurf" or not meta["status"]):
            meta["status"] = st
    if meta["status"] not in STATUS_LABELS:
        meta["status"] = "entwurf"
    meta["status_label"] = STATUS_LABELS[meta["status"]]
    meta["released"] = meta["status"] == "freigegeben"
    meta["title"] = meta["title"] or default_title
    return meta


# ── Git ───────────────────────────────────────────────────────────────────────

def git_history(project_path: str, doc_paths: List[str], limit: int = HISTORY_LIMIT) -> Dict:
    """Commits (neueste zuerst), die einen der Dokumentordner berühren.

    Rückgabe {available, entries: [{hash, date, author, message, tags}], truncated, dirty}.
    Ohne Git-Repository: available = False.
    """
    out = {"available": False, "entries": [], "truncated": False, "dirty": False}
    try:
        from git import Repo
        repo = Repo(project_path, search_parent_directories=True)
        root = repo.working_tree_dir
        rel = [os.path.relpath(p, root).replace(os.sep, "/") for p in doc_paths]
        rel = [r for r in rel if not r.startswith("..")] or ["."]
        tags: Dict[str, List[str]] = {}
        for t in repo.tags:
            try:
                tags.setdefault(t.commit.hexsha, []).append(t.name)
            except Exception:
                continue
        commits = list(repo.iter_commits(paths=rel, max_count=limit + 1))
        out["available"] = True
    except Exception:
        return out
    out["truncated"] = len(commits) > limit
    for c in commits[:limit]:
        msg = (c.message or "").strip().splitlines()
        out["entries"].append({
            "hash": c.hexsha[:8],
            "date": c.authored_datetime.strftime("%d.%m.%Y"),
            "author": str(c.author.name or ""),
            "message": ts.escape_typst(msg[0] if msg else ""),
            "tags": sorted(tags.get(c.hexsha, [])),
        })
    try:
        out["dirty"] = bool(repo.git.status("--porcelain", "--", *rel).strip())
    except Exception:
        pass
    return out


# ── Logo ──────────────────────────────────────────────────────────────────────

def find_logo(project_path: str) -> Optional[tuple]:
    """`.reqman/logo.png` im Projektordner, wenn es ein PNG/JPG ist (am Inhalt geprüft): (Pfad, Endung)."""
    path = os.path.join(project_path, LOGO_REL)
    try:
        if not os.path.isfile(path) or os.path.getsize(path) > 5 * 1024 * 1024:
            return None
        with open(path, "rb") as f:
            kind = ts._sniff(f.read(64))
    except OSError:
        return None
    return (path, kind) if kind in ("png", "jpg") else None


# ── Glossar ───────────────────────────────────────────────────────────────────

_TERM_SPLIT = re.compile(r"^\s*(?:\*\*(?P<b>[^*]+)\*\*|(?P<p>[^:–\n]{1,60}?))\s*(?::|\s–\s|\s-\s)\s*(?P<rest>.+)$", re.S)


def split_term(text: str):
    """„**Begriff**: Erklärung“, „Begriff: Erklärung“ oder „Begriff – Erklärung“ → (Begriff, Erklärung)."""
    plain = re.sub(r"<[^>]+>", "", text or "").strip()
    m = _TERM_SPLIT.match(plain)
    if not m:
        return None, plain
    return (m.group("b") or m.group("p")).strip(), m.group("rest").strip()


def glossary(project_path: str) -> Dict:
    """Begriffe aus allen Dokumenten mit Art „Glossar“; Rückgabe {documents: [prefix], entries: [{term, markup}]}."""
    tree = ds._build_tree(project_path)
    prefixes, entries = [], []
    for doc in tree.documents:
        if ds.read_document_control(str(doc.path)).get("kind") != "glossar":
            continue
        prefixes.append(str(doc.prefix))
        for it in ds._real_items(doc):
            d = ds._item_to_dict(it)
            if not d["active"] or d["header"]:
                continue
            custom = {str(k).lower(): v for k, v in (d.get("custom_attributes") or {}).items()}
            term = next((ts._attr_str(custom[a]) for a in GLOSSARY_TERM_ATTRS if ts._attr_str(custom.get(a))), None)
            if term:
                body = d["text"]
            else:
                term, body = split_term(d["text"])
                term = term or d["uid"]
            entries.append({"term": ts.escape_typst(term), "markup": ts.html_to_typst(body)})
    entries.sort(key=lambda e: e["term"].lower())
    return {"documents": prefixes, "entries": entries}


# ── Renderer ──────────────────────────────────────────────────────────────────

def build_spec_data(project_id: str, req) -> Dict:
    """Datengerüst der Spezifikation (ohne Satz). ValueError: Projekt fehlt; KeyError: Dokument fehlt."""
    opts = req.options
    data = ts.build_data(project_id, documents=list(req.documents) or None,
                         uids=list(req.filter.uids) or None, attributes=list(opts.attributes))
    project = ds.get_project(project_id)
    path = project["path"]
    tree = ds._build_tree(path)
    by_prefix = {str(d.prefix): d for d in tree.documents}
    shown = [d["prefix"] for d in data["documents"]]

    # Vorgabe: Dokumentenlenkung des ersten gezeigten Dokuments
    control = ds.read_document_control(str(by_prefix[shown[0]].path)) if shown else {}
    single = len(shown) == 1
    default_title = f"{project['name']} – {shown[0]}" if single else project["name"]
    data["meta"] = merge_meta(control, opts.meta, default_title)
    data["meta"]["date"] = datetime.now().strftime("%d.%m.%Y")
    data["meta"]["project"] = project["name"]

    # Kapitelüberschrift je Dokument: Titel aus der Dokumentenlenkung, sonst nur das Präfix
    for d in data["documents"]:
        t = ds.read_document_control(str(by_prefix[d["prefix"]].path)).get("title", "")
        d["title"] = ts.escape_typst(t)
    for k in ("title", "doc_number", "version", "confidentiality", "author", "reviewer", "approver", "project"):
        data["meta"][k] = ts.escape_typst(data["meta"][k])

    data["history"] = git_history(path, [str(by_prefix[p].path) for p in shown])
    data["options"] = {"layout": opts.layout, "appendices": list(opts.appendices),
                       "filtered": bool(req.filter.uids)}
    data["glossary"] = glossary(path) if "glossar" in opts.appendices else {"documents": [], "entries": []}
    logo = find_logo(path)
    data["logo"] = f"/logo.{logo[1]}" if logo else None
    data["_logo"] = logo[0] if logo else None
    return data


def render(project_id: str, req) -> bytes:
    if not ts.typst_available():
        raise ts.TypstUnavailable("Typst ist nicht installiert")
    data = build_spec_data(project_id, req)
    extra = {data["logo"].lstrip("/"): data["_logo"]} if data["logo"] else None
    return ts.compile_pdf(data, template="spezifikation", extra_files=extra)
