"""Gesetztes Lastenheft als PDF (B3) – Daten aus doorstop, Satz durch Typst.

Ablauf: Anforderungen lesen → in ein JSON-Gerüst umsetzen (Texte als bereits maskiertes
Typst-Markup) → `templates/lastenheft.typ` mit Typst kompilieren → PDF-Bytes.

Typst wird bevorzugt als Python-Paket `typst` genutzt (kompiliert ohne externes Programm),
sonst als Programm über die Umgebungsvariable `TYPST_BIN`. Ist beides nicht vorhanden,
wird `TypstUnavailable` geworfen (Router: 503).
"""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, List, Optional

import doorstop_service as ds

TEMPLATE = Path(__file__).parent / "templates" / "lastenheft.typ"
COMPILE_TIMEOUT_S = 60


class TypstUnavailable(RuntimeError):
    """Typst ist weder als Python-Paket noch über TYPST_BIN verfügbar."""


class TypstFailed(RuntimeError):
    """Typst hat das Dokument nicht gesetzt."""


# ── Maskierung ───────────────────────────────────────────────────────────────

# Zeichen mit Bedeutung im Typst-Markup; jedes wird mit Backslash maskiert.
_SPECIAL = set("\\#$*_@<>`~[]{}=-+/%")
_ESC_RE = re.compile("[" + re.escape("".join(sorted(_SPECIAL))) + "]")


def escape_typst(text: str) -> str:
    """Maskiert Typst-Sonderzeichen (`#`, `$`, `*`, `_`, `@`, `<` …) in Fließtext."""
    return _ESC_RE.sub(lambda m: "\\" + m.group(0), text or "")


def _typst_string(text: str) -> str:
    """Typst-Zeichenkette in Anführungszeichen (für #raw)."""
    return '"' + (text or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


# ── HTML (TipTap) → Typst-Markup ─────────────────────────────────────────────

_WRAP = {
    "strong": "#strong[", "b": "#strong[", "em": "#emph[", "i": "#emph[",
    "u": "#underline[", "s": "#strike[", "del": "#strike[",
    "sub": "#sub[", "sup": "#super[", "mark": "#highlight[",
}
_BLOCK_CLOSE = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "tr"}


