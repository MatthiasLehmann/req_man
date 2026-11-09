"""
Tabellen-Import (Excel/CSV/Zwischenablage) für ein doorstop-Dokument.

Ziel: Anforderungen, die bereits in einer Tabelle stehen, ohne Abtippen übernehmen –
ohne dabei die Struktur- und Korrektheitsregeln von ReqMan aufzuweichen:

* Jede Zeile wird **vor** dem Anlegen vollständig geprüft (Pflichtattribute,
  erlaubte Enum-Werte, Zahlen, Ja/Nein-Werte, Level-Format, Link-Ziele).
* Angelegt wird nur, wenn **alle** Zeilen gültig sind (alles oder nichts).
  Scheitert doorstop trotzdem mittendrin, werden die bereits angelegten Items
  wieder entfernt.

Zeilen kommen als Dicts mit Rohwerten (Strings) an. Schlüssel:
  text, header, level, normative, active, links   – doorstop-Standardfelder
  attr:<key>                                      – benutzerdefiniertes Attribut
"""

import csv
import io
import re
from typing import Any, Dict, List, Optional, Tuple

import doorstop

import doorstop_service as ds

STANDARD_FIELDS = {"text", "header", "level", "normative", "active", "links"}
ATTR_PREFIX = "attr:"
MAX_ROWS = 2000

_LEVEL_RE = re.compile(r"^\d+(\.\d+)*$")
_TRUE = {"1", "ja", "j", "yes", "y", "true", "wahr", "x", "✓", "✔"}
_FALSE = {"0", "nein", "n", "no", "false", "falsch", "-", ""}


# ─── Dateien lesen ────────────────────────────────────────────────────────────

def _cell_to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def parse_table_file(filename: str, content: bytes) -> List[List[str]]:
    """Liest .xlsx/.xlsm (erstes Blatt), .csv oder .tsv in eine Liste von Zeilen."""
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        import openpyxl
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as e:
            raise ValueError(f"Excel-Datei konnte nicht gelesen werden: {e}")
        ws = wb.worksheets[0]
        rows = [[_cell_to_str(c) for c in row] for row in ws.iter_rows(values_only=True)]
        wb.close()
    elif name.endswith((".csv", ".tsv", ".txt")):
        text = None
        for enc in ("utf-8-sig", "cp1252"):
            try:
                text = content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise ValueError("Datei ist weder UTF-8 noch Windows-1252 kodiert")
        if name.endswith(".tsv"):
            delimiter = "\t"
        else:
            try:
                delimiter = csv.Sniffer().sniff(text[:4096], delimiters=";,\t").delimiter
            except csv.Error:
                delimiter = ";" if text.count(";") > text.count(",") else ","
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), delimiter=delimiter)]
    else:
        raise ValueError("Unterstützt werden .xlsx, .csv und .tsv")

    # Leere Zeilen und nachlaufende leere Spalten entfernen
    rows = [r for r in rows if any(c for c in r)]
    width = max((max((i + 1 for i, c in enumerate(r) if c), default=0) for r in rows), default=0)
    rows = [(r + [""] * width)[:width] for r in rows]
    if len(rows) > MAX_ROWS + 1:
        raise ValueError(f"Höchstens {MAX_ROWS} Zeilen pro Import")
    return rows


# ─── Prüfen und Umwandeln ─────────────────────────────────────────────────────

def _attributes_for(prefix: str) -> Dict[str, Dict]:
    """Attribut-Definitionen, die für dieses Dokument gelten (applies_to leer = alle)."""
    result = {}
    for a in ds.load_attribute_config():
        applies = a.get("applies_to") or []
        if not applies or prefix in applies:
            result[a["key"]] = a
    return result


def _parse_bool(raw: str) -> Optional[bool]:
    v = raw.strip().lower()
    if v in _TRUE:
        return True
    if v in _FALSE:
        return False
    return None


def _convert_attr(attr: Dict, raw: str) -> Tuple[Any, Optional[str]]:
    """Wandelt einen Rohwert in den Attributtyp um. Rückgabe: (Wert, Fehler)."""
    name = attr.get("display_name") or attr["key"]
    t = attr.get("attr_type", "string")
    if t == "boolean":
        b = _parse_bool(raw)
        if b is None:
            return None, f"{name}: „{raw}“ ist kein Ja/Nein-Wert"
        return b, None
    if t == "integer":
        try:
            return int(raw.strip()), None
        except ValueError:
            return None, f"{name}: „{raw}“ ist keine ganze Zahl"
    if t == "enum":
        allowed = attr.get("possible_values") or []
        for v in allowed:  # Groß-/Kleinschreibung tolerieren, gespeichert wird der definierte Wert
            if v.lower() == raw.strip().lower():
                return v, None
        return None, f"{name}: „{raw}“ ist nicht erlaubt (erlaubt: {', '.join(allowed)})"
    if t == "list":
        return [s.strip() for s in re.split(r"[;,\n]", raw) if s.strip()], None
    return raw, None


