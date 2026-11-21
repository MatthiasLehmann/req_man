"""
Tests für den Vorschlags-Eingang (A6) – ohne Ollama.

Ausführen:
    cd backend && .venv/bin/pytest test_proposals.py -v
"""
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).parent))

import doorstop_service as ds
import next_steps_service
import proposals_service as svc
from auth import get_current_user
from database import Base, User, get_db
from routers import proposals_router


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 't.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    pid = ds.create_project("Test", path=str(tmp_path / "proj"))["id"]
    ds.create_document(pid, "SYS")
    ds.create_document(pid, "SRS", parent="SYS")
    sys1 = ds.create_item(pid, "SYS", {"text": "Das Fahrzeug muss schnell beschleunigen."})["uid"]
    srs1 = ds.create_item(pid, "SRS", {"text": "Die Beschleunigung beträgt 4 Sekunden."})["uid"]
    return {"pid": pid, "sys1": sys1, "srs1": srs1}


def make_client(db_session, role="editor"):
    app = FastAPI()
    app.include_router(proposals_router.router)

    def _db():
        s = db_session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = lambda: User(username=f"u_{role}", role=role, is_active=True)
    return TestClient(app)


def base(project):
    return f"/api/projects/{project['pid']}/proposals"


def post_change(c, project, new="Die Beschleunigung beträgt höchstens 4 Sekunden.", reason="Grenzwert eindeutig machen"):
    return c.post(base(project), json={"kind": "change_text", "uid": project["srs1"], "new_text": new, "reason": reason})


def test_create_and_accept_changes_item(db_session, project):
    c = make_client(db_session)
    r = post_change(c, project)
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "open" and body["old_text"] == "Die Beschleunigung beträgt 4 Sekunden."
    assert ds.get_item(project["pid"], project["srs1"])["text"].startswith("Die Beschleunigung beträgt 4")  # unverändert
    a = c.post(f"{base(project)}/{body['id']}/accept")
    assert a.status_code == 200 and a.json()["status"] == "accepted" and a.json()["decided_by"] == "u_editor"
    assert ds.get_item(project["pid"], project["srs1"])["text"] == "Die Beschleunigung beträgt höchstens 4 Sekunden."


def test_reject_changes_nothing(db_session, project):
    c = make_client(db_session)
    pid = post_change(c, project).json()["id"]
    r = c.post(f"{base(project)}/{pid}/reject")
    assert r.json()["status"] == "rejected"
    assert ds.get_item(project["pid"], project["srs1"])["text"] == "Die Beschleunigung beträgt 4 Sekunden."
    assert c.post(f"{base(project)}/{pid}/accept").status_code == 409  # nicht mehr offen


def test_stale_proposal_returns_409_and_marks_stale(db_session, project):
    c = make_client(db_session)
    pid = post_change(c, project).json()["id"]
    ds.update_item(project["pid"], project["srs1"], {"text": "Von Hand geändert."})
    r = c.post(f"{base(project)}/{pid}/accept")
    assert r.status_code == 409 and "inzwischen geändert" in r.json()["detail"]
    assert c.get(base(project), params={"status": "stale"}).json()[0]["id"] == pid
    assert ds.get_item(project["pid"], project["srs1"])["text"] == "Von Hand geändert."


def test_viewer_may_create_but_not_decide(db_session, project):
    editor = make_client(db_session, "editor")
    viewer = make_client(db_session, "viewer")
    pid = post_change(viewer, project).json()["id"]
    assert viewer.post(f"{base(project)}/{pid}/accept").status_code == 403
    assert viewer.post(f"{base(project)}/{pid}/reject").status_code == 403
    assert editor.post(f"{base(project)}/{pid}/accept").status_code == 200


def test_duplicate_open_proposal_not_created_twice(db_session, project):
    c = make_client(db_session)
    a = post_change(c, project).json()["id"]
    b = post_change(c, project).json()["id"]
    assert a == b
    assert c.get(f"{base(project)}/count").json() == {"open": 1}


def test_new_item_and_add_link(db_session, project):
    c = make_client(db_session)
    n = c.post(base(project), json={"kind": "new_item", "prefix": "SRS", "text": "Die Software protokolliert Fehler.",
                                    "links": [project["sys1"]], "reason": "Fehlende Anforderung zur Protokollierung"}).json()
    c.post(f"{base(project)}/{n['id']}/accept")
    texts = [i["text"] for i in ds.list_items(project["pid"], "SRS")]
    assert "Die Software protokolliert Fehler." in texts
    l = c.post(base(project), json={"kind": "add_link", "uid": project["srs1"], "target_uid": project["sys1"],
                                    "reason": "Verlinkung fehlt noch"}).json()
    c.post(f"{base(project)}/{l['id']}/accept")
    assert project["sys1"] in ds.get_item(project["pid"], project["srs1"])["links"]


@pytest.mark.parametrize("body,code", [
    ({"kind": "change_text", "uid": "SRS999", "new_text": "x y z", "reason": "ausreichend lange Begründung"}, 404),
    ({"kind": "change_text", "uid": "SRS001", "new_text": "x", "reason": "zu kurz"}, 422),
    ({"kind": "unbekannt", "reason": "ausreichend lange Begründung"}, 400),
    ({"kind": "new_item", "prefix": "NIX", "text": "Text hier", "reason": "ausreichend lange Begründung"}, 404),
    ({"kind": "add_link", "uid": "SRS001", "target_uid": "SYS999", "reason": "ausreichend lange Begründung"}, 404),
])
def test_validation_errors(db_session, project, body, code):
    assert make_client(db_session).post(base(project), json=body).status_code == code


def test_next_steps_rule_lists_open_proposals(db_session, project, monkeypatch):
    c = make_client(db_session)
    post_change(c, project)
    monkeypatch.setattr("database.SessionLocal", db_session)
    entry = svc.next_step_rule(project["pid"])
    assert entry["key"] == "open_proposals" and entry["count"] == 1 and entry["route"].endswith(project["pid"])
    assert svc.next_step_rule("anderes") is None
    monkeypatch.setattr(next_steps_service, "EXTRA_RULES", [svc.next_step_rule])
    assert next_steps_service.next_steps(project["pid"])[0]["key"] == "open_proposals"
