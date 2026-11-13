"""„Frag ReqMan“ – Antworten mit Quellen (A4, Teil 3).

Fester Ablauf, genau ein Modellaufruf, keine Werkzeugschleife:
Suchen (Hilfe + Projekt) → Prompt mit nummerierten Quellen → Antwort → Verweise im Code prüfen.
Verweise auf Quellen, die nicht gefunden wurden, werden entfernt und gezählt – das Modell kann also keine
UID „erfinden“, die in der Antwort stehen bleibt.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

import ai_quality_service as aqs
import rag_service as rag

logger = logging.getLogger(__name__)

N_HELP = 4
N_ITEMS = 6
SOURCE_CHARS = 600
HISTORY_TURNS = 4
HISTORY_CHARS = 300
NOTHING_FOUND = "Dazu finde ich in diesem Projekt und in der Hilfe nichts."
UNCITED_NOTE = "(Quellen zur Frage, nicht zitiert)"

SYSTEM_PROMPT = f"""\
Du bist der Assistent in ReqMan, einem Werkzeug für Anforderungsmanagement.
Regeln:
- Antworte nur mit dem, was in den Quellen steht. Nichts dazuerfinden.
- Belege jede Aussage mit der Quelle in eckigen Klammern, z. B. [SRS012] oder [H2].
- Nenne keine Anforderungs-ID, die nicht in den Quellen steht.
- Steht die Antwort nicht in den Quellen, antworte genau: „{NOTHING_FOUND}“
- Höchstens 120 Wörter, auf Deutsch. Bei Fragen zur Bedienung: nummerierte Schritte.
Antworte nur als JSON: {{"antwort": "...", "quellen": ["SRS012", "H2"]}}"""

_REF = re.compile(r"\[([^\[\]\s]{1,40})\]")


def _short(text: str, n: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[:n].rstrip() + "…"


def collect_sources(project_id: Optional[str], question: str, context: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Quellen in fester Reihenfolge: Item aus dem Kontext, Hilfe H1…, Projekt-Treffer."""
    sources: List[Dict[str, Any]] = []
    seen_items = set()
    ctx_uid = (context or {}).get("uid")
    if project_id and ctx_uid:
        try:
            import doorstop_service as ds
            item = ds.get_item(project_id, ctx_uid)
        except Exception:
            item = None
        if item and not item.get("header"):
            sources.append({"kind": "item", "ref": item["uid"], "uid": item["uid"],
                            "prefix": aqs._uid_to_prefix(item["uid"]) or "",
                            "title": item["uid"], "snippet": _short(rag.clean_text(item.get("text", "")),
                                                                     SOURCE_CHARS)})
            seen_items.add(item["uid"].upper())
    for n, h in enumerate(rag.search_help(question, N_HELP), 1):
        sources.append({"kind": "help", "ref": f"H{n}", "title": h["title"],
                        "snippet": _short(h["text"], SOURCE_CHARS), "route": h["route"],
                        "anchor": h["anchor"]})
    if project_id:
        for h in rag.search(project_id, question, N_ITEMS):
            if h["uid"].upper() in seen_items:
                continue
            seen_items.add(h["uid"].upper())
            sources.append({"kind": "item", "ref": h["uid"], "uid": h["uid"], "prefix": h["prefix"],
                            "title": h["uid"], "snippet": _short(h["text"], SOURCE_CHARS)})
    return sources


def build_user_prompt(question: str, sources: List[Dict[str, Any]], history: List[Dict[str, Any]]) -> str:
    lines = ["Quellen:"]
    for s in sources:
        if s["kind"] == "help":
            lines.append(f"[{s['ref']}] {s['title']}\n{s['snippet']}")
        else:
            lines.append(f"[{s['ref']}] (Dokument {s['prefix']}) {s['snippet']}")
    turns = [h for h in (history or []) if isinstance(h, dict) and h.get("content")][-HISTORY_TURNS:]
    if turns:
        lines.append("\nBisheriges Gespräch:")
        for h in turns:
            role = "Nutzer" if h.get("role") == "user" else "Assistent"
            lines.append(f"{role}: {_short(str(h['content']), HISTORY_CHARS)}")
    lines.append(f"\nFrage: {question.strip()}")
    return "\n\n".join(lines)


def parse_answer(raw: str) -> str:
    """Text der Antwort aus dem JSON; kein gültiges Objekt → Rohtext."""
    try:
        json_str = aqs.QualityResultParser._extract_json(raw)
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            import json_repair
            data = json_repair.loads(json_str)
        if isinstance(data, dict) and isinstance(data.get("antwort"), str) and data["antwort"].strip():
            return data["antwort"].strip()
    except Exception:  # noqa: BLE001
        pass
    return (raw or "").strip()


def check_references(answer: str, sources: List[Dict[str, Any]]) -> tuple[str, List[Dict[str, Any]], List[str]]:
    """Entfernt Verweise auf unbekannte Quellen. Liefert (Text, zitierte Quellen in Reihenfolge, entfernte)."""
    by_ref = {s["ref"].upper(): s for s in sources}
    cited: List[Dict[str, Any]] = []
    removed: List[str] = []

    def repl(m: re.Match) -> str:
        ref = m.group(1).strip()
        src = by_ref.get(ref.upper())
        if src is None:
            # Nur Dinge entfernen, die wie ein Verweis aussehen (UID oder H<n>), keine Klammertexte
            if re.fullmatch(r"H\d+|[A-Za-z][\w.-]*\d", ref):
                removed.append(ref)
                return ""
            return m.group(0)
        if src not in cited:
            cited.append(src)
        return f"[{src['ref']}]"

    text = _REF.sub(repl, answer)
    text = re.sub(r"[ \t]+([.,;:!?])", r"\1", re.sub(r"[ \t]{2,}", " ", text)).strip()
    return text, cited, removed


def ask(project_id: Optional[str], question: str, context: Optional[Dict[str, Any]] = None,
        history: Optional[List[Dict[str, Any]]] = None, provider: Any = None) -> Dict[str, Any]:
    started = time.perf_counter()
    context = context or {}
    sources = collect_sources(project_id, question, context)
    system = SYSTEM_PROMPT
    user = build_user_prompt(question, sources, history or [])
    provider = provider or aqs.create_provider()
    model = aqs.resolve_model(None, {})
    raw = provider.complete(system, user, model=model)
    answer, cited, removed = check_references(parse_answer(raw), sources)
    if removed:
        logger.info("Assistent: erfundene Verweise entfernt: %s", ", ".join(removed))
    if cited:
        out_sources = cited
    elif NOTHING_FOUND in answer:
        out_sources = []
    else:
        out_sources = sources[:2]
        if out_sources:
            answer = f"{answer}\n\n{UNCITED_NOTE}".strip()
    return {
        "answer": answer,
        "sources": out_sources,
        "removed_refs": removed,
        "found": [s["ref"] for s in sources],
        "model": model,
        "seconds": round(time.perf_counter() - started, 2),
    }