class _HtmlToTypst(HTMLParser):
    """Einfache Abbildung: Absätze, fett, kursiv, Listen, Code, Tabellen (als Textzeilen)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self.stack: List[tuple] = []        # (Tag, Schließer) je offenem Tag
        self.lists: List[str] = []          # "ul" | "ol" je Verschachtelungstiefe
        self.in_code = 0
        self.code_buf: List[str] = []

    def _para(self) -> None:
        if self.out and not self.out[-1].endswith("\n\n"):
            self.out.append("\n\n")

    def handle_starttag(self, tag: str, attrs) -> None:
        a = dict(attrs)
        if tag in _WRAP:
            self.out.append(_WRAP[tag]); self.stack.append((tag, "]"))
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._para(); self.out.append("#strong["); self.stack.append((tag, "]"))
        elif tag in ("p", "div", "blockquote", "table", "tr"):
            self._para(); self.stack.append((tag, ""))
        elif tag in ("ul", "ol"):
            self.lists.append(tag); self.stack.append((tag, ""))
            if len(self.lists) == 1:
                self._para()
        elif tag == "li":
            ind = "  " * max(len(self.lists) - 1, 0)
            mark = "+" if self.lists and self.lists[-1] == "ol" else "-"
            if self.out and not self.out[-1].endswith("\n"):
                self.out.append("\n")
            self.out.append(f"{ind}{mark} "); self.stack.append((tag, ""))
        elif tag == "br":
            self.out.append(" #linebreak() ")
        elif tag in ("code", "pre"):
            self.in_code += 1; self.code_buf = []; self.stack.append((tag, ""))
        elif tag in ("td", "th"):
            self.stack.append((tag, " | "))
        elif tag == "img":
            alt = (a.get("alt") or "").strip()
            self.out.append("#emph[" + escape_typst(f"[Abbildung{': ' + alt if alt else ''}]") + "]")
        else:
            self.stack.append((tag, ""))

    def handle_endtag(self, tag: str) -> None:
        # passenden offenen Tag suchen (tolerant gegenüber unsauberem HTML)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for _t, close in reversed(self.stack[i:]):
                    self.out.append(close)
                del self.stack[i:]
                break
        else:
            return
        if tag in ("ul", "ol") and self.lists:
            self.lists.pop()
        if tag in ("code", "pre") and self.in_code:
            self.in_code -= 1
            if self.in_code == 0 and self.code_buf:
                self.out.append("#raw(" + _typst_string("".join(self.code_buf)) + ")")
                self.code_buf = []
        if tag in _BLOCK_CLOSE:
            self._para()
        elif tag == "li":
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_code:
            self.code_buf.append(data)
            return
        if not data.strip():
            if self.out and not self.out[-1].endswith(("\n", " ")):
                self.out.append(" ")
            return
        # Leerzeile im Rohtext = Absatz, sonst Whitespace zusammenfassen
        parts = re.split(r"\n\s*\n", data)
        for n, part in enumerate(parts):
            if n:
                self._para()
            self.out.append(escape_typst(re.sub(r"\s+", " ", part)))

    def result(self) -> str:
        while self.stack:
            self.out.append(self.stack.pop()[1])
        text = "".join(self.out)
        return re.sub(r"\n{3,}", "\n\n", text).strip()


def html_to_typst(raw: str) -> str:
    """Wandelt TipTap-HTML (oder Klartext) in sicheres Typst-Markup um."""
    raw = re.sub(r"!\[([^\]]*)\]\([^)]*\)", lambda m: f'<img alt="{html.escape(m.group(1))}">', raw or "")
    p = _HtmlToTypst()
    p.feed(raw)
    p.close()
    return p.result()


# ── Daten sammeln ────────────────────────────────────────────────────────────

def label_for(uid: str) -> str:
    """Gültiger Typst-Label-Name zu einer UID."""
    return "u-" + re.sub(r"[^A-Za-z0-9_.:-]", "_", uid)


def _level_key(level: str):
    try:
        return tuple(int(p) for p in str(level).split("."))
    except ValueError:
        return (10 ** 9,)


def _level_parts(level: str) -> List[str]:
    parts = str(level).split(".")
    while len(parts) > 1 and parts[-1] == "0":
        parts.pop()
    return parts


def _git_stand(path: str) -> Optional[str]:
    try:
        from git import Repo
        c = Repo(path).head.commit
        return f"{c.hexsha[:8]} vom {c.authored_datetime.strftime('%d.%m.%Y')}"
    except Exception:
        return None


def _status(d: Dict) -> str:
    if d["reviewed"] is None:
        return "nicht geprüft"
    return "geprüft" if d["reviewed_current"] else "geändert nach Prüfung"


def build_data(project_id: str, document: Optional[str] = None) -> Dict:
    """Sammelt alles, was das Template braucht. ValueError bei unbekanntem Projekt, KeyError bei unbekanntem Dokument."""
    project = ds.get_project(project_id)
    if not project:
        raise ValueError("Projekt nicht gefunden")
    path = project["path"]
    if not os.path.exists(path):
        raise ValueError("Projektverzeichnis nicht gefunden")
    tree = ds._build_tree(path)
    all_docs = list(tree.documents)
    if document:
        docs = [d for d in all_docs if str(d.prefix) == document]
        if not docs:
            raise KeyError(document)
    else:
        docs = all_docs

    loaded: Dict[str, Dict] = {}        # uid → dict (alle Dokumente, für Links/Ziele)
    order: Dict[str, List[Dict]] = {}   # prefix → nach Ebene sortierte Items
    for doc in all_docs:
        items = sorted(ds._real_items(doc), key=lambda i: _level_key(str(i.level)))
        order[str(doc.prefix)] = []
        for it in items:
            d = ds._item_to_dict(it)
            d["prefix"] = str(doc.prefix)
            loaded[d["uid"]] = d
            order[str(doc.prefix)].append(d)

    selected = {str(d.prefix) for d in docs}
    shown = {u for u, d in loaded.items() if d["prefix"] in selected and d["active"]}

    def ref(uid: str) -> Dict:
        return {"uid": uid, "ref": label_for(uid), "ok": uid in shown}

    out_docs: List[Dict] = []
    for doc in docs:
        prefix = str(doc.prefix)
        entries = []
        for d in order[prefix]:
            if not d["active"]:
                continue
            parts = _level_parts(d["level"])
            if d["header"]:
                entries.append({
                    "kind": "heading", "uid": d["uid"], "ref": label_for(d["uid"]),
                    "depth": min(len(parts) + 1, 5), "level": ".".join(parts),
                    "markup": html_to_typst(d["text"]) or escape_typst(d["uid"]),
                })
            else:
                entries.append({
                    "kind": "req", "uid": d["uid"], "ref": label_for(d["uid"]),
                    "level": ".".join(parts), "markup": html_to_typst(d["text"]),
                    "normative": d["normative"], "derived": d["derived"],
                    "status": _status(d), "parents": [ref(l) for l in d["links"]],
                })
        out_docs.append({"prefix": prefix, "items": entries})

    # Trace-Tabelle: Eltern ↔ Kinder für alle Verknüpfungen, die ein gewähltes Dokument berühren
    children: Dict[str, List[str]] = {}
    for d in loaded.values():
        if d["active"]:
            for l in d["links"]:
                children.setdefault(l, []).append(d["uid"])
    doc_pos = {str(d.prefix): i for i, d in enumerate(all_docs)}
    parents_with_children_docs = {str(c.parent) for c in all_docs if c.parent}
    trace = []
    for uid in sorted(loaded, key=lambda u: (doc_pos[loaded[u]["prefix"]], _level_key(loaded[u]["level"]))):
        p = loaded[uid]
        if not p["active"] or p["header"]:
            continue
        kids = [c for c in children.get(uid, [])
                if c in loaded and (loaded[c]["prefix"] in selected or p["prefix"] in selected)]
        wants_kids = p["prefix"] in selected and p["prefix"] in parents_with_children_docs
        if not kids and not wants_kids:
            continue
        trace.append({"parent": ref(uid), "doc": p["prefix"], "children": [ref(k) for k in sorted(kids)]})

    open_pts = []
    for doc in docs:
        has_parent = bool(doc.parent)
        for d in order[str(doc.prefix)]:
            if not d["active"] or d["header"]:
                continue
            reasons = []
            if d["reviewed"] is None:
                reasons.append("nicht geprüft")
            elif not d["reviewed_current"]:
                reasons.append("geändert nach Prüfung")
            if has_parent and not d["derived"] and not d["links"]:
                reasons.append("kein Verweis auf das übergeordnete Dokument")
            broken = [l for l in d["links"] if l not in loaded]
            if broken:
                reasons.append("Verweis ins Leere: " + ", ".join(broken))
            if reasons:
                open_pts.append({"uid": d["uid"], "ref": label_for(d["uid"]), "doc": str(doc.prefix),
                                 "reasons": "; ".join(reasons)})

    return {
        "title": project["name"],
        "subtitle": ("Dokument " + document) if document else "Lastenheft",
        "documents_label": ", ".join(str(d.prefix) for d in docs),
        "stand": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "git": _git_stand(path),
        "documents": out_docs,
        "trace": trace,
        "open_points": open_pts,
        "counts": {"anforderungen": sum(1 for d in out_docs for e in d["items"] if e["kind"] == "req")},
    }


# ── Satz ─────────────────────────────────────────────────────────────────────

def _typst_bin() -> Optional[str]:
    b = os.environ.get("TYPST_BIN")
    if b and (os.path.isfile(b) or shutil.which(b)):
        return b
    return None


def _typst_module():
    try:
        import typst  # type: ignore
        return typst
    except ImportError:
        return None


def typst_available() -> bool:
    return _typst_module() is not None or _typst_bin() is not None


def compile_pdf(data: Dict) -> bytes:
    """Setzt `data` mit dem Template zu einem PDF."""
    typst = _typst_module()
    exe = None if typst is not None else _typst_bin()
    if typst is None and not exe:
        raise TypstUnavailable("Typst ist nicht installiert")
    with tempfile.TemporaryDirectory(prefix="reqman-typst-") as tmp:
        tmp_path = Path(tmp)
        shutil.copyfile(TEMPLATE, tmp_path / "lastenheft.typ")
        (tmp_path / "data.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        if typst is not None:
            try:
                return typst.compile(str(tmp_path / "lastenheft.typ"), root=str(tmp_path))
            except Exception as e:
                raise TypstFailed(str(e)) from e
        out = tmp_path / "out.pdf"
        try:
            r = subprocess.run([exe, "compile", "--root", str(tmp_path), str(tmp_path / "lastenheft.typ"), str(out)],
                               capture_output=True, text=True, timeout=COMPILE_TIMEOUT_S)
        except (OSError, subprocess.TimeoutExpired) as e:
            raise TypstFailed(str(e)) from e
        if r.returncode != 0 or not out.exists():
            raise TypstFailed((r.stderr or r.stdout or "unbekannter Fehler").strip())
        return out.read_bytes()


def build_pdf(project_id: str, document: Optional[str] = None) -> bytes:
    if not typst_available():
        raise TypstUnavailable("Typst ist nicht installiert")
    return compile_pdf(build_data(project_id, document))
