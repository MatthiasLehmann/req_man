"""
Tests für rag_service (Wissensindex) – ohne Ollama, mit austauschbarem Einbetter.

Ausführen:
    cd backend && .venv/bin/pytest test_rag_service.py -v
"""
import sys
import zlib
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))

import doorstop_service as ds
import embedding_service as emb
import rag_service as rag
from auth import get_current_user
from routers import rag_router


class FakeEmbedder:
    def __init__(self):
        self.calls = 0
        self.texts = 0

    def __call__(self, texts):
        self.calls += 1
        self.texts += len(texts)
        m = np.zeros((len(texts), 256), dtype=np.float32)
        for i, t in enumerate(texts):
            for w in t.lower().split():
                m[i, zlib.crc32(w.encode()) % 256] += 1
        return m


@pytest.fixture
def fake(monkeypatch):
    f = FakeEmbedder()
    emb.set_embedder(f)
    yield f
    emb.set_embedder(None)


@pytest.fixture
def project(tmp_path, monkeypatch, fake):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    monkeypatch.setattr(rag, "RAG_ROOT", tmp_path / "rag")
    pdir = tmp_path / "proj"
    pid = ds.create_project("Test", path=str(pdir))["id"]
    ds.create_document(pid, "SYS")
    ds.create_document(pid, "SRS", parent="SYS")
    ds.create_document(pid, "SWR", parent="SRS")
    sys1 = ds.create_item(pid, "SYS", {"text": "Das Fahrzeug muss innerhalb von 4 Sekunden auf 100 km/h beschleunigen."})
    sys2 = ds.create_item(pid, "SYS", {"text": "Die Bremsanlage muss das Fahrzeug aus 100 km/h in 40 Metern anhalten."})
    ds.create_item(pid, "SYS", {"text": "Überschrift Komfort", "header": True})
    ds.create_item(pid, "SYS", {"text": "Die Innenraumtemperatur muss regelbar sein und konstant bleiben."})
    srs1 = ds.create_item(pid, "SRS", {"text": "Die Beschleunigung auf 100 km/h muss unter 4 Sekunden liegen.",
                                       "links": [sys1["uid"]]})
    srs2 = ds.create_item(pid, "SRS", {"text": "Der Bremsweg aus 100 km/h darf höchstens 40 Metern betragen."})
    swr1 = ds.create_item(pid, "SWR", {"text": "Die Drehmomentvorgabe wird beim Beschleunigen auf 100 km/h begrenzt.",
                                       "links": [srs1["uid"]]})
    return {"pid": pid, "sys1": sys1["uid"], "sys2": sys2["uid"], "srs1": srs1["uid"], "srs2": srs2["uid"],
            "swr1": swr1["uid"]}


def test_clean_text_removes_html_and_images():
    raw = "<p>Das&nbsp;System <b>muss</b> ![x](a.png) &amp; mehr</p>"
    assert rag.clean_text(raw) == "Das System muss & mehr"


def test_sync_counts_and_skips_headers(project, fake):
    r = rag.sync_project(project["pid"])
    # SYS: 3 echte Items (Überschrift fehlt), SRS: 2, SWR: 1
    assert (r["total"], r["added"], r["updated"], r["removed"]) == (6, 6, 0, 0)
    meta, _ = rag._load(project["pid"])
    assert all("Überschrift" not in e["text"] for e in meta["entries"])


def test_second_sync_does_not_embed_again(project, fake):
    rag.sync_project(project["pid"])
    n = fake.texts
    r = rag.sync_project(project["pid"])
    assert fake.texts == n
    assert (r["added"], r["updated"], r["removed"]) == (0, 0, 0)


def test_changed_text_is_updated(project, fake):
    rag.sync_project(project["pid"])
    ds.update_item(project["pid"], project["srs2"], {"text": "Der Bremsweg darf höchstens 35 Meter betragen."})
    r = rag.sync_project(project["pid"])
    assert (r["added"], r["updated"], r["removed"]) == (0, 1, 0)


def test_deleted_item_is_removed(project, fake):
    rag.sync_project(project["pid"])
    path = Path(ds.get_project(project["pid"])["path"]) / "SWR" / f"{project['swr1']}.yml"
    path.unlink()
    assert rag.sync_project(project["pid"])["removed"] == 1


