"""ReqMan-MCP-Server (stdio): ReqMan als Werkzeugsatz für KI-Agenten.

Der Server ist ein Client der REST-API (Rollen und Rechte des ReqMan-Benutzers gelten) und enthält keine
Fachlogik. Wichtig bei stdio: stdout ist der Protokollkanal – kein print(), Protokoll nur über logging (stderr).
"""
import logging
import re
import sys
from typing import Any, Dict, List, Optional

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations

from reqman_client import ReqManClient, ReqManError

logging.basicConfig(stream=sys.stderr, level=logging.INFO)
log = logging.getLogger("reqman-mcp")

MAX_LIST = 50

mcp = MCPServer(
    "ReqMan",
    instructions=(
        "ReqMan verwaltet Anforderungen (doorstop-Projekte aus Dokumenten mit Anforderungen und Links). "
        "Beginne mit list_projects und get_project_overview. Wenn die UID nicht bekannt ist, nutze search_requirements."
    ),
)

_client: Optional[ReqManClient] = None


def get_client() -> ReqManClient:
    global _client
    if _client is None:
        _client = ReqManClient()
    return _client


def set_client(client: Optional[ReqManClient]) -> None:
    """Ersetzt den Client (Tests)."""
    global _client
    _client = client


READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)


def _plain(text: str, n: int = 240) -> str:
    t = re.sub(r"<[^>]+>", " ", text or "")
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[:n].rstrip() + "…"


def _run(fn):
    """ReqManError -> ToolError mit deutschem Text und nächstem Schritt."""
    try:
        return fn()
    except ReqManError as e:
        raise ToolError(e.detail)


def _pid(project: Optional[str]) -> str:
    return get_client().resolve_project(project)


def _lines_limited(lines: List[str], total: Optional[int] = None) -> str:
    total = len(lines) if total is None else total
    out = lines[:MAX_LIST]
    if total > MAX_LIST:
        out.append(f"… gekürzt: {MAX_LIST} von {total} Einträgen gezeigt.")
    return "\n".join(out)


def _hit_line(h: Dict[str, Any]) -> str:
    link = " (verlinkt)" if h.get("linked") else ""
    return f"- **{h['uid']}** ({h['prefix']}, Ähnlichkeit {h['score']}){link}: {_plain(h['text'])}"


@mcp.tool(annotations=READ_ONLY)
def list_projects() -> str:
    """Listet alle ReqMan-Projekte (Name, ID). Einstieg: zuerst benutzen, wenn noch kein Projekt bekannt ist."""
    projects = _run(lambda: get_client().list_projects())
    if not projects:
        return "Es gibt noch keine Projekte."
    return _lines_limited([f"- **{p['name']}** (ID {p['id']}) {p.get('description') or ''}".rstrip() for p in projects])


@mcp.tool(annotations=READ_ONLY)
def get_project_overview(project: str) -> str:
    """Überblick über ein Projekt: Dokumente mit Hierarchie und Anzahl, Link- und Review-Abdeckung sowie offene
    Punkte (was als Nächstes ansteht). Nimm dieses Werkzeug, um ein Projekt zu verstehen, bevor du Details liest."""
    c = get_client()

    def work():
        pid = c.resolve_project(project)
        docs = c.get(f"/api/projects/{pid}/documents")
        metrics = c.get(f"/api/projects/{pid}/metrics")
        try:
            steps = c.get(f"/api/projects/{pid}/next-steps")
        except ReqManError:
            steps = None
        return docs, metrics, steps

    docs, metrics, steps = _run(work)
    lines = ["## Dokumente (Präfix, Eltern-Dokument, Anzahl Anforderungen)"]
    for d in docs:
        lines.append(f"- **{d['prefix']}** – Eltern: {d.get('parent') or '– (oberste Ebene)'}, {d['item_count']} Anforderungen")
    lines.append("")
    lines.append(f"## Abdeckung\n- Anforderungen gesamt: {metrics['total_items']}\n"
                 f"- Verlinkt: {metrics['link_coverage']} %\n- Reviewed: {metrics['review_coverage']} %")
    if steps:
        lines.append("\n## Offene Punkte")
        for s in steps:
            lines.append(f"- {s['title']} ({s.get('count', '')}) – {s.get('explanation', '')}".rstrip(" –"))
    return "\n".join(lines)


