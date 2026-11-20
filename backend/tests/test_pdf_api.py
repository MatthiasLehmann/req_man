"""Tests für PDF-Dialog-API (E4): pdf_reports, pdf_settings_service, typst_router – ohne Typst-Lauf."""
import sys
from pathlib import Path

import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import doorstop_service as ds  # noqa: E402
import pdf_reports as pr  # noqa: E402
import pdf_settings_service as pss  # noqa: E402
import typst_service as ts  # noqa: E402
from auth import get_current_user  # noqa: E402
from database import User  # noqa: E402
from routers import typst_router  # noqa: E402


@pytest.fixture
def env(tmp_path, monkeypatch):
    proj = {"id": "p1", "name": "Station 3 Simulation", "path": str(tmp_path)}
    monkeypatch.setattr(ds, "get_project", lambda pid: proj if pid == "p1" else None)
    monkeypatch.setattr(ts, "typst_available", lambda: True)
    monkeypatch.setattr(pr, "RENDERERS", {})
    calls = []
    monkeypatch.setattr(ts, "build_pdf", lambda pid, doc=None: calls.append(("fallback", pid, doc)) or b"%PDF-fallback")
    return tmp_path, calls


def make_client(role="editor"):
    app = FastAPI()
    app.include_router(typst_router.router)
    app.dependency_overrides[get_current_user] = lambda: User(username="x", role=role, is_active=True)
    return TestClient(app)


# ─── Modell ──────────────────────────────────────────────────────────────────

def test_request_defaults_and_validation():
    r = pr.PdfRequest()
    assert r.template == "spezifikation" and r.documents == [] and r.save_defaults is False
    assert r.options.layout == "fliesstext" and r.options.meta.status == "entwurf"
    with pytest.raises(Exception):
        pr.PdfRequest(template="unbekannt")
    with pytest.raises(Exception):
        pr.PdfRequest.model_validate({"filter": {"status": ["kaputt"]}})


# ─── render ──────────────────────────────────────────────────────────────────

def test_render_fallback_uses_first_document(env):
    _, calls = env
    pdf, name = pr.render("p1", pr.PdfRequest(documents=["SYRS", "SRS"]))
    assert pdf == b"%PDF-fallback" and calls == [("fallback", "p1", "SYRS")]
    assert name == "Station_3_Simulation_Spezifikation.pdf"


def test_render_single_document_in_filename(env):
    _, _ = env
    assert pr.render("p1", pr.PdfRequest(documents=["SYRS"]))[1] == "Station_3_Simulation_SYRS.pdf"


def test_render_fallback_without_document(env):
    _, calls = env
    pr.render("p1", pr.PdfRequest())
    assert calls == [("fallback", "p1", None)]


def test_render_uses_registered_renderer(env):
    _, calls = env
    seen = []
    pr.RENDERERS["review"] = lambda pid, req: seen.append((pid, req.options.meeting.title)) or b"%PDF-review"
    pdf, name = pr.render("p1", pr.PdfRequest(template="review", options={"meeting": {"title": "Sprint"}}))
    assert pdf == b"%PDF-review" and seen == [("p1", "Sprint")] and not calls
    assert name.endswith("_Review.pdf")


def test_render_unknown_project(env):
    with pytest.raises(ValueError):
        pr.render("nix", pr.PdfRequest())


# ─── Einstellungen ───────────────────────────────────────────────────────────

def test_settings_roundtrip_without_uids(env):
    path, _ = env
    req = pr.PdfRequest(template="review", documents=["SYRS"], filter={"uids": ["A-1"], "status": ["geprüft"]},
                        options={"meeting": {"title": "Review 1", "participants": ["Anna", "Ben"]}}, save_defaults=True)
    saved = pss.save(str(path), req)
    assert saved.filter.uids == [] and saved.filter.status == ["geprüft"]
    raw = yaml.safe_load((path / ".reqman" / "pdf.yml").read_text(encoding="utf-8"))
    assert "uids" not in raw["filter"] and "save_defaults" not in raw
    assert raw["options"]["meeting"]["participants"] == ["Anna", "Ben"]
    assert pss.load(str(path)).options.meeting.title == "Review 1"