def test_inactive_items_are_skipped(project, fake):
    ds.update_item(project["pid"], project["srs2"], {"active": False})
    assert rag.sync_project(project["pid"])["total"] == 5


def test_search_uid_first(project, fake):
    hits = rag.search(project["pid"], project["srs2"].lower(), k=3)
    assert hits[0]["uid"] == project["srs2"] and hits[0]["score"] == 1.0
    assert len({h["uid"] for h in hits}) == len(hits)


def test_search_finds_by_words(project, fake):
    hits = rag.search(project["pid"], "Bremsweg Meter", k=2)
    assert hits[0]["uid"] in (project["srs2"], project["sys2"])


def test_search_prefix_filter(project, fake):
    hits = rag.search(project["pid"], "Beschleunigung", k=10, prefixes=["SRS"])
    assert hits and all(h["prefix"] == "SRS" for h in hits)


def test_similar_excludes_itself_and_marks_links(project, fake):
    hits = rag.similar(project["pid"], project["srs1"], k=10)
    assert project["srs1"] not in [h["uid"] for h in hits]
    assert {h["uid"]: h["linked"] for h in hits}[project["sys1"]] is True


def test_similar_unknown_uid(project, fake):
    with pytest.raises(ValueError):
        rag.similar(project["pid"], "SRS999")


def test_suggest_links_only_parent_document_and_unlinked(project, fake):
    r = rag.suggest_links(project["pid"], project["srs1"], k=5)
    assert r["parent_document"] == "SYS"
    uids = [h["uid"] for h in r["suggestions"]]
    assert uids and all(u.startswith("SYS") for u in uids)
    assert project["sys1"] not in uids  # schon verlinkt
    r2 = rag.suggest_links(project["pid"], project["sys1"])
    assert r2 == {"parent_document": None, "suggestions": []}


def test_impact_child_and_grandchild(project, fake):
    r = rag.impact(project["pid"], project["sys1"])
    depth = {x["uid"]: x["depth"] for x in r["downstream"]}
    assert depth == {project["srs1"]: 1, project["swr1"]: 2}
    up = rag.impact(project["pid"], project["swr1"])["upstream"]
    assert {x["uid"]: x["depth"] for x in up} == {project["srs1"]: 1, project["sys1"]: 2}


def test_model_change_discards_index(project, fake, monkeypatch):
    rag.sync_project(project["pid"])
    monkeypatch.setenv("EMBED_MODEL", "anderes-modell")
    r = rag.sync_project(project["pid"])
    assert r["added"] == 6


def test_unknown_project(fake):
    with pytest.raises(ValueError):
        rag.sync_project("gibt-es-nicht")


def test_embedder_normalizes_rows(fake):
    v = emb.embed(["a b c", "d e"])
    assert np.allclose(np.linalg.norm(v, axis=1), 1.0)


# ─── Router ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(rag_router.router)
    app.dependency_overrides[get_current_user] = lambda: object()
    return TestClient(app)


def test_router_search_and_status(project, client):
    r = client.get(f"/api/projects/{project['pid']}/rag/search", params={"q": "Bremsweg", "k": 2})
    assert r.status_code == 200 and len(r.json()) == 2
    assert client.get(f"/api/projects/{project['pid']}/rag/status").json()["total"] == 6


def test_router_similar_text_exclude(project, client):
    r = client.post(f"/api/projects/{project['pid']}/rag/similar-text",
                    json={"text": "Der Bremsweg aus 100 km/h darf höchstens 40 Metern betragen.",
                          "exclude_uid": project["srs2"], "k": 3})
    assert r.status_code == 200
    assert project["srs2"] not in [h["uid"] for h in r.json()]


def test_router_impact_and_404(project, client):
    r = client.get(f"/api/projects/{project['pid']}/items/{project['sys1']}/impact")
    assert r.status_code == 200 and len(r.json()["downstream"]) == 2
    assert client.get(f"/api/projects/{project['pid']}/items/NIX999/impact").status_code == 404
    assert client.get("/api/projects/gibtsnicht/rag/status").status_code == 404


def test_router_embedding_error_is_503(project, client):
    def boom(texts):
        raise emb.EmbeddingError("Embedding-Modell nicht erreichbar.")
    emb.set_embedder(boom)
    r = client.get(f"/api/projects/{project['pid']}/rag/search", params={"q": "x"})
    assert r.status_code == 503
    assert "nicht erreichbar" in r.json()["detail"]