@mcp.tool(annotations=READ_ONLY)
def list_requirements(project: str, document: str, offset: int = 0, limit: int = 50) -> str:
    """Listet die Anforderungen eines Dokuments in Reihenfolge (UID, Ebene, Text, Links). Für Überblick über ein
    ganzes Dokument; für eine einzelne Anforderung get_requirement nehmen."""
    c = get_client()

    def work():
        pid = c.resolve_project(project)
        return c.get(f"/api/projects/{pid}/documents/{document}/items")

    items = _run(work)
    limit = max(1, min(limit, MAX_LIST))
    page = items[offset:offset + limit]
    lines = []
    for it in page:
        kind = "Überschrift" if it.get("header") else "Anforderung"
        links = f" → {', '.join(it['links'])}" if it.get("links") else ""
        lines.append(f"- **{it['uid']}** [{it['level']}, {kind}]{links}: {_plain(it['text'])}")
    if not lines:
        return f"Keine Anforderungen in {document} ab Position {offset}."
    footer = f"\nPositionen {offset + 1}–{offset + len(page)} von {len(items)}." if len(items) > len(page) else ""
    return "\n".join(lines) + footer


@mcp.tool(annotations=READ_ONLY)
def get_requirement(project: str, uid: str) -> str:
    """Volltext einer Anforderung mit Attributen, Links nach oben und unten, Review-Stand und letztem
    KI-Qualitätsergebnis. Nimm es, wenn die UID bekannt ist."""
    c = get_client()

    def work():
        pid = c.resolve_project(project)
        item = c.get(f"/api/projects/{pid}/items/{uid}")
        try:
            impact = c.get(f"/api/projects/{pid}/items/{uid}/impact")
        except ReqManError:
            impact = None
        try:
            quality = c.get(f"/api/projects/{pid}/items/{uid}/ai-quality")
        except ReqManError:
            quality = None
        return item, impact, quality

    item, impact, quality = _run(work)
    review = "nie reviewed"
    if item.get("reviewed"):
        review = "reviewed, aktuell" if item.get("reviewed_current") else "reviewed, aber seitdem geändert (veraltet)"
    out = [f"# {item['uid']}", f"Ebene {item['level']} · aktiv: {item['active']} · normativ: {item['normative']} · "
           f"Überschrift: {item['header']} · {review}", "", _plain(item["text"], 4000)]
    if item.get("links"):
        out.append(f"\nVerlinkt auf (Eltern): {', '.join(item['links'])}")
    if impact:
        down = [x["uid"] for x in impact["downstream"] if x["depth"] == 1]
        if down:
            out.append(f"Direkt abgeleitet (Kinder): {', '.join(down)}")
    if item.get("custom_attributes"):
        out.append("Attribute: " + "; ".join(f"{k}={v}" for k, v in item["custom_attributes"].items()))
    if quality:
        s = quality["score"]
        out.append(f"\nKI-Qualität (letzte Prüfung, Profil {quality['profile_used']}): Note {s['overall']}")
        for i in quality["issues"][:10]:
            out.append(f"- [{i['severity']}/{i['category']}] {i['description']} → {i['suggestion']}")
    return "\n".join(out)


@mcp.tool(annotations=READ_ONLY)
def search_requirements(project: str, query: str, document: Optional[str] = None, k: int = 8) -> str:
    """Sucht nach Bedeutung (nicht nur Wörtern) in den Anforderungen eines Projekts; zuerst benutzen, wenn die UID
    nicht bekannt ist. Optional auf ein Dokument (Präfix) einschränken."""
    c = get_client()

    def work():
        pid = c.resolve_project(project)
        params: Dict[str, Any] = {"q": query, "k": max(1, min(k, MAX_LIST))}
        if document:
            params["prefix"] = document
        return c.get(f"/api/projects/{pid}/rag/search", **params)

    hits = _run(work)
    return _lines_limited([_hit_line(h) for h in hits]) if hits else "Keine Treffer."


