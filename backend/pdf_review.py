"""Vorlage „Review-/Meeting-Unterlage“ (E3): Daten aufbereiten und mit templates/review.typ setzen."""
from __future__ import annotations

from datetime import datetime
from typing import Dict, List

import doorstop_service as ds
import pdf_filter
import typst_service as ts

STATUS_ORDER = ["nicht geprüft", "geändert nach Prüfung", "geprüft"]


def _describe_filter(flt, n_docs_label: str) -> str:
    """Kurzer Text, welche Auswahl der Unterlage zugrunde liegt (für den Kopf)."""
    parts: List[str] = []
    if flt.uids:
        parts.append(f"{len(flt.uids)} markierte")
    if flt.status:
        parts.append("Status: " + ", ".join(flt.status))
    if (flt.changed_since or "").strip():
        parts.append(f"geändert seit {flt.changed_since.strip()}")
    a = flt.attribute
    if a is not None and (a.name or "").strip():
        parts.append(f"{a.name.strip()} = {a.value.strip()}" if (a.value or "").strip() else f"{a.name.strip()} gesetzt")
    sel = "; ".join(parts) if parts else "alle Anforderungen"
    return f"{sel} ({n_docs_label})" if n_docs_label else sel


def build_review_data(project_id: str, req) -> Dict:
    """Datengerüst für review.typ. Raises: ValueError, KeyError (wie `typst_service.build_data`)."""
    project = ds.get_project(project_id)
    if not project:
        raise ValueError("Projekt nicht gefunden")
    base = ts.build_data(project_id, documents=list(req.documents) or None, attributes=None)
    flt, opts = req.filter, req.options

    items: List[Dict] = []
    for doc in base["documents"]:
        for e in doc["items"]:
            if e["kind"] == "req":
                items.append(dict(e, doc=doc["prefix"]))
    chosen = pdf_filter.select(items, flt, project["path"])

    shown_attrs = list(opts.attributes)
    rows = []
    for i, e in enumerate(chosen, 1):
        attrs = list(e["attributes"])
        by_name = {a: m["markup"] for a, m in zip(attrs, e["attributes_markup"])}
        # Namen der Attribute stehen in `attributes_markup` bereits maskiert
        name_markup = {a: m["name"] for a, m in zip(attrs, e["attributes_markup"])}
        rows.append({
            "nr": i, "uid": e["uid"], "ref": e["ref"], "doc": e["doc"], "level": e["level"],
            "markup": e["markup"], "status": e["status"],
            "attributes_markup": [{"name": name_markup[a], "markup": by_name[a]} for a in shown_attrs if a in by_name],
            "gross": bool(e["images"]) or "#tabelle(" in e["markup"],
        })

    counts = {s: 0 for s in STATUS_ORDER}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    m = opts.meeting
    data = dict(base)
    for k in ("documents", "trace", "open_points"):
        data.pop(k, None)
    data.update({
        "title": "Review-Unterlage",
        "project": project["name"],
        "meeting": {
            "title": m.title.strip() or "Review-Unterlage",
            "date": m.date.strip(),
            "place": m.place.strip(),
            "participants": [p.strip() for p in m.participants if p.strip()],
        },
        "auswahl": _describe_filter(flt, base["documents_label"]),
        "attribute": shown_attrs,
        "rows": rows,
        "summary": [{"status": s, "anzahl": counts[s]} for s in STATUS_ORDER],
        "gesamt": len(rows),
    })
    data["stand"] = data.get("stand") or datetime.now().strftime("%d.%m.%Y %H:%M")
    return data


def render(project_id: str, req) -> bytes:
    if not ts.typst_available():
        raise ts.TypstUnavailable("Typst ist nicht installiert")
    return ts.compile_pdf(build_review_data(project_id, req), "review")
