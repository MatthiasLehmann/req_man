"""Tests für typst_service und typst_router (B3) – ohne Netz und ohne Ollama."""

import doorstop
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import doorstop_service as ds
import typst_service as ts
from auth import get_current_user
from routers import typst_router

needs_typst = pytest.mark.skipif(not ts.typst_available(), reason="Typst nicht installiert")


def _add(doc, text, links=(), header=False, active=True, derived=False):
    item = doc.add_item()
    item.text = text
    if header:
        item.header = text
    item.active = active
    item.derived = derived
    for link in links:
        item.link(link)
    item.save()
    return str(item.uid)


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "proj"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    sys_doc = tree.create_document(str(root / "SYS"), "SYS")
    srs_doc = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    u = {
        "h": _add(sys_doc, "Allgemeines", header=True),
        "s1": _add(sys_doc, "<p>Das System muss <strong>bremsen</strong> &amp; lenken #1 $5 *x* _y_ @z &lt;a&gt;.</p>"
                            "<ul><li>eins</li><li>zwei</li></ul>"),
        "s2": _add(sys_doc, "Ohne Kind."),
    }
    u["r1"] = _add(srs_doc, "Die Software muss bremsen.", links=[u["s1"]])
    u["r2"] = _add(srs_doc, "Ohne Eltern.")
    u["r3"] = _add(srs_doc, "Alt.", active=False)
    p = ds.import_project(str(root), name="Test Projekt: Ä/Ö")
    return p["id"], u


# ── Maskierung und HTML-Umsetzung ────────────────────────────────────────────

def test_escape_alle_sonderzeichen():
    for ch in "#$*_@<>`~[]{}=-+/%\\":
        assert ts.escape_typst(f"a{ch}b") == f"a\\{ch}b"
    assert ts.escape_typst("Müller äöü 10 ms") == "Müller äöü 10 ms"


def test_html_zu_typst():
    out = ts.html_to_typst("<p>A <b>fett</b> und <em>kursiv</em> #x</p><ol><li>eins</li><li>zwei</li></ol>")
    assert "#strong[fett]" in out and "#emph[kursiv]" in out
    assert "\\#x" in out
    assert "+ eins" in out and "+ zwei" in out


def test_html_klartext_und_bild():
    out = ts.html_to_typst("Zeile 1\n\nZeile 2 ![Skizze](pfad.png)")
    assert "Zeile 1\n\nZeile 2" in out
    assert "Abbildung" in out and "pfad" not in out


def test_label_gueltig():
    assert ts.label_for("SRS-001 x/y") == "u-SRS-001_x_y"


# ── Daten ────────────────────────────────────────────────────────────────────

def test_build_data(project):
    pid, u = project
    d = ts.build_data(pid)
    assert [x["prefix"] for x in d["documents"]] == ["SYS", "SRS"]
    assert d["counts"]["anforderungen"] == 4  # inaktive r3 fehlt
    sys_items = d["documents"][0]["items"]
    assert sys_items[0]["kind"] == "heading"
    r1 = next(e for e in d["documents"][1]["items"] if e["uid"] == u["r1"])
    assert r1["parents"] == [{"uid": u["s1"], "ref": ts.label_for(u["s1"]), "ok": True}]
    trace = {t["parent"]["uid"]: [c["uid"] for c in t["children"]] for t in d["trace"]}
    assert trace[u["s1"]] == [u["r1"]]
    assert trace[u["s2"]] == []            # Elternanforderung ohne Kind sichtbar
    reasons = {o["uid"]: o["reasons"] for o in d["open_points"]}
    assert "kein Verweis" in reasons[u["r2"]]
    assert "nicht geprüft" in reasons[u["r1"]]


def test_build_data_einzelnes_dokument(project):
    pid, u = project
    d = ts.build_data(pid, "SRS")
    assert [x["prefix"] for x in d["documents"]] == ["SRS"]
    assert d["subtitle"] == "Dokument SRS"
    with pytest.raises(KeyError):
        ts.build_data(pid, "XYZ")


# ── PDF ──────────────────────────────────────────────────────────────────────

@needs_typst
def test_pdf_wird_erzeugt(project):
    pid, _ = project
    pdf = ts.build_pdf(pid)
    assert pdf.startswith(b"%PDF")


@needs_typst
def test_pdf_mit_sonderzeichen_im_projektnamen_und_text(project, tmp_path, monkeypatch):
    pid, u = project
    pdf = ts.build_pdf(pid, "SYS")
    assert pdf.startswith(b"%PDF")


# ── Router ───────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(typst_router.router)
    app.dependency_overrides[get_current_user] = lambda: object()
    return TestClient(app)


@needs_typst
def test_router_pdf(project, client):
    pid, _ = project
    r = client.get(f"/api/projects/{pid}/export/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF")
    assert "attachment" in r.headers["content-disposition"]
    r = client.get(f"/api/projects/{pid}/export/pdf", params={"document": "SRS"})
    assert r.status_code == 200 and "SRS.pdf" in r.headers["content-disposition"]


def test_router_unbekannt(project, client):
    pid, _ = project
    assert client.get("/api/projects/gibt-es-nicht/export/pdf").status_code == 404
    if ts.typst_available():
        assert client.get(f"/api/projects/{pid}/export/pdf", params={"document": "XYZ"}).status_code == 404


def test_router_ohne_typst_503(project, client, monkeypatch):
    pid, _ = project
    monkeypatch.setattr(ts, "_typst_module", lambda: None)
    monkeypatch.delenv("TYPST_BIN", raising=False)
    r = client.get(f"/api/projects/{pid}/export/pdf")
    assert r.status_code == 503
    assert "Typst" in r.json()["detail"] and "nicht" in r.json()["detail"]