@mcp.tool(annotations=READ_ONLY)
def find_similar_requirements(project: str, uid: str, k: int = 5) -> str:
    """Findet ähnliche Anforderungen zu einer UID – Hinweis auf Dubletten und mögliche Widersprüche."""
    c = get_client()
    hits = _run(lambda: c.get(f"/api/projects/{c.resolve_project(project)}/items/{uid}/similar", k=max(1, min(k, MAX_LIST))))
    return _lines_limited([_hit_line(h) for h in hits]) if hits else "Keine ähnlichen Anforderungen."


@mcp.tool(annotations=READ_ONLY)
def suggest_links(project: str, uid: str) -> str:
    """Schlägt Verlinkungen vor: die passendsten noch nicht verlinkten Anforderungen aus dem Eltern-Dokument.
    Es wird nichts verlinkt; die Liste ist eine Rangliste, keine sichere Zuordnung."""
    c = get_client()
    r = _run(lambda: c.get(f"/api/projects/{c.resolve_project(project)}/items/{uid}/link-suggestions"))
    if not r.get("parent_document"):
        return f"{uid} gehört zu einem Dokument ohne Eltern-Dokument – keine Link-Vorschläge."
    if not r["suggestions"]:
        return f"Keine weiteren Kandidaten in {r['parent_document']}."
    return f"Kandidaten in {r['parent_document']}:\n" + _lines_limited([_hit_line(h) for h in r["suggestions"]])


@mcp.tool(annotations=READ_ONLY)
def analyze_impact(project: str, uid: str) -> str:
    """Zeigt, was von einer Änderung an der Anforderung betroffen wäre: abhängige Anforderungen (abwärts), Eltern
    (aufwärts) und ähnliche, aber nicht verlinkte Anforderungen."""
    c = get_client()
    r = _run(lambda: c.get(f"/api/projects/{c.resolve_project(project)}/items/{uid}/impact"))

    def block(title, items):
        if not items:
            return f"{title}: keine"
        return title + ":\n" + _lines_limited(
            [f"- **{x['uid']}** ({x['prefix']}, Tiefe {x['depth']}){' [reviewed]' if x.get('reviewed') else ''}: {_plain(x['text'])}"
             for x in items])

    docs = {x["prefix"] for x in r["downstream"]}
    return "\n\n".join([
        f"Eine Änderung an {uid} betrifft {len(r['downstream'])} Anforderungen in {len(docs)} Dokumenten.",
        block("Abwärts (abhängig davon)", r["downstream"]),
        block("Aufwärts (davon abhängig)", r["upstream"]),
        "Ähnlich, aber nicht verlinkt:\n" + (_lines_limited([_hit_line(h) for h in r["similar_unlinked"]])
                                             if r["similar_unlinked"] else "keine"),
    ])


@mcp.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False,
                                      open_world_hint=False))
def check_requirement_quality(project: str, uid: str, profile: str = "standard") -> str:
    """Startet die Regel- und KI-Qualitätsprüfung einer Anforderung (dauert einige Sekunden) und SPEICHERT das
    Ergebnis in ReqMan (Datei neben der Anforderung); Text und Links der Anforderung bleiben unverändert."""
    c = get_client()
    r = _run(lambda: c.post(f"/api/projects/{c.resolve_project(project)}/items/{uid}/ai-quality", json={"profile": profile}))
    s = r["score"]
    out = [f"Qualität von {uid}: Note {s['overall']}" +
           (f" (Mindestnote {s['min_score']}, {'bestanden' if s.get('passed') else 'nicht bestanden'})" if s.get("min_score") is not None else ""),
           r["summary"]]
    for i in r["issues"][:15]:
        out.append(f"- [{i['severity']}/{i['category']}] {i['description']} → {i['suggestion']}")
    return "\n".join(out)


