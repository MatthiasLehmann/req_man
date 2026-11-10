"""
Excel-Rückweg (U4): Dokument nach Excel exportieren, dort bearbeiten oder kommentieren lassen,
Datei wieder laden und Änderungen gezielt übernehmen.

Grundsatz: Excel ist das Werkzeug zum Mitarbeiten, ReqMan bleibt die geprüfte Quelle.

* Der Export enthält ein ausgeblendetes Blatt ``_reqman`` mit Projekt, Dokument, Spalten und dem
  Stand jeder Zeile beim Export. Damit lässt sich beim Rückimport unterscheiden, was in Excel
  geändert wurde und was in ReqMan seit dem Export geändert wurde (Konflikt, wenn beides).
* Zeilen werden über die ID zugeordnet. Zeilen ohne ID sind neue Anforderungen und durchlaufen
  dieselbe Prüfung wie der Excel-Import (U1).
* Jede Änderung wird vor der Übernahme geprüft (Pflichtattribute, Enum-Werte, Zahlen, Level,
  Link-Ziele). Fehlerhafte Zeilen lassen sich nicht übernehmen.
* Über Excel wird nichts gelöscht und der Typ (Anforderung/Abschnitt) nicht geändert;
  formatierter Text (Bilder, Tabellen, HTML, Code) wird nur im Rich-Text-Editor geändert.
* Übernommen wird alles Ausgewählte oder nichts (Rückrollen bei doorstop-Fehlern).
"""

import io
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import doorstop

import doorstop_service as ds
import import_service as imp

META_SHEET = "_reqman"
MAGIC = "reqman-rueckweg"
FORMAT_VERSION = 1

_LEVEL_RE = re.compile(r"^\d+(\.\d+)*$")
_RICH_RE = re.compile(r"!\[|<[a-z][^>]*>|```|^\s*\|.*\|\s*$", re.I | re.M)


# ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _is_rich(text: str) -> bool:
    return bool(_RICH_RE.search(text or ""))


def _norm(value: str) -> str:
    return re.sub(r"[ \t]+\n", "\n", (value or "").replace("\r\n", "\n").replace("\r", "\n")).strip()


