"""„Was steht als Nächstes an?“ – offene Punkte eines Projekts, ohne Sprachmodell (A4, Teil 2).

Feste Regeln in fester Reihenfolge; je Regel mit Treffern ein Eintrag
``{"key", "title", "count", "explanation", "route", "uids"}`` (``uids`` = erste 10).
Der doorstop-Baum wird genau einmal gebaut. Überschriften und inaktive Items zählen nicht.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

import doorstop

import ai_quality_service as aqs
import doorstop_service as ds

logger = logging.getLogger(__name__)

MAX_UIDS = 10


def _plural(n: int, one: str, many: str) -> str:
    return one if n == 1 else many


def _entry(key: str, title: str, uids: List[str], explanation: str, route: str) -> Dict[str, Any]:
    return {
        "key": key,
        "title": title,
        "count": len(uids),
        "explanation": explanation,
        "route": route,
        "uids": uids[:MAX_UIDS],
    }


# Zusätzliche Regeln, die spätere Schritte vorne einhängen (A6: offene Vorschläge).
# Jede Funktion bekommt die Projekt-ID und liefert einen Eintrag oder None.
EXTRA_RULES: List[Callable[[str], Optional[Dict[str, Any]]]] = []


def next_steps(project_id: str) -> List[Dict[str, Any]]:
    project = ds.get_project(project_id)
    if not project:
        raise ValueError(f"Projekt {project_id} nicht gefunden")
    pid = project_id
    steps: List[Dict[str, Any]] = []

    for rule in EXTRA_RULES:
        try:
            entry = rule(project_id)
        except Exception as exc:  # eine Zusatzregel darf die Liste nie verhindern
            logger.warning("next_steps: Zusatzregel fehlgeschlagen: %s", exc)
            entry = None
        if entry:
            steps.append(entry)

    try:
        tree = ds._build_tree(project["path"])
        documents = list(tree.documents)
    except (doorstop.DoorstopError, OSError) as exc:
        logger.warning("next_steps: Projekt %s nicht lesbar: %s", project_id, exc)
        documents = []

    if not documents:
        steps.append(_entry(
            "no_documents", "Lege das erste Dokument an", [],
            "Anforderungen stehen immer in einem Dokument (Präfix, z. B. SYS oder SRS). "
            "Ohne Dokument kann man noch nichts anlegen.",
            f"/document-structure/{pid}",
        ))
        steps[-1]["count"] = 1
        return steps

    # Je Dokument die zählenden Items (keine Überschriften, nur aktive)
    parent_of: Dict[str, Optional[str]] = {}
    items_of: Dict[str, List[Dict[str, Any]]] = {}
    empty_docs: List[str] = []
    for doc in documents:
        prefix = str(doc.prefix)
        try:
            parent_of[prefix] = str(doc.parent) if doc.parent else None
        except Exception:
            parent_of[prefix] = None
        all_items = [ds._item_to_dict(i) for i in ds._real_items(doc)]
        if not all_items:
            empty_docs.append(prefix)
        items_of[prefix] = [d for d in all_items if not d["header"] and d["active"]]
    counted = [d for prefix in items_of for d in items_of[prefix]]

    # Wer wird von einem Kind verlinkt?
    linked_targets = {str(link).upper() for d in counted for link in d["links"]}

    if empty_docs:
        n = len(empty_docs)
        steps.append(_entry(
            "empty_documents",
            f"{n} {_plural(n, 'Dokument ist', 'Dokumente sind')} noch leer",
            empty_docs,
            "In diesen Dokumenten gibt es noch keine Anforderung. Dokument auswählen und mit + "
            "anlegen oder aus Excel einfügen.",
            f"/requirements/{pid}",
        ))

    unlinked = [d["uid"] for prefix, items in items_of.items() if parent_of.get(prefix)
                for d in items if not d["links"] and not d["derived"]]
    if unlinked:
        n = len(unlinked)
        steps.append(_entry(
            "unlinked",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} ohne Verlinkung nach oben",
            unlinked,
            "Diese Anforderungen liegen in einem Dokument mit Eltern-Dokument, verweisen aber auf "
            "keine Eltern-Anforderung. In Traceability (Ansicht „Verknüpfen“) oder im Editor verlinken "
            "(oder als „Abgeleitet“ markieren).",
            f"/traceability/{pid}?view=link",
        ))

    parents_with_children = {p for p in parent_of.values() if p}
    uncovered = [d["uid"] for prefix, items in items_of.items() if prefix in parents_with_children
                 for d in items if d["uid"].upper() not in linked_targets]
    if uncovered:
        n = len(uncovered)
        steps.append(_entry(
            "uncovered",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} ohne Ableitung",
            uncovered,
            "Auf diese Anforderungen zeigt keine Anforderung aus einem untergeordneten Dokument. "
            "In Traceability (Ansicht „Matrix“) sieht man, wo die Ableitung fehlt.",
            f"/traceability/{pid}?view=matrix",
        ))

    changed = [d["uid"] for d in counted if d["reviewed_current"] is False]
    if changed:
        n = len(changed)
        steps.append(_entry(
            "changed_after_review",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} seit dem Review geändert",
            changed,
            "Text, Referenz oder Links wurden nach dem Review-Stempel geändert. Änderung prüfen "
            "und neu stempeln.",
            f"/requirements/{pid}",
        ))

    never = [d["uid"] for d in counted if d["reviewed"] is None]
    if never:
        n = len(never)
        steps.append(_entry(
            "never_reviewed",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} ohne Review",
            never,
            "Diese Anforderungen wurden noch nie gestempelt. Im Editor unter Review-Status "
            "„Stempeln“ klicken, wenn sie geprüft sind.",
            f"/requirements/{pid}",
        ))

    not_checked: List[str] = []
    below: List[str] = []
    for d in counted:
        try:
            result = aqs.load_quality_result(project_id, d["uid"])
        except Exception:
            result = None
        if result is None:
            not_checked.append(d["uid"])
        elif result.score is not None and result.score.passed is False:
            below.append(d["uid"])

    if not_checked:
        n = len(not_checked)
        steps.append(_entry(
            "not_checked",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} ohne KI-Prüfung",
            not_checked,
            "Für diese Anforderungen gibt es noch kein Ergebnis der KI-Qualitätsprüfung "
            "(Tab KI-Qualität, „Jetzt prüfen“).",
            f"/requirements/{pid}",
        ))

    if below:
        n = len(below)
        steps.append(_entry(
            "below_min_score",
            f"{n} {_plural(n, 'Anforderung', 'Anforderungen')} unter der Mindestnote",
            below,
            "Die letzte KI-Prüfung lag unter der Mindestnote des Qualitätsprofils. Befunde im "
            "Tab KI-Qualität ansehen und die Anforderung überarbeiten.",
            f"/requirements/{pid}",
        ))

    return steps
