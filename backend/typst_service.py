"""Gesetzte PDF-Berichte (B3, ausgebaut in E1) – Daten aus doorstop, Satz durch Typst.

Ablauf: Anforderungen lesen → in ein JSON-Gerüst umsetzen (Texte als bereits maskiertes
Typst-Markup, Bilder als Verweise auf eingebettete Dateien) → eine Vorlage aus `templates/`
mit Typst kompilieren → PDF-Bytes.

Schnittstelle für die Berichte (E_PDF_Plan.md, Abschnitt 3a):
  build_data(project_id, document=None, *, documents=None, uids=None, attributes=None) -> dict
  compile_pdf(data, template="lastenheft", extra_files=None) -> bytes
  build_pdf(project_id, document=None) -> bytes        (bisheriger Aufruf, Vorlage „lastenheft“)

Anforderungstexte sind Markdown (TipTap speichert Markdown) mit eingebettetem HTML für Tabellen,
<u>, <mark> und lokale Bilder; ältere Einträge sind reines HTML. Beides wird in Typst-Markup
umgesetzt. Bilder: `/uploads/<datei>` (Upload), `data-local-path` bzw. `/api/localfile?path=`
(lokale Datei unter dem Home-Verzeichnis), `data:image/...;base64` und relative Pfade im
Projektordner. Fehlt eine Datei oder ist sie ungültig, steht im PDF ein sichtbarer Hinweis.

Typst wird bevorzugt als Python-Paket `typst` genutzt, sonst als Programm über `TYPST_BIN`.
Ist beides nicht vorhanden, wird `TypstUnavailable` geworfen (Router: 503). Schrift: die
mitgelieferte Liberation Sans (SIL OFL 1.1) aus `templates/fonts/`; Systemschriften werden
nicht gelesen (gleiches Ergebnis auf jedem Rechner, schneller).
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple, Union
from urllib.parse import parse_qs, unquote, urlparse

import doorstop_service as ds

TEMPLATES_DIR = Path(__file__).parent / "templates"
FONTS_DIR = TEMPLATES_DIR / "fonts"
TEMPLATE = TEMPLATES_DIR / "lastenheft.typ"       # bisheriger Name, bleibt für Altaufrufe
UPLOADS_DIR = Path(__file__).parent / "uploads"   # wie routers/uploads_router.py
COMPILE_TIMEOUT_S = 60
MAX_IMAGE_BYTES = 20 * 1024 * 1024


class TypstUnavailable(RuntimeError):
    """Typst ist weder als Python-Paket noch über TYPST_BIN verfügbar."""


class TypstFailed(RuntimeError):
    """Typst hat das Dokument nicht gesetzt."""


# ── Maskierung ───────────────────────────────────────────────────────────────

# Zeichen mit Bedeutung im Typst-Markup; jedes wird mit Backslash maskiert.
_SPECIAL = set("\\#$*_@<>`~[]{}=-+/%")
_ESC_RE = re.compile("[" + re.escape("".join(sorted(_SPECIAL))) + "]")
_ENUM_RE = re.compile(r"(\d)\.")   # „1. Punkt“ am Zeilenanfang wäre sonst eine Aufzählung


def escape_typst(text: str) -> str:
    """Maskiert Typst-Sonderzeichen (`#`, `$`, `*`, `_`, `@`, `<` …) in Fließtext."""
    out = _ESC_RE.sub(lambda m: "\\" + m.group(0), text or "")
    return _ENUM_RE.sub(r"\1\\.", out)


def _typst_string(text: str) -> str:
    """Typst-Zeichenkette in Anführungszeichen (für #raw, #link, Bild-IDs)."""
    return '"' + (text or "").replace("\\", "\\\\").replace('"', '\\"') + '"'


# ── Markdown → HTML (die Teilmenge, die der TipTap-Editor schreibt) ──────────

# Inline-HTML, das im Markdown stehen bleiben darf; jedes andere „<“ ist Text.
_INLINE_TAGS = ("u", "mark", "img", "br", "sub", "sup", "s", "del", "strong", "em", "b", "i", "code",
                "span", "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "p", "div",
                "ul", "ol", "li", "pre", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "hr",
                "colgroup", "col", "caption")
# Nur echte Tags: Attribute immer mit Wert (so schreibt der Editor) – „a<b und x > 3“ bleibt Text.
_TAG_RE = re.compile(r"</?(?:" + "|".join(_INLINE_TAGS) + r")"
                     r"(?:\s+[\w:-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'>]+))*\s*/?>", re.I)
_BLOCK_HTML_RE = re.compile(r"^\s*<(table|div|p|ul|ol|pre|blockquote|h[1-6]|img|hr)\b", re.I)
_LIST_RE = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
_TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$")
_HR_RE = re.compile(r"^\s*([-*_])(\s*\1){2,}\s*$")


def looks_like_html(value: str) -> bool:
    """Wie im Frontend (htmlToMarkdown.ts): beginnt mit einem Block-HTML-Tag → altes HTML."""
    return bool(re.match(r"^\s*<(p|h[1-6]|ul|ol|li|div|blockquote|table|pre|br|img)\b", value or "", re.I))


def _esc_html_text(s: str) -> str:
    """`<`, `>` und `&` im Markdown-Text maskieren, erlaubte HTML-Tags stehen lassen."""
    parts, pos = [], 0
    for m in _TAG_RE.finditer(s):
        parts.append(html.escape(s[pos:m.start()], quote=False).replace("&amp;", "&"))
        parts.append(m.group(0))
        pos = m.end()
    parts.append(html.escape(s[pos:], quote=False).replace("&amp;", "&"))
    return "".join(parts)


def _md_inline(s: str) -> str:
    """Inline-Markdown → HTML: Code, Bilder, Links, fett, kursiv, durchgestrichen, Zeilenumbruch."""
    keep: List[str] = []

    def stash(v: str) -> str:
        keep.append(v)
        return f"\x00{len(keep) - 1}\x00"

    s = re.sub(r"(`+)(.+?)\1", lambda m: stash("<code>" + html.escape(m.group(2).strip()) + "</code>"), s)
    s = re.sub(r"\\([\\`*_{}\[\]()#+\-.!|~<>])", lambda m: stash(html.escape(m.group(1))), s)
    s = re.sub(r'!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)',
               lambda m: stash(f'<img alt="{html.escape(m.group(1))}" src="{html.escape(m.group(2))}">'), s)
    s = re.sub(r'(?<!!)\[([^\]]+)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)',
               lambda m: stash(f'<a href="{html.escape(m.group(2))}">') + m.group(1) + stash("</a>"), s)
    s = _esc_html_text(s)
    s = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])", r"<em>\1</em>", s)
    s = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<s>\1</s>", s)
    s = re.sub(r"( {2,}|\\)\n", "<br>", s)
    return re.sub(r"\x00(\d+)\x00", lambda m: keep[int(m.group(1))], s)


