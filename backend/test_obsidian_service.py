"""
Tests für obsidian_service (B1) – ohne Ollama, ohne Wissensindex.

Ausführen:
    cd backend && .venv/Scripts/python -m pytest test_obsidian_service.py -v
"""
import json
import sys
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parent))

import doorstop_service as ds
import obsidian_service as obs
import proposals_service as ps
import rag_service as rag
from auth import get_current_user
from database import Base, User, get_db
from routers import obsidian_router


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    monkeypatch.setattr(rag, "RAG_ROOT", tmp_path / "rag")
    monkeypatch.setenv("OBSIDIAN_EXPORT_ROOT", str(tmp_path / "obsidian"))
    pid = ds.create_project("Test: Projekt", path=str(tmp_path / "proj"))["id"]
    ds.create_document(pid, "SYS")
    ds.create_document(pid, "SRS", parent="SYS")
    ds.create_document(pid, "SWR", parent="SRS")
    sys1 = ds.create_item(pid, "SYS", {"text": "<p>Das Fahrzeug muss <strong>schnell</strong> beschleunigen.</p>"})
    ds.create_item(pid, "SRS", {"text": "Abschnitt Antrieb", "header": True})
    srs1 = ds.create_item(pid, "SRS", {"text": "Die Beschleunigung beträgt 4 Sekunden.", "links": [sys1["uid"]]})
    srs2 = ds.create_item(pid, "SRS", {"text": "Der Bremsweg beträgt 40 Meter."})   # ohne Link nach oben
    swr1 = ds.create_item(pid, "SWR", {"text": "Das Drehmoment wird begrenzt.", "links": [srs1["uid"]]})
    return {"pid": pid, "dir": tmp_path / "obsidian" / "Test_ Projekt", "sys1": sys1["uid"],
            "srs1": srs1["uid"], "srs2": srs2["uid"], "swr1": swr1["uid"], "tmp": tmp_path}


def note(project, prefix, uid):
    return project["dir"] / prefix / f"{uid}.md"


def front(path):
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n")
    return yaml.safe_load(text.split("---\n")[1]), text


def test_note_has_frontmatter_and_wikilinks(project):
    r = obs.export_project(project["pid"])
    assert r["requirements"] == 4 and r["sections"] == 1 and r["documents"] == 3
    fm, text = front(note(project, "SRS", project["srs1"]))
    assert fm["uid"] == project["srs1"] and fm["dokument"] == "SRS" and fm["typ"] == "anforderung"
    assert fm["eltern"] == [f"[[{project['sys1']}]]"] and fm["kinder_anzahl"] == 1
    assert fm["review"] == "fehlt" and fm["ohne_link_oben"] is False and fm["offene_vorschlaege"] == 0
    assert "ki_note" not in fm
    assert len(fm["reqman_hash"]) == 64
    assert f"- [[{project['sys1']}]] – " in text and f"[[{project['swr1']}]]" in text
    assert "## Verlinkt nach oben" in text and "## Abgeleitet" in text
    assert "## Ähnlich" not in text   # kein Wissensindex -> kein Abschnitt, aber Export läuft
    _, sys_text = front(note(project, "SYS", project["sys1"]))
    assert "**schnell**" in sys_text and "<p>" not in sys_text


def test_unlinked_flag_and_section_note(project):
    obs.export_project(project["pid"])
    assert front(note(project, "SRS", project["srs2"]))[0]["ohne_link_oben"] is True
    assert front(note(project, "SYS", project["sys1"]))[0]["ohne_link_oben"] is False  # Wurzeldokument
    sections = list((project["dir"] / "SRS").glob("_Abschnitt *.md"))
    assert len(sections) == 1 and front(sections[0])[0]["typ"] == "abschnitt"


def test_start_base_and_canvas(project):
    obs.export_project(project["pid"])
    start = (project["dir"] / "Start.md").read_text(encoding="utf-8")
    assert "```mermaid" in start and "SYS --> SRS" in start and "SRS --> SWR" in start
    assert "## Nächste Schritte" in start and "Uebersicht.base" in start
    base = yaml.safe_load((project["dir"] / "Uebersicht.base").read_text(encoding="utf-8"))
    names = [v["name"] for v in base["views"]]
    assert {"Alle", "Ohne Link nach oben", "Seit Review geändert", "Unter Mindestnote",
            "Offene Vorschläge", "Karten SYS", "Karten SRS", "Karten SWR"} <= set(names)
    assert all(v["type"] in ("table", "cards") for v in base["views"])
    canvas = json.loads((project["dir"] / "Traceability.canvas").read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in canvas["nodes"]}
    assert sum(1 for n in nodes.values() if n["type"] == "group") == 3
    files = [n for n in nodes.values() if n["type"] == "file"]
    assert len(files) == 4 and all((project["dir"] / n["file"]).exists() for n in files)
    assert len(canvas["edges"]) == 2    # SRS->SYS, SWR->SRS
    for e in canvas["edges"]:
        assert e["fromNode"] in nodes and e["toNode"] in nodes
    assert nodes[f"n-{project['srs2']}"]["color"] == "1"   # ohne Link: farbig
    assert "color" not in nodes[f"n-{project['srs1']}"]