def test_settings_missing_or_broken_file_gives_defaults(env):
    path, _ = env
    assert pss.load(str(path)) == pr.PdfRequest()
    (path / ".reqman").mkdir()
    (path / ".reqman" / "pdf.yml").write_text("template: [kaputt", encoding="utf-8")
    assert pss.load(str(path)) == pr.PdfRequest()
    (path / ".reqman" / "pdf.yml").write_text("template: nope\n", encoding="utf-8")
    assert pss.load(str(path)) == pr.PdfRequest()


# ─── Router ──────────────────────────────────────────────────────────────────

def test_post_returns_pdf(env):
    r = make_client().post("/api/projects/p1/export/pdf", json={"documents": ["SYRS"]})
    assert r.status_code == 200 and r.content == b"%PDF-fallback"
    assert r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"] and ".pdf" in r.headers["content-disposition"]


def test_post_empty_body_is_allowed(env):
    assert make_client().post("/api/projects/p1/export/pdf", json={}).status_code == 200


def test_post_invalid_template_is_422(env):
    assert make_client().post("/api/projects/p1/export/pdf", json={"template": "x"}).status_code == 422


def test_post_save_defaults_writes_file(env):
    path, _ = env
    r = make_client().post("/api/projects/p1/export/pdf",
                           json={"template": "review", "filter": {"uids": ["A"]}, "save_defaults": True})
    assert r.status_code == 200
    assert pss.load(str(path)).template == "review"
    assert "uids" not in (path / ".reqman" / "pdf.yml").read_text(encoding="utf-8")


def test_post_without_save_defaults_writes_nothing(env):
    path, _ = env
    make_client().post("/api/projects/p1/export/pdf", json={})
    assert not (path / ".reqman").exists()


def test_viewer_cannot_save_defaults_but_can_render(env):
    path, _ = env
    c = make_client("viewer")
    assert c.post("/api/projects/p1/export/pdf", json={"save_defaults": True}).status_code == 403
    assert c.post("/api/projects/p1/export/pdf", json={}).status_code == 200
    assert c.put("/api/projects/p1/pdf-settings", json={}).status_code == 403
    assert not (path / ".reqman").exists()


def test_post_errors(env, monkeypatch):
    c = make_client()
    assert c.post("/api/projects/nix/export/pdf", json={}).status_code == 404
    monkeypatch.setattr(ts, "typst_available", lambda: False)
    r = c.post("/api/projects/p1/export/pdf", json={})
    assert r.status_code == 503 and "Typst" in r.json()["detail"]
    monkeypatch.setattr(ts, "typst_available", lambda: True)

    def boom(pid, doc=None):
        raise KeyError(doc)
    monkeypatch.setattr(ts, "build_pdf", boom)
    assert c.post("/api/projects/p1/export/pdf", json={"documents": ["XX"]}).status_code == 404

    def fail(pid, doc=None):
        raise ts.TypstFailed("kaputt")
    monkeypatch.setattr(ts, "build_pdf", fail)
    r = c.post("/api/projects/p1/export/pdf", json={})
    assert r.status_code == 500 and "kaputt" in r.json()["detail"]


def test_get_still_works(env):
    r = make_client().get("/api/projects/p1/export/pdf?document=SYRS")
    assert r.status_code == 200 and r.content == b"%PDF-fallback"


def test_settings_endpoints(env):
    c = make_client()
    assert c.get("/api/projects/p1/pdf-settings").json()["template"] == "spezifikation"
    body = {"template": "review", "documents": ["SYRS"], "options": {"layout": "tabelle", "attributes": ["priority"]}}
    r = c.put("/api/projects/p1/pdf-settings", json=body)
    assert r.status_code == 200 and r.json()["options"]["layout"] == "tabelle"
    again = c.get("/api/projects/p1/pdf-settings").json()
    assert again["documents"] == ["SYRS"] and again["options"]["attributes"] == ["priority"]
    assert c.get("/api/projects/nix/pdf-settings").status_code == 404
    assert c.put("/api/projects/nix/pdf-settings", json={}).status_code == 404
