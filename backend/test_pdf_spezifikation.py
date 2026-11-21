"""Tests für die PDF-Vorlage „Spezifikation“ (E2): Metadaten, Dokumentenlenkung, Git-Historie, Logo, Glossar, Satz."""

import struct
import zlib

import doorstop
import pytest
import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient
from git import Actor, Repo

import doorstop_service as ds
import pdf_reports as pr
import pdf_spezifikation as spez
import typst_service as ts
from auth import get_current_user
from database import User
from routers import document_types_router, typst_router

needs_typst = pytest.mark.skipif(not ts.typst_available(), reason="Typst nicht installiert")


def _add(doc, text, links=(), header=False, attrs=None):
    item = doc.add_item()
    item.text = text
    if header:
        item.header = text
    for link in links:
        item.link(link)
    for k, v in (attrs or {}).items():
        item.set(k, v)
    item.save()
    return str(item.uid)


def _png(w=4, h=2):
    raw = b"".join(b"\x00" + b"\xff\x00\x00" * w for _ in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


@pytest.fixture
def project(tmp_path, monkeypatch):
    """Projekt mit SYS/SRS und Glossar GLO als Git-Repository (3 Commits, Tag v1.0 auf dem zweiten)."""
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "proj"
    root.mkdir()
    repo = Repo.init(str(root))
    who = Actor("Erika Muster", "erika@example.org")
    tree = doorstop.build(root=str(root))
    sys_doc = tree.create_document(str(root / "SYS"), "SYS")
    srs_doc = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    glo_doc = tree.create_document(str(root / "GLO"), "GLO", parent="SYS")
    u = {"h": _add(sys_doc, "Allgemeines", header=True),
         "s1": _add(sys_doc, "Das System muss bremsen.", attrs={"priority": "hoch", "owner": "Team A"})}
    u["r1"] = _add(srs_doc, "Die Software muss bremsen.", links=[u["s1"]])
    _add(glo_doc, "**ABS**: Antiblockiersystem")
    _add(glo_doc, "Bremsweg – Strecke bis zum Stillstand")
    _add(glo_doc, "Text ohne Trenner", attrs={"begriff": "ESP"})
    repo.git.add(A=True)
    repo.index.commit("SYS und SRS angelegt", author=who, committer=who)
    (root / "SYS" / "notiz.txt").write_text("x", encoding="utf-8")
    repo.git.add(A=True)
    c2 = repo.index.commit("SYS: Notiz #1 mit *Sternchen*", author=who, committer=who)
    repo.create_tag("v1.0", ref=c2)
    (root / "README.md").write_text("nur Projekt", encoding="utf-8")
    repo.git.add(A=True)
    repo.index.commit("README", author=who, committer=who)
    p = ds.import_project(str(root), name="Bremse")
    return p["id"], u, root


def _req(**kw):
    return pr.PdfRequest.model_validate(kw)


# ── Metadaten ────────────────────────────────────────────────────────────────

def test_meta_vorgabe_aus_dokument_und_ueberschreiben():
    control = {"doc_number": "LH-1", "version": "1.0", "status": "pruefung", "confidentiality": "intern",
               "author": "A", "title": "Lastenheft"}
    m = spez.merge_meta(control, pr.PdfMeta(), "Projekt")
    assert (m["doc_number"], m["version"], m["status"], m["confidentiality"]) == ("LH-1", "1.0", "pruefung", "intern")
    assert m["title"] == "Lastenheft" and m["author"] == "A" and m["status_label"] == "Zur Prüfung"
    assert not m["released"]
    m = spez.merge_meta(control, pr.PdfMeta(doc_number="LH-2", version=" ", status="freigegeben"), "Projekt")
    assert m["doc_number"] == "LH-2" and m["version"] == "1.0" and m["released"]


def test_meta_status_regel():
    # Vorgabe „entwurf“ aus dem Dialog überschreibt keinen Status des Dokuments …
    assert spez.merge_meta({"status": "freigegeben"}, pr.PdfMeta(), "P")["status"] == "freigegeben"
    # … „pruefung“/„freigegeben“ aus dem Dialog schon; ohne Angaben gilt Entwurf
    assert spez.merge_meta({"status": "freigegeben"}, pr.PdfMeta(status="pruefung"), "P")["status"] == "pruefung"
    m = spez.merge_meta({}, None, "P")
    assert m["status"] == "entwurf" and m["title"] == "P" and m["doc_number"] == ""
    assert spez.merge_meta({"status": "kaputt"}, None, "P")["status"] == "entwurf"


# ── Dokumentenlenkung speichern ──────────────────────────────────────────────

def test_dokumentenlenkung_rundlauf(project):
    pid, _, root = project
    saved = ds.set_document_control(pid, "SYS", {"doc_number": " LH-7 ", "status": "pruefung", "version": "",
                                                "unbekannt": "x"})
    assert saved == {"doc_number": "LH-7", "status": "pruefung"}
    cfg = yaml.safe_load((root / "SYS" / ".doorstop.yml").read_text(encoding="utf-8"))
    assert cfg["extensions"]["reqman"]["control"] == saved and cfg["settings"]["prefix"] == "SYS"
    ds.set_document_properties(pid, "SYS", {"farbe": "rot"})
    assert ds.read_document_control(str(root / "SYS")) == saved  # Eigenschaften lassen die Lenkung stehen
    assert ds.set_document_control(pid, "SYS", {}) == {}
    cfg = yaml.safe_load((root / "SYS" / ".doorstop.yml").read_text(encoding="utf-8"))
    assert "control" not in cfg["extensions"]["reqman"] and cfg["extensions"]["reqman"]["properties"] == {"farbe": "rot"}


def test_dokumentenlenkung_router(project):
    pid, _, root = project
    app = FastAPI()
    app.include_router(document_types_router.router)
    app.dependency_overrides[get_current_user] = lambda: User(username="x", role="editor", is_active=True)
    c = TestClient(app)
    r = c.put(f"/api/projects/{pid}/documents/SYS/properties",
              json={"values": {}, "control": {"doc_number": "LH-1", "status": "freigegeben", "kind": ""}})
    assert r.status_code == 200 and r.json()["control"] == {"doc_number": "LH-1", "status": "freigegeben"}
    # ohne „control“ bleibt die Lenkung unverändert
    r = c.put(f"/api/projects/{pid}/documents/SYS/properties", json={"values": {"a": "b"}})
    assert r.status_code == 200 and "control" not in r.json()
    assert ds.read_document_control(str(root / "SYS"))["doc_number"] == "LH-1"
    assert c.put(f"/api/projects/{pid}/documents/SYS/properties",
                 json={"control": {"status": "ungültig"}}).status_code == 422
    docs = {d["prefix"]: d for d in ds.list_documents(pid)}
    assert docs["SYS"]["document_control"]["status"] == "freigegeben"


# ── Git-Historie ─────────────────────────────────────────────────────────────

def test_git_historie_nur_dokument(project):
    _, _, root = project
    h = spez.git_history(str(root), [str(root / "SYS")])
    assert h["available"] and not h["truncated"] and not h["dirty"]
    msgs = [e["message"] for e in h["entries"]]
    assert msgs == ["SYS: Notiz \\#1 mit \\*Sternchen\\*", "SYS und SRS angelegt"]  # README-Commit fehlt, maskiert
    assert h["entries"][0]["tags"] == ["v1.0"] and h["entries"][0]["author"] == "Erika Muster"
    assert len(spez.git_history(str(root), [str(root / "SRS")])["entries"]) == 1
    h = spez.git_history(str(root), [str(root / "SYS")], limit=1)
    assert len(h["entries"]) == 1 and h["truncated"]
    (root / "SYS" / "notiz.txt").write_text("geändert", encoding="utf-8")
    assert spez.git_history(str(root), [str(root / "SYS")])["dirty"]
    assert not spez.git_history(str(root), [str(root / "SRS")])["dirty"]


def test_git_historie_ohne_repo(tmp_path):
    assert spez.git_history(str(tmp_path), [str(tmp_path)]) == {
        "available": False, "entries": [], "truncated": False, "dirty": False}


# ── Logo und Glossar ─────────────────────────────────────────────────────────

def test_logo(tmp_path):
    assert spez.find_logo(str(tmp_path)) is None
    (tmp_path / ".reqman").mkdir()
    (tmp_path / ".reqman" / "logo.png").write_bytes(b"kein Bild")
    assert spez.find_logo(str(tmp_path)) is None
    (tmp_path / ".reqman" / "logo.png").write_bytes(_png())
    assert spez.find_logo(str(tmp_path))[1] == "png"
    (tmp_path / ".reqman" / "logo.png").write_bytes(b"\xff\xd8\xff\xe0" + b"0" * 20)
    assert spez.find_logo(str(tmp_path))[1] == "jpg"


@pytest.mark.parametrize("text, term, rest", [
    ("**ABS**: Antiblockiersystem", "ABS", "Antiblockiersystem"),
    ("ESP: Stabilität", "ESP", "Stabilität"),
    ("Bremsweg – Strecke", "Bremsweg", "Strecke"),
    ("<p><strong>CAN</strong>: Bus</p>", "CAN", "Bus"),
    ("Kein Trenner hier", None, "Kein Trenner hier"),
])
def test_begriff_trennen(text, term, rest):
    assert spez.split_term(text) == (term, rest)


def test_glossar_nur_markierte_dokumente(project):
    pid, _, root = project
    assert spez.glossary(str(root)) == {"documents": [], "entries": []}
    ds.set_document_control(pid, "GLO", {"kind": "glossar"})
    g = spez.glossary(str(root))
    assert g["documents"] == ["GLO"]
    assert [e["term"] for e in g["entries"]] == ["ABS", "Bremsweg", "ESP"]
    assert "Antiblockiersystem" in g["entries"][0]["markup"]


# ── Datengerüst ──────────────────────────────────────────────────────────────

def test_datengeruest(project):
    pid, u, root = project
    ds.set_document_control(pid, "SYS", {"title": "Systemlastenheft", "doc_number": "LH-1", "status": "pruefung",
                                         "author": "Erika"})
    req = _req(documents=["SYS"], options={"layout": "tabelle", "attributes": ["priority"],
                                           "meta": {"version": "2.0"}, "appendices": ["trace"]})
    d = spez.build_spec_data(pid, req)
    m = d["meta"]
    plain = {k: str(v).replace("\\", "") for k, v in m.items()}  # Texte sind für Typst maskiert
    assert (plain["title"], plain["doc_number"], plain["version"], m["status"], m["author"]) == \
        ("Systemlastenheft", "LH-1", "2.0", "pruefung", "Erika")
    assert m["doc_number"] == ts.escape_typst("LH-1")
    assert m["project"] == "Bremse" and not m["released"]
    assert d["options"] == {"layout": "tabelle", "appendices": ["trace"], "filtered": False}
    assert d["documents"][0]["title"] == "Systemlastenheft"
    s1 = next(e for e in d["documents"][0]["items"] if e["uid"] == u["s1"])
    assert s1["attributes"] == {"priority": "hoch"}  # nur gewählte Attribute
    assert [c["uid"] for c in s1["children"]] == [u["r1"]]
    assert len(d["history"]["entries"]) == 2 and d["logo"] is None
    assert d["glossary"] == {"documents": [], "entries": []}  # Anhang nicht gewählt


def test_datengeruest_auswahl_und_titel(project):
    pid, u, _ = project
    d = spez.build_spec_data(pid, _req(documents=["SYS", "SRS"], filter={"uids": [u["r1"]]}))
    assert d["meta"]["title"] == "Bremse" and d["options"]["filtered"]
    assert [e["uid"] for doc in d["documents"] for e in doc["items"]] == [u["r1"]]
    d = spez.build_spec_data(pid, _req(documents=["SRS"]))
    assert d["meta"]["title"] == "Bremse – SRS"
    with pytest.raises(KeyError):
        spez.build_spec_data(pid, _req(documents=["NIX"]))


# ── Satz ─────────────────────────────────────────────────────────────────────

def test_renderer_registriert():
    assert pr.RENDERERS["spezifikation"] is spez.render
    assert "review" not in pr.RENDERERS or pr.RENDERERS["review"] is not spez.render


@needs_typst
@pytest.mark.parametrize("layout", ["fliesstext", "tabelle"])
@pytest.mark.parametrize("status", ["entwurf", "freigegeben"])
def test_satz_beide_layouts(project, layout, status):
    pid, _, root = project
    ds.set_document_control(pid, "GLO", {"kind": "glossar"})
    ds.set_document_control(pid, "SYS", {"doc_number": "LH-#1", "confidentiality": "streng_vertraulich *"})
    (root / ".reqman").mkdir()
    (root / ".reqman" / "logo.png").write_bytes(_png())
    pdf, name = pr.render(pid, _req(documents=["SYS", "SRS"], options={
        "layout": layout, "attributes": ["priority", "owner"], "appendices": ["trace", "offen", "glossar"],
        "meta": {"status": status, "version": "1.0 $"}}))
    assert pdf.startswith(b"%PDF") and name == "Bremse_Spezifikation.pdf"


@needs_typst
def test_satz_ohne_git_und_leere_auswahl(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "p"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    doc = tree.create_document(str(root / "A"), "A")
    _add(doc, "Nur Text.")
    pid = ds.import_project(str(root), name="Ohne Git")["id"]
    data = spez.build_spec_data(pid, _req(filter={"uids": ["GIBTESNICHT"]}))
    assert not data["history"]["available"] and data["documents"][0]["items"] == []
    assert spez.render(pid, _req(filter={"uids": ["GIBTESNICHT"]}, options={"appendices": ["glossar"]})).startswith(b"%PDF")


@needs_typst
def test_api_post_spezifikation(project):
    pid, _, _ = project
    app = FastAPI()
    app.include_router(typst_router.router)
    app.dependency_overrides[get_current_user] = lambda: User(username="x", role="viewer", is_active=True)
    r = TestClient(app).post(f"/api/projects/{pid}/export/pdf",
                             json={"template": "spezifikation", "documents": ["SYS"]})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    assert "Bremse_SYS.pdf" in r.headers["content-disposition"]
    r = TestClient(app).post(f"/api/projects/{pid}/export/pdf", json={"documents": ["NIX"]})
    assert r.status_code == 404