@mcp.tool(annotations=READ_ONLY)
def reqman_help(question: str) -> str:
    """Erklärt, wie etwas in ReqMan bedient wird (z. B. „Wie importiere ich Excel?“, „Was heißt Stempeln?“)."""
    c = get_client()
    hits = _run(lambda: c.get("/api/help/search", q=question))
    if not hits:
        return "Dazu finde ich in der ReqMan-Hilfe nichts."
    return "\n\n".join(f"### {h['title']}\n{h['text']}" + (f"\n(Seite {h['route']})" if h.get("route") else "") for h in hits[:4])


PROPOSE = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=False)
PROPOSE_NOTE = "Legt einen Vorschlag an. Ändert nichts an den Anforderungen; ein Mensch entscheidet in ReqMan. "


def _propose(project: str, body: Dict[str, Any]) -> str:
    c = get_client()
    if len((body.get("reason") or "").strip()) < 10:
        raise ToolError("Die Begründung (reason) ist Pflicht und braucht mindestens 10 Zeichen.")
    body["source"] = "mcp"
    pid = _run(lambda: c.resolve_project(project))
    p = _run(lambda: c.post(f"/api/projects/{pid}/proposals", json=body))
    return (f"Vorschlag Nr. {p['id']} angelegt (Status: {p['status']}). Es wurde nichts geändert. "
            f"Ein Mensch findet ihn in ReqMan unter „Vorschläge“ (/proposals/{pid}) und übernimmt oder lehnt ihn ab.")


@mcp.tool(annotations=PROPOSE)
def propose_text_change(project: str, uid: str, new_text: str, reason: str) -> str:
    """Legt einen Vorschlag an. Ändert nichts an den Anforderungen; ein Mensch entscheidet in ReqMan.
    Schlägt einen neuen Text für eine bestehende Anforderung vor (reason = Begründung, mind. 10 Zeichen).
    Ist die Anforderung bis zur Entscheidung geändert worden, gilt der Vorschlag als veraltet."""
    return _propose(project, {"kind": "change_text", "uid": uid, "new_text": new_text, "reason": reason})


@mcp.tool(annotations=PROPOSE)
def propose_new_requirement(project: str, document: str, text: str, reason: str, links: Optional[List[str]] = None) -> str:
    """Legt einen Vorschlag an. Ändert nichts an den Anforderungen; ein Mensch entscheidet in ReqMan.
    Schlägt eine neue Anforderung in einem Dokument (Präfix) vor, optional mit Links auf Eltern-UIDs."""
    return _propose(project, {"kind": "new_item", "prefix": document, "text": text, "reason": reason, "links": links or []})


@mcp.tool(annotations=PROPOSE)
def propose_link(project: str, uid: str, target_uid: str, reason: str) -> str:
    """Legt einen Vorschlag an. Ändert nichts an den Anforderungen; ein Mensch entscheidet in ReqMan.
    Schlägt vor, dass uid auf target_uid (Eltern-Anforderung) verlinkt."""
    return _propose(project, {"kind": "add_link", "uid": uid, "target_uid": target_uid, "reason": reason})


@mcp.prompt()
def einstieg(project: str) -> str:
    """Überblick über ein Projekt in fünf Sätzen."""
    return (f"Verschaffe dir mit get_project_overview einen Überblick über das ReqMan-Projekt „{project}“ und erkläre mir "
            "das Projekt in fünf Sätzen: Welche Dokumente gibt es, wie hängen sie zusammen, was fehlt (Links, Reviews, "
            "Qualität)? Lies bei Bedarf einzelne Anforderungen mit get_requirement. Ändere nichts.")


@mcp.prompt()
def review_dokument(project: str, document: str) -> str:
    """Anforderungen eines Dokuments durchgehen und Auffälligkeiten melden."""
    return (f"Gehe die Anforderungen des Dokuments {document} im ReqMan-Projekt „{project}“ durch "
            "(list_requirements, get_requirement). Suche je Anforderung ähnliche (find_similar_requirements), nenne "
            "Widersprüche (Zahlenwerte, Einheiten, Namen) und fehlende Links (suggest_links). Ändere nichts direkt; "
            "lege für jeden Fund einen Vorschlag an (propose_text_change, propose_new_requirement, propose_link) "
            "und fasse die Funde mit UID und Begründung zusammen.")


if __name__ == "__main__":
    mcp.run()
