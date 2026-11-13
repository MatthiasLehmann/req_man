"""Tests des MCP-Servers ohne laufendes Backend (httpx.MockTransport + In-Memory-Client des SDK).

Ausführen:  cd mcp_server && .venv/Scripts/python -m pytest -q
"""
import httpx
import pytest
from mcp import Client

import server
from reqman_client import ReqManClient, ReqManError

HIT = {"uid": "SRS016", "prefix": "SRS", "level": "16.0", "text": "<p>Bei Divergenz Lauf abbrechen</p>",
       "score": 0.683, "linked": False}
ITEM = {"uid": "SRS016", "level": "16.0", "text": "Bei Divergenz Lauf abbrechen", "header": False, "active": True,
        "normative": True, "links": ["SYRS008"], "reviewed": "abc", "reviewed_current": True,
        "custom_attributes": {"Prio": "hoch"}}
IMPACT = {"uid": "SRS016", "downstream": [{"uid": "STC004", "prefix": "STC", "text": "Test NaN", "depth": 1, "reviewed": True}],
          "upstream": [{"uid": "SYRS008", "prefix": "SYRS", "text": "Terminieren", "depth": 1, "reviewed": None}],
          "similar_unlinked": [HIT]}
QUALITY = {"requirement_uid": "SRS016", "score": {"overall": 72, "min_score": 60, "passed": True}, "issues": [
    {"category": "Clarity", "severity": "low", "description": "vage", "suggestion": "präzisieren"}],
    "summary": "Okay.", "model_used": "m", "profile_used": "standard", "timestamp": "t"}

ROUTES = {
    ("GET", "/api/projects"): [{"id": "p1", "name": "Station3", "description": "Sim"}],
    ("GET", "/api/projects/p1/documents"): [{"prefix": "SYRS", "parent": None, "item_count": 20},
                                            {"prefix": "SRS", "parent": "SYRS", "item_count": 26}],
    ("GET", "/api/projects/p1/metrics"): {"total_items": 46, "link_coverage": 50.0, "review_coverage": 80.0, "documents": []},
    ("GET", "/api/projects/p1/next-steps"): [{"key": "unlinked", "title": "7 ohne Link", "count": 7, "explanation": "fehlt"}],
    ("GET", "/api/projects/p1/documents/SRS/items"): [ITEM] * 3,
    ("GET", "/api/projects/p1/items/SRS016"): ITEM,
    ("GET", "/api/projects/p1/items/SRS016/impact"): IMPACT,
    ("GET", "/api/projects/p1/items/SRS016/ai-quality"): QUALITY,
    ("GET", "/api/projects/p1/rag/search"): [HIT],
    ("GET", "/api/projects/p1/items/SRS016/similar"): [HIT],
    ("GET", "/api/projects/p1/items/SRS016/link-suggestions"): {"parent_document": "SYRS", "suggestions": [HIT]},
    ("POST", "/api/projects/p1/items/SRS016/ai-quality"): QUALITY,
    ("GET", "/api/help/search"): [{"title": "Excel importieren", "text": "Menü Import", "route": "/requirements"}],
}


def handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/api/auth/token":
        return httpx.Response(200, json={"access_token": "tok"})
    key = (request.method, request.url.path)
    if key in ROUTES:
        return httpx.Response(200, json=ROUTES[key])
    return httpx.Response(404, json={"detail": "nicht gefunden"})


@pytest.fixture
def fake_backend():
    server.set_client(ReqManClient(base_url="http://reqman.test", user="agent", password="x",
                                   transport=httpx.MockTransport(handler)))
    yield
    server.set_client(None)


@pytest.fixture
def anyio_backend():
    return "asyncio"


async def call(name, args=None):
    async with Client(server.mcp) as client:
        r = await client.call_tool(name, args or {})
        return r


def text(r) -> str:
    return "".join(c.text for c in r.content if hasattr(c, "text"))


