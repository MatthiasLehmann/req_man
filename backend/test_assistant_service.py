"""Tests für „Frag ReqMan“ (A4): Hilfe-Index, Assistent und Router – ohne Ollama und ohne Sprachmodell."""
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))

import ai_quality_service as aqs
import assistant_service as assistant
import doorstop_service as ds
import embedding_service as emb
import rag_service as rag
from auth import get_current_user
from routers import assistant_router
from test_rag_service import FakeEmbedder, project  # noqa: F401  (Fixture)

ROOT = Path(__file__).resolve().parent.parent


class FixedProvider:
    def __init__(self, response: str):
        self.response = response
        self.calls = []

    def complete(self, system_prompt, user_prompt, model=None):
        self.calls.append((system_prompt, user_prompt))
        return self.response


@pytest.fixture
def fake(monkeypatch, tmp_path):
    f = FakeEmbedder()
    emb.set_embedder(f)
    monkeypatch.setattr(rag, "RAG_ROOT", tmp_path / "rag")
    yield f
    emb.set_embedder(None)


# ─── Wissensdateien ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", ["bedienung.md", "workflow.md"])
def test_knowledge_copies_match_frontend(name):
    backend = (ROOT / "backend" / "knowledge" / name).read_text(encoding="utf-8")
    frontend = (ROOT / "frontend" / "src" / "features" / "help" / name).read_text(encoding="utf-8")
    assert backend == frontend, f"{name}: backend/knowledge und frontend/src/features/help unterscheiden sich"


def test_bedienung_has_20_short_sections_with_route():
    sections = [s for s in rag.help_sections() if s["id"].startswith("bedienung#")]
    assert len(sections) >= 20
    for s in sections:
        assert s["route"].startswith("/"), s["title"]
        assert len(s["text"].split()) <= 150, s["title"]


def test_slugify_like_frontend():
    assert rag.slugify("Was bedeutet OUTDATED bzw. Veraltet?") == "was-bedeutet-outdated-bzw-veraltet"
    assert rag.slugify("Wie füge ich Anforderungen aus Excel ein?") == "wie-fuge-ich-anforderungen-aus-excel-ein"
    assert rag.slugify("3.1 Dokument anlegen") == "31-dokument-anlegen"
    assert rag.slugify("Größe & Maß") == "groe-ma"


# ─── Hilfe-Index ─────────────────────────────────────────────────────────────

def test_sync_help_only_embeds_once(fake):
    first = rag.sync_help()
    assert first["total"] >= 20 and first["embedded"] == first["total"]
    calls = fake.calls
    assert rag.sync_help()["embedded"] == 0
    assert fake.calls == calls


def test_search_help_returns_route_and_anchor(fake):
    hits = rag.search_help("Was bedeutet OUTDATED Veraltet", 3)
    assert hits[0]["id"] == "bedienung#was-bedeutet-outdated-bzw-veraltet"
    assert hits[0]["route"] == "/requirements"
    assert hits[0]["anchor"] == "was-bedeutet-outdated-bzw-veraltet"


# ─── Assistent ───────────────────────────────────────────────────────────────

def test_invented_uid_is_removed(project, fake):  # noqa: F811
    p = project
    answer = json.dumps({"antwort": f"Siehe [{p['srs1']}] und [SRS999] sowie [H1].", "quellen": []})
    out = assistant.ask(p["pid"], "Beschleunigung auf 100 km/h", {}, [], provider=FixedProvider(answer))
    assert "SRS999" not in out["answer"]
    assert out["removed_refs"] == ["SRS999"]
    assert [s["ref"] for s in out["sources"]] == [p["srs1"], "H1"]


def test_help_source_has_route_and_anchor(fake):
    answer = json.dumps({"antwort": "1. Stempeln klicken [H1].", "quellen": ["H1"]})
    out = assistant.ask(None, "Wie setze ich den Review-Stempel?", {}, [], provider=FixedProvider(answer))
    src = out["sources"][0]
    assert src["kind"] == "help" and src["route"] and src["anchor"]


def test_broken_json_gives_raw_text(fake):
    out = assistant.ask(None, "Wie exportiere ich?", {}, [], provider=FixedProvider("Klicke auf Export"))
    assert out["answer"].startswith("Klicke auf Export")
    assert assistant.UNCITED_NOTE in out["answer"]
    assert len(out["sources"]) == 2


def test_without_project_only_help_sources(fake):
    provider = FixedProvider(json.dumps({"antwort": "x", "quellen": []}))
    out = assistant.ask(None, "Wie lege ich ein Dokument an?", {}, [], provider=provider)
    assert all(ref.startswith("H") for ref in out["found"])
    assert "] (Dokument " not in provider.calls[0][1]


def test_refusal_has_no_sources(fake):
    answer = json.dumps({"antwort": assistant.NOTHING_FOUND, "quellen": []})
    out = assistant.ask(None, "Wie wird das Wetter?", {}, [], provider=FixedProvider(answer))
    assert out["sources"] == []


def test_context_item_first_and_history_in_prompt(project, fake):  # noqa: F811
    p = project
    provider = FixedProvider(json.dumps({"antwort": "ok", "quellen": []}))
    history = [{"role": "user", "content": f"Frage {i}"} for i in range(6)]
    out = assistant.ask(p["pid"], "Was hängt daran?", {"uid": p["sys2"]}, history, provider=provider)
    assert out["found"][0] == p["sys2"]
    assert out["found"].count(p["sys2"]) == 1
    user = provider.calls[0][1]
    assert "Frage 5" in user and "Frage 1" not in user
    assert user.rstrip().endswith("Frage: Was hängt daran?")


# ─── Router ──────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(assistant_router.router)
    app.dependency_overrides[get_current_user] = lambda: object()
    return TestClient(app)


def test_router_ask_and_errors(project, fake, client, monkeypatch):  # noqa: F811
    monkeypatch.setattr(aqs, "create_provider", lambda *a, **k: FixedProvider('{"antwort": "ok [H1]"}'))
    r = client.post("/api/assistant/ask", json={"project_id": project["pid"], "question": "Bremsweg"})
    assert r.status_code == 200 and r.json()["sources"][0]["ref"] == "H1"
    assert client.post("/api/assistant/ask", json={"question": ""}).status_code == 422
    assert client.post("/api/assistant/ask", json={"project_id": "nix", "question": "x"}).status_code == 404

    class Down:
        def complete(self, *a, **k):
            raise aqs.AiProviderError("weg")
    monkeypatch.setattr(aqs, "create_provider", lambda *a, **k: Down())
    assert client.post("/api/assistant/ask", json={"question": "x"}).status_code == 502

    def boom(texts):
        raise emb.EmbeddingError("Embedding-Modell nicht erreichbar.")
    emb.set_embedder(boom)
    monkeypatch.setattr(rag, "RAG_ROOT", rag.RAG_ROOT / "leer")
    assert client.post("/api/assistant/ask", json={"question": "x"}).status_code == 503


def test_router_help_search_and_next_steps(project, fake, client):  # noqa: F811
    r = client.get("/api/help/search", params={"q": "Excel einfügen", "k": 2})
    assert r.status_code == 200 and len(r.json()) == 2
    r = client.get(f"/api/projects/{project['pid']}/next-steps")
    assert r.status_code == 200 and any(s["key"] == "unlinked" for s in r.json())
    assert client.get("/api/projects/nix/next-steps").status_code == 404