def test_second_export_writes_nothing(project):
    first = obs.export_project(project["pid"])
    assert first["written"] > 0
    second = obs.export_project(project["pid"])
    assert (second["written"], second["removed"]) == (0, 0) and second["unchanged"] == first["written"]


def test_changed_text_writes_only_affected_notes(project):
    obs.export_project(project["pid"])
    ds.update_item(project["pid"], project["srs1"], {"text": "Die Beschleunigung beträgt 5 Sekunden."})
    r = obs.export_project(project["pid"])
    assert "5 Sekunden" in note(project, "SRS", project["srs1"]).read_text(encoding="utf-8")
    # SRS1 selbst und SWR1 (zeigt den Text in „Verlinkt nach oben“); SYS1 zeigt ihn ebenfalls in „Abgeleitet“
    assert 1 <= r["written"] <= 3
    assert r["unchanged"] >= 5


def test_deactivated_requirement_removes_note(project):
    obs.export_project(project["pid"])
    ds.update_item(project["pid"], project["srs2"], {"active": False})   # verschwindet aus dem Export
    r = obs.export_project(project["pid"])
    assert r["removed"] >= 1 and not note(project, "SRS", project["srs2"]).exists()


def test_foreign_files_untouched(project):
    obs.export_project(project["pid"])
    own = project["dir"] / "Meine Notiz.md"
    own.write_text("Privat", encoding="utf-8")
    cfg = project["dir"] / ".obsidian"
    cfg.mkdir()
    (cfg / "app.json").write_text("{}", encoding="utf-8")
    foreign = project["dir"] / "SRS" / "Eigene.md"
    foreign.write_text("Auch privat", encoding="utf-8")
    ds.update_item(project["pid"], project["srs2"], {"active": False})   # verschwindet aus dem Export
    obs.export_project(project["pid"])
    assert own.read_text(encoding="utf-8") == "Privat" and (cfg / "app.json").exists()
    assert foreign.read_text(encoding="utf-8") == "Auch privat"
    manifest = json.loads((project["dir"] / ".reqman-export.json").read_text(encoding="utf-8"))
    assert "Meine Notiz.md" not in manifest["files"] and "SRS/Eigene.md" not in manifest["files"]


def test_edit_in_obsidian_not_overwritten_when_reqman_unchanged(project):
    obs.export_project(project["pid"])
    p = note(project, "SRS", project["srs1"])
    p.write_text(p.read_text(encoding="utf-8") + "\nMeine Ergänzung\n", encoding="utf-8")
    r = obs.export_project(project["pid"])
    assert r["kept_edited"] == 1 and "Meine Ergänzung" in p.read_text(encoding="utf-8")


def test_open_proposals_counted(project, tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    db = sessionmaker(bind=engine)()
    ps.create(db, project["pid"], "change_text", "agent", "Präzisere Zahl nötig für Test",
              uid=project["srs1"], new_text="Die Beschleunigung beträgt 3 Sekunden.")
    obs.export_project(project["pid"], db)
    assert front(note(project, "SRS", project["srs1"]))[0]["offene_vorschlaege"] == 1
    db.close()


def test_large_project_gets_one_canvas_per_document_pair(project, monkeypatch):
    monkeypatch.setattr(obs, "CANVAS_MAX_NODES", 2)
    r = obs.export_project(project["pid"])
    assert not (project["dir"] / "Traceability.canvas").exists()
    assert r["canvases"] == ["Traceability_SRS_SWR.canvas", "Traceability_SYS_SRS.canvas"]
    c = json.loads((project["dir"] / "Traceability_SYS_SRS.canvas").read_text(encoding="utf-8"))
    assert len(c["edges"]) == 1


def test_router_export_and_status(project):
    engine = create_engine(f"sqlite:///{project['tmp'] / 'r.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    app = FastAPI()
    app.include_router(obsidian_router.router)

    def _db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: User(username="u", role="viewer", is_active=True)
    c = TestClient(app)
    base = f"/api/projects/{project['pid']}/obsidian"
    assert c.get(f"{base}/status").json()["exported"] is False
    r = c.post(f"{base}/export", headers={"Origin": "http://localhost:5173"})
    assert r.status_code == 200
    body = r.json()
    assert body["written"] > 0 and body["open_url"].startswith("obsidian://open?path=")
    fm, _ = front(note(project, "SRS", project["srs1"]))
    assert fm["reqman_url"].startswith("http://localhost:5173/requirements/")
    st = c.get(f"{base}/status", headers={"Origin": "http://localhost:5173"}).json()
    assert st["exported"] is True and st["pending_changes"] == 0
    assert c.post("/api/projects/gibtsnicht/obsidian/export").status_code == 404