@pytest.mark.anyio
async def test_all_tools_registered_and_annotated(fake_backend):
    async with Client(server.mcp) as client:
        tools = {t.name: t for t in (await client.list_tools()).tools}
    assert set(tools) == {"list_projects", "get_project_overview", "list_requirements", "get_requirement",
                          "search_requirements", "find_similar_requirements", "suggest_links", "analyze_impact",
                          "check_requirement_quality", "reqman_help"}
    assert tools["search_requirements"].annotations.read_only_hint is True
    assert tools["check_requirement_quality"].annotations.read_only_hint is False


@pytest.mark.anyio
@pytest.mark.parametrize("name,args,expect", [
    ("list_projects", {}, "Station3"),
    ("get_project_overview", {"project": "station3"}, "7 ohne Link"),
    ("list_requirements", {"project": "Station3", "document": "SRS"}, "SRS016"),
    ("get_requirement", {"project": "p1", "uid": "SRS016"}, "Direkt abgeleitet (Kinder): STC004"),
    ("search_requirements", {"project": "Station3", "query": "Divergenz"}, "Bei Divergenz Lauf abbrechen"),
    ("find_similar_requirements", {"project": "Station3", "uid": "SRS016"}, "SRS016"),
    ("suggest_links", {"project": "Station3", "uid": "SRS016"}, "Kandidaten in SYRS"),
    ("analyze_impact", {"project": "Station3", "uid": "SRS016"}, "betrifft 1 Anforderungen in 1 Dokumenten"),
    ("check_requirement_quality", {"project": "Station3", "uid": "SRS016"}, "Note 72"),
    ("reqman_help", {"question": "Excel"}, "Excel importieren"),
])
async def test_tool_returns_readable_text(fake_backend, name, args, expect):
    r = await call(name, args)
    assert not r.is_error
    assert expect in text(r)
    assert "{" not in text(r).split("\n")[0] or name == "get_requirement"  # kein rohes JSON


@pytest.mark.anyio
async def test_overview_works_without_next_steps_endpoint(fake_backend):
    ROUTES_BACKUP = ROUTES.pop(("GET", "/api/projects/p1/next-steps"))
    try:
        r = await call("get_project_overview", {"project": "Station3"})
        assert "Dokumente" in text(r) and "Offene Punkte" not in text(r)
    finally:
        ROUTES[("GET", "/api/projects/p1/next-steps")] = ROUTES_BACKUP


@pytest.mark.anyio
async def test_unknown_project_is_german_tool_error(fake_backend):
    r = await call("get_project_overview", {"project": "gibt-es-nicht"})
    assert r.is_error
    assert "nicht gefunden" in text(r) and "Station3" in text(r)


@pytest.mark.anyio
async def test_backend_down_is_tool_error():
    def down(request):
        raise httpx.ConnectError("refused")
    server.set_client(ReqManClient(base_url="http://localhost:1", user="a", password="b",
                                   transport=httpx.MockTransport(down)))
    try:
        r = await call("list_projects")
    finally:
        server.set_client(None)
    assert r.is_error and "nicht erreichbar" in text(r)


@pytest.mark.anyio
async def test_prompts_exist(fake_backend):
    async with Client(server.mcp) as client:
        names = {p.name for p in (await client.list_prompts()).prompts}
    assert {"einstieg", "review_dokument"} <= names


def test_client_relogin_on_401():
    calls = {"n": 0}

    def h(request):
        if request.url.path == "/api/auth/token":
            return httpx.Response(200, json={"access_token": f"t{calls['n']}"})
        calls["n"] += 1
        return httpx.Response(401 if calls["n"] == 1 else 200, json=[])

    c = ReqManClient(base_url="http://x", user="a", password="b", transport=httpx.MockTransport(h))
    assert c.list_projects() == []
    assert calls["n"] == 2


def test_client_error_carries_backend_detail():
    c = ReqManClient(base_url="http://x", user="a", password="b", transport=httpx.MockTransport(handler))
    with pytest.raises(ReqManError) as e:
        c.get("/api/nix")
    assert e.value.status == 404 and e.value.detail == "nicht gefunden"