def _split_links(raw: str) -> List[str]:
    return [s.strip() for s in re.split(r"[;,\s]+", raw) if s.strip()]


def validate_rows(project_id: str, prefix: str, rows: List[Dict[str, str]]) -> Dict:
    """
    Prüft alle Zeilen und liefert je Zeile Fehler, Hinweise und das fertige
    Item-Dict (nur bei fehlerfreien Zeilen).
    """
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    if len(rows) > MAX_ROWS:
        raise ValueError(f"Höchstens {MAX_ROWS} Zeilen pro Import")

    tree = ds._build_tree(project["path"])
    try:
        doc = tree.find_document(prefix)
    except doorstop.DoorstopError:
        raise ValueError(f"Dokument {prefix} nicht gefunden")
    existing_uids = {str(i.uid) for d in tree.documents for i in ds._real_items(d)}
    doc_levels = {str(i.level): str(i.uid) for i in ds._real_items(doc)}

    attrs = _attributes_for(prefix)
    unknown = sorted(
        k[len(ATTR_PREFIX):] for r in rows for k in r
        if k.startswith(ATTR_PREFIX) and k[len(ATTR_PREFIX):] not in attrs
    )
    if unknown:
        raise ValueError(f"Unbekannte Attribute für {prefix}: {', '.join(sorted(set(unknown)))}")

    seen_levels: Dict[str, int] = {}
    results = []
    for idx, row in enumerate(rows):
        errors: List[str] = []
        notes: List[str] = []
        get = lambda k: (row.get(k) or "").strip()  # noqa: E731

        text = (row.get("text") or "").strip()
        header = get("header")
        if not text and not header:
            errors.append("Anforderungstext fehlt")

        item: Dict[str, Any] = {"text": text, "custom_attributes": {}}
        if header:
            item["header"] = header

        level = get("level")
        if level:
            if not _LEVEL_RE.match(level):
                errors.append(f"Level „{level}“ ist ungültig (Beispiel: 1.2.3)")
            elif level in seen_levels:
                errors.append(f"Level {level} kommt doppelt vor (auch Zeile {seen_levels[level] + 1})")
            elif level in doc_levels:
                errors.append(f"Level {level} ist im Dokument schon vergeben ({doc_levels[level]})")
            else:
                seen_levels[level] = idx
                item["level"] = level

        for field in ("normative", "active"):
            raw = get(field)
            if raw:
                b = _parse_bool(raw)
                if b is None:
                    errors.append(f"{'Normativ' if field == 'normative' else 'Aktiv'}: „{raw}“ ist kein Ja/Nein-Wert")
                else:
                    item[field] = b

        links = _split_links(get("links"))
        missing = [l for l in links if l not in existing_uids]
        if missing:
            errors.append(f"Link-Ziel nicht gefunden: {', '.join(missing)}")
        if links:
            item["links"] = links

        for key, attr in attrs.items():
            raw = get(ATTR_PREFIX + key)
            name = attr.get("display_name") or key
            if not raw:
                # Pflichtattribute gelten für Anforderungen, nicht für Abschnittsüberschriften
                if attr.get("required") and not header:
                    default = attr.get("default_value")
                    if default not in (None, ""):
                        item["custom_attributes"][key] = default
                        notes.append(f"{name}: Standardwert „{default}“ übernommen")
                    else:
                        errors.append(f"Pflichtattribut {name} fehlt")
                continue
            value, err = _convert_attr(attr, raw)
            if err:
                errors.append(err)
            else:
                item["custom_attributes"][key] = value

        results.append({"errors": errors, "notes": notes, "item": None if errors else item})

    return {
        "rows": results,
        "valid": sum(1 for r in results if not r["errors"]),
        "invalid": sum(1 for r in results if r["errors"]),
    }


# ─── Anlegen ──────────────────────────────────────────────────────────────────

def import_rows(project_id: str, prefix: str, rows: List[Dict[str, str]]) -> Dict:
    """Legt alle Zeilen an – nur wenn alle gültig sind. Bei Fehlern wird zurückgerollt."""
    check = validate_rows(project_id, prefix, rows)
    if check["invalid"]:
        raise ValueError(f"{check['invalid']} Zeile(n) sind ungültig – es wurde nichts importiert")

    created: List[str] = []
    try:
        for r in check["rows"]:
            created.append(ds.create_item(project_id, prefix, r["item"])["uid"])
    except Exception as e:
        for uid in reversed(created):
            try:
                ds.delete_item(project_id, uid)
            except Exception:
                pass
        raise ValueError(f"Import abgebrochen, nichts übernommen: {e}")
    return {"created": created}