def _split_row(line: str) -> List[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    return [c.strip() for c in re.split(r"(?<!\\)\|", line)]


def markdown_to_html(text: str) -> str:
    """Blockweise Umsetzung: Absätze, Überschriften, Listen, Zitate, Code, Pipe-Tabellen, HTML-Blöcke."""
    lines = (text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out: List[str] = []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        fence = re.match(r"^\s*(```+|~~~+)\s*([\w-]*)", line)
        if fence:
            mark, buf = fence.group(1), []
            i += 1
            while i < n and not lines[i].strip().startswith(mark):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append("<pre><code>" + html.escape("\n".join(buf)) + "</code></pre>")
            continue
        if _BLOCK_HTML_RE.match(line):
            buf = []
            in_table = False
            while i < n and (lines[i].strip() or in_table):
                buf.append(lines[i])
                low = lines[i].lower()
                if "<table" in low:
                    in_table = True
                if "</table" in low:
                    in_table = False
                i += 1
            out.append("\n".join(buf))
            continue
        h = re.match(r"^\s*(#{1,6})\s+(.*?)\s*#*\s*$", line)
        if h:
            out.append(f"<h{len(h.group(1))}>{_md_inline(h.group(2))}</h{len(h.group(1))}>")
            i += 1
            continue
        if _HR_RE.match(line):
            out.append("<hr>")
            i += 1
            continue
        if line.lstrip().startswith(">"):
            buf = []
            while i < n and lines[i].lstrip().startswith(">"):
                buf.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            out.append("<blockquote>" + markdown_to_html("\n".join(buf)) + "</blockquote>")
            continue
        if "|" in line and i + 1 < n and _TABLE_SEP_RE.match(lines[i + 1]):
            head = _split_row(line)
            i += 2
            rows = []
            while i < n and lines[i].strip() and "|" in lines[i]:
                rows.append(_split_row(lines[i]))
                i += 1
            t = ["<table><tr>" + "".join(f"<th>{_md_inline(c)}</th>" for c in head) + "</tr>"]
            for r in rows:
                t.append("<tr>" + "".join(f"<td>{_md_inline(c)}</td>" for c in r) + "</tr>")
            out.append("".join(t) + "</table>")
            continue
        if _LIST_RE.match(line):
            i = _md_list(lines, i, out)
            continue
        buf = []
        while (i < n and lines[i].strip() and not _BLOCK_HTML_RE.match(lines[i])
               and not re.match(r"^\s*(#{1,6}\s|```|~~~|>)", lines[i])
               and not (buf and _LIST_RE.match(lines[i]))):
            buf.append(lines[i])
            i += 1
        out.append("<p>" + _md_inline("\n".join(buf)) + "</p>")
    return "\n".join(out)


def _md_list(lines: List[str], i: int, out: List[str]) -> int:
    """Verschachtelte Listen anhand der Einrückung; Wechsel - ↔ 1. auf gleicher Ebene beginnt eine neue Liste."""
    stack: List[Tuple[int, str]] = []   # (Einrückung, "ul"/"ol")
    buf: List[str] = []
    n = len(lines)
    while i < n:
        line = lines[i]
        m = _LIST_RE.match(line)
        if not m:
            if line.strip() and stack and (len(line) - len(line.lstrip())) > stack[-1][0]:
                buf.append(" " + _md_inline(line.strip()))     # Fortsetzungszeile
                i += 1
                continue
            if not line.strip() and i + 1 < n and _LIST_RE.match(lines[i + 1]):
                i += 1
                continue
            break
        ind = len(m.group(1).replace("\t", "    "))
        kind = "ol" if m.group(2)[0].isdigit() else "ul"
        while stack and ind < stack[-1][0]:
            buf.append(f"</li></{stack.pop()[1]}>")
        if stack and ind == stack[-1][0] and kind != stack[-1][1]:
            buf.append(f"</li></{stack.pop()[1]}>")
        if not stack or ind > stack[-1][0]:
            stack.append((ind, kind))
            buf.append(f"<{kind}><li>")
        else:
            buf.append("</li><li>")
        buf.append(_md_inline(m.group(3)))
        i += 1
    while stack:
        buf.append(f"</li></{stack.pop()[1]}>")
    out.append("".join(buf))
    return i


# ── Bilder ───────────────────────────────────────────────────────────────────

def _sniff(head: bytes) -> Optional[str]:
    """Bildformat am Dateianfang erkennen (Endung allein ist unzuverlässig)."""
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    probe = head[:2048].lstrip(b"\xef\xbb\xbf \t\r\n").lower()
    if probe.startswith((b"<?xml", b"<svg", b"<!--", b"<!doctype svg")) and b"<svg" in head[:4096].lower():
        return "svg"
    return None


def _home_image_ok(path: str) -> bool:
    """Gleiche Regel wie /api/localfile: nur Bilddateien unter dem Home-Verzeichnis."""
    try:
        from routers.localfile_router import _is_allowed_image
        return _is_allowed_image(path)
    except Exception:   # Router nicht importierbar (z. B. Teiltests) – gleiche Prüfung hier
        try:
            real = os.path.realpath(path)
            base = os.path.realpath(os.path.expanduser("~"))
            return (os.path.commonpath([real, base]) == base
                    and os.path.splitext(real)[1].lower() in {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"})
        except (ValueError, OSError):
            return False


class ImageSet:
    """Sammelt die Bilder eines Berichts: Quelle auflösen, prüfen, eindeutige ID vergeben.

    `data["images"][id]` = {file, alt, ok, hint, source} – `file` ist der Pfad im Satzordner
    (`/img/<id>.<fmt>`); die Bytes liegen bis zum Satz in `self.blobs`/`self.paths` und werden
    als `data["_files"]` an `compile_pdf` weitergegeben (siehe `extra_files()`).
    """

    def __init__(self, bases: Iterable[str] = ()) -> None:
        self.bases = [b for b in bases if b]
        self.entries: Dict[str, Dict] = {}
        self.by_source: Dict[str, str] = {}
        self.paths: Dict[str, str] = {}     # id → Dateipfad auf der Platte
        self.blobs: Dict[str, bytes] = {}   # id → Bytes (data:-URIs)

    # Quelle → (Pfad | Bytes | None, Hinweis)
    def _resolve(self, src: str, local_path: Optional[str], item_dir: Optional[str]):
        src = (src or "").strip()
        if local_path:
            p = local_path
            if not os.path.isabs(p) and item_dir:
                p = os.path.join(item_dir, p)
            if not _home_image_ok(p):
                return None, "Bilddatei nicht erlaubt oder kein Bild"
            return p, None
        if src.startswith("data:"):
            m = re.match(r"data:image/[\w.+-]+;base64,(.*)$", src, re.S)
            if not m:
                return None, "eingebettetes Bild nicht lesbar"
            try:
                return base64.b64decode(m.group(1), validate=False), None
            except (binascii.Error, ValueError):
                return None, "eingebettetes Bild nicht lesbar"
        u = urlparse(src)
        if u.path.startswith("/uploads/") or "/uploads/" in u.path and u.scheme in ("http", "https"):
            name = os.path.basename(unquote(u.path))
            return (str(UPLOADS_DIR / name) if name else None), (None if name else "Upload ohne Dateinamen")
        if u.path.endswith("/api/localfile") or u.path == "/api/localfile":
            p = (parse_qs(u.query).get("path") or [""])[0]
            if not p:
                return None, "lokale Datei ohne Pfad"
            if not os.path.isabs(p) and item_dir:
                p = os.path.join(item_dir, p)
            if not _home_image_ok(p):
                return None, "Bilddatei nicht erlaubt oder kein Bild"
            return p, None
        if u.scheme in ("http", "https"):
            return None, "Bild aus dem Netz wird nicht eingebettet"
        if not src:
            return None, "Bild ohne Quelle"
        rel = unquote(u.path).lstrip("/\\")
        for base in ([item_dir] if item_dir else []) + self.bases:
            cand = os.path.realpath(os.path.join(base, rel))
            try:
                inside = os.path.commonpath([cand, os.path.realpath(base)]) == os.path.realpath(base)
            except ValueError:
                inside = False
            if inside and os.path.isfile(cand):
                return cand, None
        return None, "Datei nicht gefunden"

    def add(self, src: str, alt: str = "", local_path: Optional[str] = None,
            item_dir: Optional[str] = None) -> str:
        key = (local_path or src or "") + "\x00" + (item_dir or "")
        if src.startswith("data:"):
            key = "data:" + hashlib.sha1(src.encode("utf-8", "replace")).hexdigest()
        if key in self.by_source:
            return self.by_source[key]
        iid = f"b{len(self.entries) + 1}"
        self.by_source[key] = iid
        shown = local_path or src
        if shown.startswith("data:"):
            shown = "eingebettetes Bild"
        name = os.path.basename(unquote(urlparse(shown).path)) if not shown.startswith("eingebettet") else shown
        entry = {"file": None, "alt": alt or "", "ok": False, "hint": None, "source": name or shown}
        self.entries[iid] = entry
        target, hint = self._resolve(src, local_path, item_dir)
        if target is None:
            entry["hint"] = hint
            return iid
        try:
            if isinstance(target, bytes):
                data = target
            else:
                if not os.path.isfile(target):
                    entry["hint"] = "Datei nicht gefunden"
                    return iid
                if os.path.getsize(target) > MAX_IMAGE_BYTES:
                    entry["hint"] = "Datei zu groß"
                    return iid
                with open(target, "rb") as f:
                    data = f.read(8192)
        except OSError:
            entry["hint"] = "Datei nicht lesbar"
            return iid
        if len(data) > MAX_IMAGE_BYTES:
            entry["hint"] = "Datei zu groß"
            return iid
        fmt = _sniff(data)
        if fmt is None:
            entry["hint"] = "kein unterstütztes Bildformat (PNG, JPG, GIF, WebP, SVG)"
            return iid
        if fmt == "svg":
            try:
                full = data if isinstance(target, bytes) else Path(target).read_bytes()
                ET.fromstring(full)
            except (ET.ParseError, OSError, ValueError):
                entry["hint"] = "SVG-Datei fehlerhaft"
                return iid
        entry.update(file=f"/img/{iid}.{fmt}", ok=True)
        if isinstance(target, bytes):
            self.blobs[iid] = target
        else:
            self.paths[iid] = target
        return iid

    def extra_files(self) -> Dict[str, Dict[str, str]]:
        """{Pfad im Satzordner: {"path": Datei} oder {"b64": Inhalt}} für alle gültigen Bilder."""
        out: Dict[str, Dict[str, str]] = {}
        for iid, e in self.entries.items():
            if e["ok"]:
                if iid in self.blobs:
                    out[e["file"].lstrip("/")] = {"b64": base64.b64encode(self.blobs[iid]).decode("ascii")}
                else:
                    out[e["file"].lstrip("/")] = {"path": self.paths[iid]}
        return out


# ── HTML (TipTap) → Typst-Markup ─────────────────────────────────────────────

_WRAP = {
    "strong": "#strong[", "b": "#strong[", "em": "#emph[", "i": "#emph[",
    "u": "#underline[", "s": "#strike[", "del": "#strike[",
    "sub": "#sub[", "sup": "#super[", "mark": "#highlight[",
}
_BLOCK_CLOSE = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"}


class _HtmlToTypst(HTMLParser):
    """Absätze, fett, kursiv, Listen, Code, Links, Bilder (als #bild("id")) und echte Tabellen."""

    def __init__(self, images: Optional[ImageSet] = None, item_dir: Optional[str] = None) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self.stack: List[tuple] = []        # (Tag, Schließer) je offenem Tag
        self.lists: List[str] = []          # "ul" | "ol" je Verschachtelungstiefe
        self.in_code = 0
        self.code_buf: List[str] = []
        self.images = images
        self.item_dir = item_dir
        self.used_images: List[str] = []
        # Tabellen: je offene Tabelle {rows: [[cell]], header_rows: n}; Zellen sammeln eigenes Markup
        self.tables: List[Dict] = []
        self.saved_out: List[List[str]] = []

    def _para(self) -> None:
        if self.out and not self.out[-1].endswith("\n\n"):
            self.out.append("\n\n")

    # Tabellen-Hilfen
    def _start_cell(self, tag: str, a: Dict) -> None:
        if not self.tables:
            return
        t = self.tables[-1]
        if not t["rows"]:
            t["rows"].append([])
        def _int(v):
            try:
                return max(1, min(int(v or 1), 50))
            except ValueError:
                return 1
        t["cell"] = {"th": tag == "th", "colspan": _int(a.get("colspan")), "rowspan": _int(a.get("rowspan"))}
        self.saved_out.append(self.out)
        self.out = []

    def _end_cell(self) -> None:
        if not self.tables or "cell" not in self.tables[-1]:
            return
        t = self.tables[-1]
        cell = t.pop("cell")
        text = re.sub(r"\n{3,}", "\n\n", "".join(self.out)).strip()
        self.out = self.saved_out.pop()
        cell["markup"] = text
        t["rows"][-1].append(cell)

    def _emit_table(self, t: Dict) -> None:
        rows = [r for r in t["rows"] if r]
        if not rows:
            return
        ncols = max(sum(c["colspan"] for c in r) for r in rows)
        def cell(c):
            body = c["markup"]
            if c["th"]:
                body = f"#strong[{body}]" if body else ""
            args = []
            if c["colspan"] > 1:
                args.append(f"colspan: {c['colspan']}")
            if c["rowspan"] > 1:
                args.append(f"rowspan: {c['rowspan']}")
            if c["th"]:
                args.append("fill: luma(235)")
            return f"table.cell({', '.join(args)})[{body}]" if args else f"[{body}]"
        head = []
        while rows and all(c["th"] for c in rows[0]) and len(head) < 3:
            head.append(rows.pop(0))
        parts = []
        if head:
            parts.append("table.header(" + ", ".join(cell(c) for r in head for c in r) + ")")
        parts.extend(cell(c) for r in rows for c in r)
        self._para()
        self.out.append(f"#tabelle({ncols}, " + ", ".join(parts) + ")")
        self._para()

    def handle_starttag(self, tag: str, attrs) -> None:
        a = {k: (v or "") for k, v in attrs}
        if tag in _WRAP:
            self.out.append(_WRAP[tag]); self.stack.append((tag, "]"))
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._para(); self.out.append("#strong["); self.stack.append((tag, "]"))
        elif tag == "blockquote":
            self._para(); self.out.append("#quote(block: true)["); self.stack.append((tag, "]"))
        elif tag in ("p", "div"):
            self._para(); self.stack.append((tag, ""))
        elif tag == "table":
            self.tables.append({"rows": []}); self.stack.append((tag, ""))
        elif tag == "tr":
            if self.tables:
                self.tables[-1]["rows"].append([])
            self.stack.append((tag, ""))
        elif tag in ("td", "th"):
            if self.tables and "cell" in self.tables[-1]:
                self._end_cell()          # ungeschlossene Zelle
            self._start_cell(tag, a); self.stack.append((tag, ""))
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
        elif tag == "hr":
            self._para(); self.out.append("#line(length: 100%, stroke: 0.4pt + luma(170))"); self._para()
        elif tag in ("code", "pre"):
            self.in_code += 1; self.code_buf = []; self.stack.append((tag, ""))
        elif tag == "a":
            href = a.get("href", "")
            if re.match(r"^(https?:|mailto:)", href):
                self.out.append(f"#link({_typst_string(href)})["); self.stack.append((tag, "]"))
            else:
                self.stack.append((tag, ""))
        elif tag == "img":
            alt = (a.get("alt") or "").strip()
            if self.images is None:
                self.out.append("#emph[" + escape_typst(f"[Abbildung{': ' + alt if alt else ''}]") + "]")
            else:
                iid = self.images.add(a.get("src", ""), alt, a.get("data-local-path") or None, self.item_dir)
                self.used_images.append(iid)
                self.out.append(f"#bild({_typst_string(iid)})")
        else:
            self.stack.append((tag, ""))

    def handle_endtag(self, tag: str) -> None:
        # passenden offenen Tag suchen (tolerant gegenüber unsauberem HTML)
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, close in reversed(self.stack[i:]):
                    self.out.append(close)
                    if t in ("td", "th"):
                        self._end_cell()
                    elif t == "table" and self.tables:
                        if "cell" in self.tables[-1]:
                            self._end_cell()
                        self._emit_table(self.tables.pop())
                del self.stack[i:]
                break
        else:
            return
        if tag in ("ul", "ol") and self.lists:
            self.lists.pop()
        if tag in ("code", "pre") and self.in_code:
            self.in_code -= 1
            if self.in_code == 0 and self.code_buf:
                code = "".join(self.code_buf)
                block = tag == "pre" or "\n" in code
                self.out.append("#raw(" + _typst_string(code) + (", block: true" if block else "") + ")")
                self.code_buf = []
        if tag in _BLOCK_CLOSE:
            self._para()
        elif tag == "li":
            self.out.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_code:
            self.code_buf.append(data)
            return
        if self.tables and "cell" not in self.tables[-1]:
            return                          # Leerraum zwischen <tr>/<td>
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
            t, close = self.stack.pop()
            self.out.append(close)
            if t in ("td", "th"):
                self._end_cell()
            elif t == "table" and self.tables:
                self._emit_table(self.tables.pop())
        text = "".join(self.out)
        return re.sub(r"\n{3,}", "\n\n", text).strip()


def html_to_typst(raw: str, images: Optional[ImageSet] = None, item_dir: Optional[str] = None,
                  used: Optional[List[str]] = None) -> str:
    """Wandelt Anforderungstext (Markdown mit HTML oder altes HTML) in sicheres Typst-Markup um.

    Ohne `images` werden Bilder nur als „[Abbildung: …]“ gesetzt; mit `images` als `#bild("id")`
    (Vorlage löst die ID über `data.images` auf). `used` erhält die IDs der vorkommenden Bilder.
    """
    raw = raw or ""
    if not looks_like_html(raw):
        raw = markdown_to_html(raw)
    p = _HtmlToTypst(images, item_dir)
    p.feed(raw)
    p.close()
    out = p.result()
    if used is not None:
        used.extend(i for i in p.used_images if i not in used)
    return out


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


def _attr_str(v) -> str:
    """Attributwert als Text (Listen mit Komma, Wahrheitswerte als ja/nein)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "ja" if v else "nein"
    if isinstance(v, (list, tuple)):
        return ", ".join(_attr_str(x) for x in v)
    if isinstance(v, dict):
        return ", ".join(f"{k}: {_attr_str(x)}" for k, x in v.items())
    return str(v).strip()


def build_data(project_id: str, document: Optional[str] = None, *,
               documents: Optional[List[str]] = None, uids: Optional[Iterable[str]] = None,
               attributes: Optional[List[str]] = None) -> Dict:
    """Sammelt alles, was eine Vorlage braucht.

    document/documents: Dokument-Präfixe (beide leer = alle; `documents` hat Vorrang).
    uids: nur diese Anforderungen (Überschriften bleiben, wenn darunter etwas gezeigt wird).
    attributes: Namen der eigenen Attribute, die je Anforderung mitkommen (None = alle, [] = keine).
    ValueError bei unbekanntem Projekt, KeyError bei unbekanntem Dokument.
    """
    project = ds.get_project(project_id)
    if not project:
        raise ValueError("Projekt nicht gefunden")
    path = project["path"]
    if not os.path.exists(path):
        raise ValueError("Projektverzeichnis nicht gefunden")
    tree = ds._build_tree(path)
    all_docs = list(tree.documents)
    wanted = list(documents) if documents else ([document] if document else [])
    if wanted:
        by_prefix = {str(d.prefix): d for d in all_docs}
        missing = [p for p in wanted if p not in by_prefix]
        if missing:
            raise KeyError(missing[0])
        docs = [d for d in all_docs if str(d.prefix) in set(wanted)]
    else:
        docs = all_docs
    uid_filter = set(uids) if uids is not None else None

    loaded: Dict[str, Dict] = {}        # uid → dict (alle Dokumente, für Links/Ziele)
    order: Dict[str, List[Dict]] = {}   # prefix → nach Ebene sortierte Items
    item_dirs: Dict[str, Optional[str]] = {}
    for doc in all_docs:
        items = sorted(ds._real_items(doc), key=lambda i: _level_key(str(i.level)))
        order[str(doc.prefix)] = []
        for it in items:
            d = ds._item_to_dict(it)
            d["prefix"] = str(doc.prefix)
            loaded[d["uid"]] = d
            item_dirs[d["uid"]] = ds._item_dir(it)
            order[str(doc.prefix)].append(d)

    selected = {str(d.prefix) for d in docs}
    shown = {u for u, d in loaded.items() if d["prefix"] in selected and d["active"]
             and (uid_filter is None or d["header"] or u in uid_filter)}

    children: Dict[str, List[str]] = {}
    for d in loaded.values():
        if d["active"]:
            for l in d["links"]:
                children.setdefault(l, []).append(d["uid"])

    def ref(uid: str) -> Dict:
        return {"uid": uid, "ref": label_for(uid), "ok": uid in shown}

    images = ImageSet([path])
    attr_names: set = set()
    out_docs: List[Dict] = []
    for doc in docs:
        prefix = str(doc.prefix)
        entries = []
        for d in order[prefix]:
            if d["uid"] not in shown:
                continue
            parts = _level_parts(d["level"])
            used: List[str] = []
            markup = html_to_typst(d["text"], images, item_dirs.get(d["uid"]), used)
            if d["header"]:
                entries.append({
                    "kind": "heading", "uid": d["uid"], "ref": label_for(d["uid"]),
                    "depth": min(len(parts) + 1, 5), "level": ".".join(parts),
                    "markup": markup or escape_typst(d["uid"]), "images": used,
                })
                continue
            custom = d.get("custom_attributes") or {}
            names = list(custom) if attributes is None else [a for a in attributes if a in custom]
            attrs = {k: _attr_str(custom[k]) for k in names if _attr_str(custom[k]) != ""}
            attr_names.update(attrs)
            entries.append({
                "kind": "req", "uid": d["uid"], "ref": label_for(d["uid"]),
                "level": ".".join(parts), "markup": markup,
                "normative": d["normative"], "derived": d["derived"],
                "status": _status(d), "parents": [ref(l) for l in d["links"]],
                "children": [ref(c) for c in sorted(children.get(d["uid"], []))],
                "attributes": attrs,
                "attributes_markup": [{"name": escape_typst(k), "markup": html_to_typst(v, images,
                                       item_dirs.get(d["uid"]), used)} for k, v in attrs.items()],
                "images": used,
            })
        if uid_filter is not None:
            entries = _drop_empty_headings(entries)
        out_docs.append({"prefix": prefix, "items": entries})

    # Trace-Tabelle: Eltern ↔ Kinder für alle Verknüpfungen, die ein gewähltes Dokument berühren
    doc_pos = {str(d.prefix): i for i, d in enumerate(all_docs)}
    parents_with_children_docs = {str(c.parent) for c in all_docs if c.parent}
    trace = []
    for uid in sorted(loaded, key=lambda u: (doc_pos[loaded[u]["prefix"]], _level_key(loaded[u]["level"]))):
        p = loaded[uid]
        if not p["active"] or p["header"]:
            continue
        if uid_filter is not None and uid not in uid_filter:
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
            if d["uid"] not in shown or d["header"]:
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

    single = document if not documents else (documents[0] if len(documents) == 1 else None)
    data = {
        "title": project["name"],
        "subtitle": ("Dokument " + single) if single else "Lastenheft",
        "documents_label": ", ".join(str(d.prefix) for d in docs),
        "stand": datetime.now().strftime("%d.%m.%Y %H:%M"),
        "git": _git_stand(path),
        "documents": out_docs,
        "trace": trace,
        "open_points": open_pts,
        "counts": {"anforderungen": sum(1 for d in out_docs for e in d["items"] if e["kind"] == "req")},
        "attribute_names": sorted(attr_names) if attributes is None
                           else [a for a in attributes if a in attr_names],
        "images": images.entries,
    }
    # Bilddateien für compile_pdf: {Pfad im Satzordner: {"path": …} | {"b64": …}}; bleibt JSON-tauglich,
    # wird aber nicht in data.json geschrieben (Schlüssel mit „_“ entfernt compile_pdf).
    data["_files"] = images.extra_files()
    return data


def _drop_empty_headings(entries: List[Dict]) -> List[Dict]:
    """Bei Auswahl einzelner Anforderungen: Überschriften ohne gezeigte Anforderung darunter weglassen."""
    keep = [True] * len(entries)
    for i, e in enumerate(entries):
        if e["kind"] != "heading":
            continue
        depth = e["depth"]
        has = False
        for f in entries[i + 1:]:
            if f["kind"] == "heading" and f["depth"] <= depth:
                break
            if f["kind"] == "req":
                has = True
                break
        keep[i] = has
    return [e for e, k in zip(entries, keep) if k]


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


def _safe_rel(name: str) -> Path:
    p = Path(name.replace("\\", "/").lstrip("/"))
    if not name or p.is_absolute() or ".." in p.parts:
        raise ValueError(f"ungültiger Dateiname: {name}")
    return p


def _run_typst(typst, exe, tmp_path: Path, main: str) -> bytes:
    fonts = str(tmp_path / "fonts")
    if typst is not None:
        try:
            return typst.compile(str(tmp_path / main), root=str(tmp_path), font_paths=[fonts],
                                 ignore_system_fonts=True)
        except Exception as e:
            raise TypstFailed(str(e)) from e
    out = tmp_path / "out.pdf"
    try:
        r = subprocess.run([exe, "compile", "--root", str(tmp_path), "--font-path", fonts,
                            "--ignore-system-fonts", str(tmp_path / main), str(out)],
                           capture_output=True, text=True, timeout=COMPILE_TIMEOUT_S)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise TypstFailed(str(e)) from e
    if r.returncode != 0 or not out.exists():
        raise TypstFailed((r.stderr or r.stdout or "unbekannter Fehler").strip())
    return out.read_bytes()


def _probe_images(typst, exe, tmp_path: Path, images: Dict[str, Dict]) -> List[str]:
    """Jedes Bild einzeln setzen; liefert die IDs, an denen Typst scheitert."""
    bad = []
    for iid, e in images.items():
        if not e.get("ok"):
            continue
        (tmp_path / "_probe.typ").write_text(f"#image({_typst_string(e['file'])})", encoding="utf-8")
        try:
            _run_typst(typst, exe, tmp_path, "_probe.typ")
        except TypstFailed:
            bad.append(iid)
    return bad


def compile_pdf(data: Dict, template: str = "lastenheft",
                extra_files: Optional[Dict[str, Union[bytes, str, os.PathLike]]] = None) -> bytes:
    """Setzt `data` mit `templates/<template>.typ` zu einem PDF.

    Alle `.typ`-Dateien aus `templates/` und `templates/fonts/` werden in einen Satzordner kopiert,
    dazu `data.json`, die Bilder aus `build_data` und `extra_files` ({Pfad im Satzordner: Bytes
    oder Dateipfad}, z. B. {"logo.png": b"..."}). Scheitert der Satz an einem Bild, wird es durch
    einen Hinweis ersetzt und neu gesetzt.
    """
    if not re.fullmatch(r"[A-Za-z0-9_-]+", template or "") or not (TEMPLATES_DIR / f"{template}.typ").is_file():
        raise ValueError(f"Vorlage nicht gefunden: {template}")
    typst = _typst_module()
    exe = None if typst is not None else _typst_bin()
    if typst is None and not exe:
        raise TypstUnavailable("Typst ist nicht installiert")
    files: Dict[str, Union[bytes, str, os.PathLike]] = {}
    for name, spec in (data.get("_files") or {}).items():
        files[name] = base64.b64decode(spec["b64"]) if "b64" in spec else spec["path"]
    files.update(extra_files or {})
    with tempfile.TemporaryDirectory(prefix="reqman-typst-") as tmp:
        tmp_path = Path(tmp)
        for f in TEMPLATES_DIR.glob("*.typ"):
            shutil.copyfile(f, tmp_path / f.name)
        if FONTS_DIR.is_dir():
            shutil.copytree(FONTS_DIR, tmp_path / "fonts")
        else:
            (tmp_path / "fonts").mkdir()
        for name, content in files.items():
            dest = tmp_path / _safe_rel(name)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, (bytes, bytearray)):
                dest.write_bytes(content)
            else:
                shutil.copyfile(content, dest)
        main = f"{template}.typ"

        def write_json(d: Dict) -> None:
            public = {k: v for k, v in d.items() if not k.startswith("_")}
            (tmp_path / "data.json").write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")

        write_json(data)
        try:
            return _run_typst(typst, exe, tmp_path, main)
        except TypstFailed:
            imgs = data.get("images") or {}
            bad = _probe_images(typst, exe, tmp_path, imgs) if imgs else []
            if not bad:
                raise
            fixed = dict(data)
            fixed["images"] = {k: (dict(v, ok=False, file=None, hint="Bild konnte nicht gesetzt werden")
                                   if k in bad else v) for k, v in imgs.items()}
            write_json(fixed)
            return _run_typst(typst, exe, tmp_path, main)


def build_pdf(project_id: str, document: Optional[str] = None) -> bytes:
    if not typst_available():
        raise TypstUnavailable("Typst ist nicht installiert")
    return compile_pdf(build_data(project_id, document))