def _fmt(value: Any) -> str:
    """Wert so als Text darstellen, wie er in der Excel-Zelle steht."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Ja" if value else "Nein"
    if isinstance(value, (list, tuple)):
        return "; ".join(_fmt(v) for v in value)
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _same(field: str, a: str, b: str) -> bool:
    if field == "links":
        return set(imp._split_links(a)) == set(imp._split_links(b))
    if field.startswith(imp.ATTR_PREFIX):
        # Ja/Nein, Groß-/Kleinschreibung bei Enums und Listen-Trennzeichen tolerant vergleichen
        na, nb = _norm(a).lower(), _norm(b).lower()
        if na == nb:
            return True
        ba, bb = imp._parse_bool(na), imp._parse_bool(nb)
        if ba is not None and bb is not None and na and nb:
            return ba == bb
        split = lambda s: [x.strip() for x in re.split(r"[;,\n]", s) if x.strip()]  # noqa: E731
        return split(na) == split(nb)
    return _norm(a) == _norm(b)


def _split_header(text: str) -> Tuple[str, str]:
    """Abschnitt: erste Zeile = Titel, Rest = Text (so legt ReqMan Abschnitte an)."""
    lines = (text or "").strip().split("\n", 1)
    return lines[0].strip(), (lines[1].strip() if len(lines) > 1 else "")


def _columns(prefix: str) -> List[Tuple[str, str]]:
    """(Schlüssel, Spaltenname) in Exportreihenfolge."""
    cols = [("uid", "ID"), ("level", "Level"), ("header", "Abschnitt"),
            ("text", "Anforderung"), ("links", "Links")]
    for key, attr in imp._attributes_for(prefix).items():
        cols.append((imp.ATTR_PREFIX + key, attr.get("display_name") or key))
    cols.append(("comment", "Kommentar"))
    return cols


def _row_values(item: Dict, cols: List[Tuple[str, str]]) -> Dict[str, str]:
    """Item als Zeile (Text je Spalte), so wie sie exportiert wird."""
    values: Dict[str, str] = {}
    title, body = _split_header(item["text"]) if item["header"] else ("", item["text"])
    for key, _ in cols:
        if key == "uid":
            values[key] = item["uid"]
        elif key == "level":
            values[key] = item["level"]
        elif key == "header":
            values[key] = title
        elif key == "text":
            values[key] = body
        elif key == "links":
            values[key] = "; ".join(item["links"])
        elif key == "comment":
            values[key] = ""
        else:
            values[key] = _fmt((item.get("custom_attributes") or {}).get(key[len(imp.ATTR_PREFIX):]))
    return values


def _project_and_doc(project_id: str, prefix: str):
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    tree = ds._build_tree(project["path"])
    try:
        doc = tree.find_document(prefix)
    except doorstop.DoorstopError:
        raise ValueError(f"Dokument {prefix} nicht gefunden")
    return project, tree, doc


def _items(doc) -> List[Dict]:
    return [ds._item_to_dict(i) for i in sorted(ds._real_items(doc), key=lambda i: i.level)]


# ─── Export ───────────────────────────────────────────────────────────────────

def export_workbook(project_id: str, prefix: str) -> bytes:
    import openpyxl
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.worksheet.datavalidation import DataValidation
    from openpyxl.utils import get_column_letter

    project, _tree, doc = _project_and_doc(project_id, prefix)
    cols = _columns(prefix)
    attrs = imp._attributes_for(prefix)
    items = _items(doc)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = prefix[:31]
    ws.append([label for _, label in cols])

    grey = PatternFill("solid", fgColor="E5E7EB")
    yellow = PatternFill("solid", fgColor="FEF9C3")
    head = PatternFill("solid", fgColor="1F2937")
    for c, (key, _) in enumerate(cols, start=1):
        cell = ws.cell(row=1, column=c)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head
        cell.alignment = Alignment(vertical="center")

    for item in items:
        values = _row_values(item, cols)
        ws.append([values[k] for k, _ in cols])
        r = ws.max_row
        for c, (key, _) in enumerate(cols, start=1):
            cell = ws.cell(row=r, column=c)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
            if key == "uid":
                cell.fill = grey
            elif key == "comment":
                cell.fill = yellow
            if item["header"]:
                cell.font = Font(bold=True)

    widths = {"uid": 12, "level": 8, "header": 26, "text": 70, "links": 16, "comment": 40}
    for c, (key, label) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(c)].width = widths.get(key, max(14, len(label) + 4))
    ws.freeze_panes = "B2"

    # Auswahllisten wie in ReqMan: Excel lässt dann nur erlaubte Werte zu (geprüft wird trotzdem)
    last = max(ws.max_row, 2) + 500
    for c, (key, _) in enumerate(cols, start=1):
        if not key.startswith(imp.ATTR_PREFIX):
            continue
        attr = attrs[key[len(imp.ATTR_PREFIX):]]
        t = attr.get("attr_type")
        values = attr.get("possible_values") if t == "enum" else (["Ja", "Nein"] if t == "boolean" else None)
        if values and len(",".join(values)) < 250:
            dv = DataValidation(type="list", formula1='"' + ",".join(values) + '"', allow_blank=True,
                                showErrorMessage=True, errorTitle="ReqMan",
                                error="Bitte einen Wert aus der Liste wählen.")
            col = get_column_letter(c)
            dv.add(f"{col}2:{col}{last}")
            ws.add_data_validation(dv)

    note = wb.create_sheet("Hinweise")
    for line in [
        "So funktioniert der Rückweg nach ReqMan",
        "",
        "• Texte und Attribute direkt im ersten Blatt ändern, Fragen oder Anmerkungen in die gelbe Spalte „Kommentar“.",
        "• Neue Anforderungen: neue Zeile mit leerer ID anlegen.",
        "• Die graue Spalte „ID“ nicht ändern – darüber findet ReqMan die Anforderung wieder.",
        "• Gelöschte Zeilen werden in ReqMan nicht gelöscht (Löschen nur in ReqMan selbst).",
        "• Datei in ReqMan über „Excel-Datei laden“ wieder einlesen: ReqMan zeigt jede Änderung,",
        "  prüft sie und übernimmt nur, was ausgewählt wurde.",
        "",
        f"Projekt: {project['name']}   Dokument: {prefix}   Export: {datetime.now():%d.%m.%Y %H:%M}",
    ]:
        note.append([line])
    note["A1"].font = Font(bold=True, size=13)
    note.column_dimensions["A"].width = 110

    meta = wb.create_sheet(META_SHEET)
    meta.append([MAGIC, FORMAT_VERSION])
    meta.append(["project", project_id])
    meta.append(["prefix", prefix])
    meta.append(["exported", datetime.now().isoformat(timespec="seconds")])
    meta.append(["labels"] + [label for _, label in cols])
    meta.append(["keys"] + [key for key, _ in cols])
    for item in items:
        meta.append([item["uid"], json.dumps(_row_values(item, cols), ensure_ascii=False)])
    meta.sheet_state = "veryHidden"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─── Datei lesen ──────────────────────────────────────────────────────────────

def read_roundtrip(filename: str, content: bytes) -> Optional[Dict]:
    """Liest eine Rückweg-Datei. None, wenn es keine ist (dann normaler Import)."""
    if not (filename or "").lower().endswith((".xlsx", ".xlsm")):
        return None
    import openpyxl
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        return None
    try:
        if META_SHEET not in wb.sheetnames:
            return None
        meta = [list(r) for r in wb[META_SHEET].iter_rows(values_only=True)]
        if not meta or meta[0][0] != MAGIC:
            return None
        info = {r[0]: r[1:] for r in meta[1:6] if r and r[0]}
        labels = [imp._cell_to_str(v) for v in info.get("labels", []) if v is not None]
        keys = [imp._cell_to_str(v) for v in info.get("keys", []) if v is not None]
        snapshot: Dict[str, Dict[str, str]] = {}
        for r in meta[6:]:
            if r and r[0] and len(r) > 1 and r[1]:
                snapshot[str(r[0])] = json.loads(r[1])
        sheet = wb.worksheets[0]
        rows = [[imp._cell_to_str(c) for c in row] for row in sheet.iter_rows(values_only=True)]
    finally:
        wb.close()
    return {
        "project": imp._cell_to_str(info.get("project", [""])[0]),
        "prefix": imp._cell_to_str(info.get("prefix", [""])[0]),
        "exported": imp._cell_to_str(info.get("exported", [""])[0]),
        "label_to_key": dict(zip(labels, keys)),
        "snapshot": snapshot,
        "rows": rows,
    }


# ─── Vergleichen ──────────────────────────────────────────────────────────────

def compare(project_id: str, filename: str, content: bytes) -> Dict:
    rt = read_roundtrip(filename, content)
    if rt is None:
        raise ValueError("Diese Datei wurde nicht mit „Für Excel exportieren“ aus ReqMan erzeugt")
    if rt["project"] != project_id:
        raise ValueError("Die Datei stammt aus einem anderen Projekt")
    prefix = rt["prefix"]
    _project, tree, doc = _project_and_doc(project_id, prefix)
    cols = _columns(prefix)
    labels = dict(cols)
    attrs = imp._attributes_for(prefix)
    current = {i["uid"]: i for i in _items(doc)}
    all_uids = {str(i.uid) for d in tree.documents for i in ds._real_items(d)}

    rows = rt["rows"]
    if not rows:
        raise ValueError("Das erste Blatt ist leer")
    header = rows[0]
    col_keys: List[Optional[str]] = []
    ignored: List[str] = []
    for h in header:
        key = rt["label_to_key"].get(h)
        if key is None and h:
            # Spalten, die es beim Export nicht gab, aber heute gibt (z. B. neues Attribut)
            key = next((k for k, lbl in cols if lbl == h), None)
        if key is None and h:
            ignored.append(h)
        col_keys.append(key)
    if "uid" not in col_keys:
        raise ValueError("Die Spalte „ID“ fehlt – ohne sie lassen sich die Zeilen nicht zuordnen")

    changes: List[Dict] = []
    new_rows: List[Dict] = []
    new_raw: List[Dict[str, str]] = []
    seen: Dict[str, int] = {}
    unchanged = 0
    final_levels = {i["level"]: uid for uid, i in current.items()}

    for r_idx, raw in enumerate(rows[1:], start=2):
        values = {k: raw[c] for c, k in enumerate(col_keys) if k and c < len(raw)}
        if not any(v for k, v in values.items()):
            continue
        uid = values.get("uid", "").strip()
        comment = values.get("comment", "").strip()

        if not uid:
            new_raw.append({k: v for k, v in values.items() if k not in ("uid", "comment")})
            new_rows.append({"row": r_idx, "comment": comment,
                             "text": values.get("header") or values.get("text", "")})
            continue

        entry: Dict[str, Any] = {"row": r_idx, "uid": uid, "comment": comment,
                                 "fields": [], "errors": [], "conflicts": [], "patch": None}
        if uid in seen:
            entry["errors"].append(f"ID {uid} kommt doppelt vor (auch Zeile {seen[uid]})")
            changes.append(entry)
            continue
        seen[uid] = r_idx
        item = current.get(uid)
        if item is None:
            entry["errors"].append(f"{uid} gibt es in {prefix} nicht (mehr) – ID in Excel geändert?")
            changes.append(entry)
            continue
        entry["label"] = _split_header(item["text"])[0] if item["header"] else item["text"][:120]

        now = _row_values(item, cols)
        orig = rt["snapshot"].get(uid, now)
        patch: Dict[str, Any] = {}
        attr_patch: Dict[str, Any] = {}
        for key, excel in values.items():
            if key in ("uid", "comment"):
                continue
            base = orig.get(key, now.get(key, ""))
            cur = now.get(key, "")
            if _same(key, excel, base):
                continue  # in Excel nicht geändert (ReqMan-Stand bleibt, auch wenn er neuer ist)
            if _same(key, excel, cur):
                continue  # schon übernommen
            field = {"field": key, "label": labels.get(key, key), "old": cur, "new": _norm(excel),
                     "conflict": not _same(key, cur, base)}
            if field["conflict"]:
                entry["conflicts"].append(f"{field['label']} wurde seit dem Export auch in ReqMan geändert")
            err = _check_field(key, excel, item, attrs, all_uids)
            if err:
                entry["errors"].append(err)
            elif key == "level":
                patch["level"] = excel.strip()
            elif key in ("text", "header"):
                patch[key] = _norm(excel)
            elif key == "links":
                patch["links"] = imp._split_links(excel)
            else:
                attr = attrs[key[len(imp.ATTR_PREFIX):]]
                value, _ = imp._convert_attr(attr, excel) if excel.strip() else ("", None)
                attr_patch[attr["key"]] = value
            entry["fields"].append(field)

        if not entry["fields"]:
            if comment:
                entry["label"] = entry.get("label", "")
                changes.append(entry)  # nur Kommentar
            else:
                unchanged += 1
            continue

        if "level" in patch:
            final_levels = {lv: u for lv, u in final_levels.items() if u != uid}
            if patch["level"] in final_levels:
                entry["errors"].append(f"Level {patch['level']} ist schon vergeben ({final_levels[patch['level']]})")
            final_levels[patch["level"]] = uid

        if not entry["errors"]:
            update: Dict[str, Any] = {}
            if "level" in patch:
                update["level"] = patch["level"]
            if "links" in patch:
                update["links"] = patch["links"]
            if "text" in patch or "header" in patch:
                if item["header"]:
                    title, body = _split_header(item["text"])
                    title = patch.get("header", title)
                    body = patch.get("text", body)
                    update["text"] = f"{title}\n\n{body}" if body else title
                else:
                    update["text"] = patch["text"]
            if attr_patch:
                update["custom_attributes"] = attr_patch
            entry["patch"] = update
        changes.append(entry)

    # Neue Zeilen: dieselbe Prüfung wie beim Excel-Import
    if new_raw:
        check = imp.validate_rows(project_id, prefix, new_raw)
        existing_text = {_norm(i["text"]).lower(): uid for uid, i in current.items()}
        for info, res in zip(new_rows, check["rows"]):
            info.update(errors=res["errors"], notes=res["notes"], item=res["item"])
            # Datei ein zweites Mal geladen? Neue Zeilen haben ja noch keine ID in der Datei.
            dup = existing_text.get(_norm(res["item"]["text"] if res["item"] else info["text"]).lower())
            if dup:
                info["errors"].append(f"Gibt es schon als {dup} – wurde diese Zeile bereits übernommen?")
                info["item"] = None

    in_file = set(seen)
    not_in_file = [uid for uid in rt["snapshot"] if uid in current and uid not in in_file]

    return {
        "prefix": prefix,
        "exported": rt["exported"],
        "changes": changes,
        "new": new_rows,
        "unchanged": unchanged,
        "not_in_file": not_in_file,
        "ignored_columns": ignored,
    }


def _check_field(key: str, raw: str, item: Dict, attrs: Dict[str, Dict], all_uids: set) -> Optional[str]:
    value = raw.strip()
    if key == "level":
        if not _LEVEL_RE.match(value):
            return f"Level „{value}“ ist ungültig (Beispiel: 1.2.3)"
    elif key == "header":
        if not item["header"]:
            return "„Abschnitt“ ist nur bei Abschnittszeilen erlaubt – Anforderung zum Abschnitt machen geht im Editor"
        if not value:
            return "Abschnittstitel darf nicht leer sein"
    elif key == "text":
        if _is_rich(item["text"]) or _is_rich(value):
            return "Formatierter Text (Bild, Tabelle, HTML, Code) nur im Rich-Text-Editor ändern"
        if not value and not item["header"]:
            return "Anforderungstext darf nicht leer sein"
    elif key == "links":
        missing = [l for l in imp._split_links(value) if l not in all_uids]
        if missing:
            return f"Link-Ziel nicht gefunden: {', '.join(missing)}"
    elif key.startswith(imp.ATTR_PREFIX):
        attr = attrs.get(key[len(imp.ATTR_PREFIX):])
        if attr is None:
            return None
        name = attr.get("display_name") or attr["key"]
        if not value:
            if attr.get("required") and item["active"] and not item["header"]:
                return f"Pflichtattribut {name} darf nicht leer sein"
            return None
        _, err = imp._convert_attr(attr, value)
        return err
    return None


# ─── Übernehmen ───────────────────────────────────────────────────────────────

def apply(project_id: str, filename: str, content: bytes, uids: List[str], new_rows: List[int]) -> Dict:
    """Übernimmt die ausgewählten Änderungen und neuen Zeilen – alle oder keine."""
    result = compare(project_id, filename, content)
    prefix = result["prefix"]
    by_uid = {c["uid"]: c for c in result["changes"]}
    by_row = {n["row"]: n for n in result["new"]}

    todo = []
    for uid in uids:
        c = by_uid.get(uid)
        if c is None or c["patch"] is None:
            raise ValueError(f"{uid}: keine übernehmbare Änderung (Datei geändert oder Fehler)")
        todo.append(c)
    create = []
    for row in new_rows:
        n = by_row.get(row)
        if n is None or n.get("item") is None:
            raise ValueError(f"Zeile {row}: keine gültige neue Anforderung")
        create.append(n)
    if not todo and not create:
        raise ValueError("Nichts ausgewählt")

    backup: List[Tuple[str, Dict]] = []
    created: List[str] = []
    try:
        for c in todo:
            before = ds.get_item(project_id, c["uid"])
            backup.append((c["uid"], {
                "text": before["text"], "level": before["level"], "links": before["links"],
                "custom_attributes": {k: (before["custom_attributes"] or {}).get(k, "")
                                      for k in (c["patch"].get("custom_attributes") or {})},
            }))
            ds.update_item(project_id, c["uid"], c["patch"])
        for n in create:
            created.append(ds.create_item(project_id, prefix, n["item"])["uid"])
    except Exception as e:
        for uid in reversed(created):
            try:
                ds.delete_item(project_id, uid)
            except Exception:
                pass
        for uid, old in reversed(backup):
            try:
                ds.update_item(project_id, uid, old)
            except Exception:
                pass
        raise ValueError(f"Übernahme abgebrochen, nichts geändert: {e}")
    return {"updated": [c["uid"] for c in todo], "created": created}
