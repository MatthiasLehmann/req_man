"""Auswahl von Anforderungen für PDF-Berichte (E3, auch für E2 nutzbar).

`select(items, flt, project_path=None)` arbeitet auf den Anforderungs-Einträgen aus
`typst_service.build_data` (`kind == "req"`, mit `uid`, `status`, `attributes` als Text) und liefert die
Einträge, die **alle** gesetzten Kriterien erfüllen (UND-Verknüpfung). Überschriften werden nicht zurückgegeben.

Kriterien (alle optional, leer = nicht beachtet):
- `uids`: nur diese UIDs.
- `status`: einer der genannten Status („nicht geprüft“, „geändert nach Prüfung“, „geprüft“).
- `changed_since`: Datum (JJJJ-MM-TT, auch TT.MM.JJJJ) oder Commit. Gezählt wird eine Anforderung, wenn ihre
  Datei in einem Commit seit diesem Datum (ab 00:00 Uhr) bzw. nach diesem Commit (ohne ihn) geändert wurde
  oder im Arbeitsverzeichnis noch uncommittete Änderungen hat. Braucht `project_path` (Git-Repo).
- `attribute`: `name` und `value`; Textvergleich ohne Beachtung von Groß-/Kleinschreibung und Randleerzeichen.
  Bei Listenattributen („a, b“) genügt es, wenn ein Element passt. Ist `value` leer, genügt, dass das
  Attribut gesetzt ist.

Fehler in `changed_since` (kein Datum, kein Commit, kein Git-Repo) → `ValueError` mit lesbarem Text.
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

_DATE_RE = re.compile(r"^\s*(\d{4})-(\d{2})-(\d{2})\s*$")
_DATE_DE_RE = re.compile(r"^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$")
_SHA_RE = re.compile(r"^[0-9a-fA-F]{4,40}$")


def _get(flt: Any, name: str, default=None):
    """Feld aus Pydantic-Modell oder dict lesen."""
    if flt is None:
        return default
    if isinstance(flt, dict):
        return flt.get(name, default)
    return getattr(flt, name, default)


def parse_date(text: str) -> Optional[datetime]:
    m = _DATE_RE.match(text)
    if m:
        y, mo, d = (int(x) for x in m.groups())
    else:
        m = _DATE_DE_RE.match(text)
        if not m:
            return None
        d, mo, y = (int(x) for x in m.groups())
    try:
        return datetime(y, mo, d)
    except ValueError:
        return None


def _uid_of_path(name: str) -> Optional[str]:
    """`SYRS/SYRS003.yml` → `SYRS003`; Nebendateien (`….ai-quality.yml`, `validation/…`) zählen nicht."""
    p = name.replace("\\", "/")
    if p.startswith("validation/") or "/validation/" in p:
        return None
    base = p.rsplit("/", 1)[-1]
    if not base.endswith(".yml"):
        return None
    stem = base[:-4]
    if "." in stem:
        return None
    return stem


def changed_uids(project_path: str, since: str) -> Set[str]:
    """UIDs, deren Datei seit `since` (Datum oder Commit) geändert wurde (inkl. uncommittete Änderungen)."""
    since = (since or "").strip()
    if not since:
        return set()
    try:
        from git import Repo
        from git.exc import GitCommandError, InvalidGitRepositoryError, NoSuchPathError
    except Exception as e:  # pragma: no cover
        raise ValueError("Git nicht verfügbar") from e
    try:
        repo = Repo(project_path)
    except (InvalidGitRepositoryError, NoSuchPathError):
        raise ValueError("„geändert seit“ braucht ein Git-Repository im Projektordner")

    names: List[str] = []
    when = parse_date(since)
    try:
        if when is not None:
            out = repo.git.log(f"--since={when.strftime('%Y-%m-%d')} 00:00:00", "--name-only", "--format=")
        elif _SHA_RE.match(since):
            repo.git.rev_parse("--verify", f"{since}^{{commit}}")
            out = repo.git.log(f"{since}..HEAD", "--name-only", "--format=")
        else:
            raise ValueError(f"„geändert seit“: weder Datum (JJJJ-MM-TT) noch Commit: {since}")
    except GitCommandError:
        raise ValueError(f"„geändert seit“: Commit nicht gefunden oder Repository ohne Commits: {since}")
    names += [l for l in out.splitlines() if l.strip()]
    try:  # uncommittete Änderungen und neue Dateien
        status = repo.git.status("--porcelain", "--untracked-files=all")
        for line in status.splitlines():
            part = line[3:].strip().strip('"')
            if " -> " in part:
                part = part.split(" -> ", 1)[1]
            names.append(part)
    except GitCommandError:
        pass
    return {u for u in (_uid_of_path(n) for n in names) if u}


def _attr_matches(attrs: Dict[str, str], name: str, value: str) -> bool:
    key = name.strip().lower()
    for k, v in (attrs or {}).items():
        if k.strip().lower() != key:
            continue
        v = str(v).strip()
        if not value.strip():
            return v != ""
        want = value.strip().lower()
        if v.lower() == want:
            return True
        return want in {p.strip().lower() for p in v.split(",")}
    return False


def is_active(flt: Any) -> bool:
    """Gibt es überhaupt ein Kriterium?"""
    a = _get(flt, "attribute")
    return bool(_get(flt, "uids") or _get(flt, "status") or (_get(flt, "changed_since") or "").strip()
                or (a is not None and (_get(a, "name") or "").strip()))


def select(items: Iterable[Dict], flt: Any, project_path: Optional[str] = None) -> List[Dict]:
    """Anforderungen nach `flt` (PdfFilter oder dict) auswählen; Reihenfolge bleibt."""
    items = list(items)
    uids = set(_get(flt, "uids") or [])
    statuses = set(_get(flt, "status") or [])
    since = (_get(flt, "changed_since") or "").strip()
    attr = _get(flt, "attribute")
    attr_name = (_get(attr, "name") or "").strip() if attr is not None else ""
    attr_value = (_get(attr, "value") or "") if attr is not None else ""

    changed: Optional[Set[str]] = None
    if since:
        if not project_path:
            raise ValueError("„geändert seit“ braucht den Projektordner")
        changed = changed_uids(project_path, since)

    out = []
    for it in items:
        if it.get("kind", "req") != "req":
            continue
        if uids and it["uid"] not in uids:
            continue
        if statuses and it.get("status") not in statuses:
            continue
        if changed is not None and it["uid"] not in changed:
            continue
        if attr_name and not _attr_matches(it.get("attributes") or {}, attr_name, attr_value):
            continue
        out.append(it)
    return out
