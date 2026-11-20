"""Tests für typst_service und typst_router (B3, E1) – ohne Netz und ohne Ollama."""

import base64
import struct
import zlib

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


# ══ E1: Satzgrundlage ═════════════════════════════════════════════════════════

def _png(w=4, h=3, rgb=(200, 30, 30)) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>'
# Tabelle so, wie der TipTap-Editor sie speichert (Raw-HTML im Markdown, <p> in Zellen, colgroup)
TIPTAP_TABLE = (
    '<table style="min-width: 75px;">\n<colgroup><col style="min-width: 25px;"><col></colgroup><tbody>'
    '<tr><th colspan="1" rowspan="1"><p>Größe</p></th><th colspan="1" rowspan="1"><p>Wert</p></th></tr>'
    '<tr><td colspan="1" rowspan="1"><p>Masse</p></td><td colspan="1" rowspan="1"><p>5 kg</p></td></tr>'
    '<tr><td colspan="2" rowspan="1"><p><strong>Summe</strong> &lt; 10 #x</p></td></tr></tbody>\n</table>'
)


# ── Maskierung ───────────────────────────────────────────────────────────────

def test_escape_aufzaehlung_am_zeilenanfang():
    assert ts.escape_typst("1. Punkt") == "1\\. Punkt"
    assert ts.escape_typst("Wert 3.5") == "Wert 3\\.5"
    assert ts.escape_typst("Ende.") == "Ende."


def test_markdown_inline_und_bloecke():
    out = ts.html_to_typst("# Titel\n\nDas **muss** _kursiv_ `code_x` ~~alt~~ snake_case_name [Link](https://a.de).\n\n"
                           "- eins\n  - tief\n- zwei\n\n1. erster\n2. zweiter\n\n> Zitat")
    assert "#strong[Titel]" in out
    assert "#strong[muss]" in out and "#emph[kursiv]" in out and "#strike[alt]" in out
    assert '#raw("code_x")' in out
    assert "snake\\_case\\_name" in out                 # kein Kursiv mitten im Wort
    assert '#link("https://a.de")[Link]' in out
    assert "- eins" in out and "  - tief" in out and "+ erster" in out
    assert "#quote(block: true)[" in out


def test_markdown_spitze_klammern_bleiben_text():
    out = ts.html_to_typst("Wenn a<b und x > 3 dann")
    assert "a\\<b" in out and "x \\> 3" in out and "#strong" not in out


def test_markup_kompiliert_mit_allen_sonderzeichen(tmp_path):
    """Alles, was escape_typst/html_to_typst liefern, muss Typst ohne Fehler setzen."""
    if not ts.typst_available():
        pytest.skip("Typst nicht installiert")
    text = ("1. Start #1 $5 *x* _y_ @z <a> `b` ~c [d] {e} =f -g +h /i %j \\k\n\n"
            "- Liste mit 2. Punkt\n\n| a | b |\n|---|---|\n| [x] | #y |\n\n" + TIPTAP_TABLE)
    data = {"images": {}, "markup": ts.html_to_typst(text, ts.ImageSet())}
    assert _compile_markup(tmp_path, data).startswith(b"%PDF")


def _compile_markup(tmp_path, data):
    """Kleine Vorlage nur für den Test (liegt nicht in templates/)."""
    import json
    import shutil
    import typst
    shutil.copy(ts.TEMPLATES_DIR / "gemeinsam.typ", tmp_path / "gemeinsam.typ")
    (tmp_path / "data.json").write_text(json.dumps(data), encoding="utf-8")
    (tmp_path / "t.typ").write_text('#import "gemeinsam.typ": *\n#let d = json("data.json")\n'
                                    '#markup(d.markup, images: d.images)', encoding="utf-8")
    return typst.compile(str(tmp_path / "t.typ"), root=str(tmp_path), font_paths=[str(ts.FONTS_DIR)])


# ── Tabellen ─────────────────────────────────────────────────────────────────

def test_tiptap_tabelle_wird_typst_tabelle():
    out = ts.html_to_typst("Text davor\n\n" + TIPTAP_TABLE)
    assert out.startswith("Text davor")
    assert "#tabelle(2, table.header(" in out
    assert "#strong[Größe]" in out and "[Masse], [5 kg]" in out
    assert "table.cell(colspan: 2)[#strong[Summe] \\< 10 \\#x]" in out
    assert "|" not in out


def test_markdown_pipe_tabelle():
    out = ts.html_to_typst("| A | B |\n|:--|--:|\n| 1 | **2** |\n| 3 |  |")
    assert out.startswith("#tabelle(2, table.header(")
    assert "[1], [#strong[2]], [3], []" in out


def test_altes_html_tabelle_ohne_kopf():
    out = ts.html_to_typst("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>")
    assert out == "#tabelle(2, [a], [b], [c], [d])"


# ── Bilder ───────────────────────────────────────────────────────────────────

@pytest.fixture
def uploads(tmp_path, monkeypatch):
    d = tmp_path / "uploads"
    d.mkdir()
    (d / "ok.png").write_bytes(_png())
    (d / "bild.svg").write_bytes(SVG)
    (d / "kaputt.svg").write_bytes(b"<svg><g></svg>")
    (d / "text.png").write_bytes(b"kein Bild")
    (d / "falsch_endung.jpg").write_bytes(_png())       # Inhalt zählt, nicht die Endung
    monkeypatch.setattr(ts, "UPLOADS_DIR", d)
    return d


def test_bilder_aufloesen(uploads, tmp_path):
    imgs = ts.ImageSet([str(tmp_path)])
    ok = imgs.add("/uploads/ok.png", "Skizze")
    svg = imgs.add("http://localhost:5173/uploads/bild.svg")
    jpg = imgs.add("/uploads/falsch_endung.jpg")
    assert imgs.entries[ok] == {"file": f"/img/{ok}.png", "alt": "Skizze", "ok": True, "hint": None,
                                "source": "ok.png"}
    assert imgs.entries[svg]["file"].endswith(".svg")
    assert imgs.entries[jpg]["file"].endswith(".png")
    assert imgs.add("/uploads/ok.png") == ok                      # gleiche Quelle → gleiche ID
    files = imgs.extra_files()
    assert files[f"img/{ok}.png"] == {"path": str(uploads / "ok.png")}


@pytest.mark.parametrize("src,hint", [
    ("/uploads/fehlt.png", "nicht gefunden"),
    ("/uploads/text.png", "kein unterstütztes Bildformat"),
    ("/uploads/kaputt.svg", "SVG-Datei fehlerhaft"),
    ("https://example.com/a.png", "aus dem Netz"),
    ("data:image/png;base64,###", "kein unterstütztes"),
    ("", "ohne Quelle"),
    ("../../geheim.png", "nicht gefunden"),
])
def test_bilder_fehlerfaelle_geben_hinweis(uploads, tmp_path, src, hint):
    imgs = ts.ImageSet([str(tmp_path)])
    e = imgs.entries[imgs.add(src)]
    assert e["ok"] is False and e["file"] is None
    assert hint in e["hint"]
    assert imgs.extra_files() == {}


def test_bild_data_uri_und_lokale_datei(tmp_path):
    imgs = ts.ImageSet()
    b64 = base64.b64encode(_png()).decode()
    did = imgs.add(f"data:image/png;base64,{b64}")
    assert imgs.entries[did]["ok"] and imgs.extra_files()[f"img/{did}.png"] == {"b64": b64}
    # data-local-path relativ zum Item-Ordner (so speichert doorstop_service lokale Bilder)
    sub = tmp_path / "SYS"
    sub.mkdir()
    (tmp_path / "bilder").mkdir()
    (tmp_path / "bilder" / "x.png").write_bytes(_png())
    lid = imgs.add("/api/localfile?path=..%5Cbilder%5Cx.png&h=1", "", "../bilder/x.png", str(sub))
    assert imgs.entries[lid]["ok"], imgs.entries[lid]
    # keine Bilddatei → nicht erlaubt (gleiche Regel wie /api/localfile)
    (tmp_path / "geheim.txt").write_text("x")
    nid = imgs.add("", "", str(tmp_path / "geheim.txt"), None)
    assert "nicht erlaubt" in imgs.entries[nid]["hint"]


def test_html_bild_wird_bildaufruf(uploads):
    imgs = ts.ImageSet()
    used = []
    out = ts.html_to_typst("Vorher ![Skizze A](/uploads/ok.png) nachher", imgs, None, used)
    assert '#bild("b1")' in out and used == ["b1"]
    out = ts.html_to_typst('<p>x <img src="/uploads/fehlt.png" alt="weg"></p>', imgs, None, used)
    assert '#bild("b2")' in out and imgs.entries["b2"]["ok"] is False


# ── Datengerüst ──────────────────────────────────────────────────────────────

@pytest.fixture
def projekt_e1(tmp_path, monkeypatch, uploads):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "proj"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    sys_doc = tree.create_document(str(root / "SYS"), "SYS")
    srs_doc = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    u = {}
    u["h"] = _add(sys_doc, "Kapitel Bremsen", header=True)
    u["s1"] = _add(sys_doc, "Text mit Bild ![Skizze](/uploads/ok.png) und SVG ![](/uploads/bild.svg)\n\n" + TIPTAP_TABLE)
    u["s2"] = _add(sys_doc, "Fehlendes Bild ![Alt](/uploads/fehlt.png)")
    u["r1"] = _add(srs_doc, "Kind von s1.", links=[u["s1"]])
    u["r2"] = _add(srs_doc, "Auch Kind von s1.", links=[u["s1"]])
    for key, attrs in (("s1", {"priority": "hoch", "owner": "Anna", "tags": ["a", "b"]}),
                       ("s2", {"priority": "niedrig", "leer": ""})):
        item = sys_doc.find_item(u[key])
        for k, v in attrs.items():
            item.set(k, v)
        item.save()
    p = ds.import_project(str(root), name="E1 Projekt")
    return p["id"], u


def test_build_data_attribute_kinder_bilder(projekt_e1):
    pid, u = projekt_e1
    d = ts.build_data(pid)
    s1 = next(e for e in d["documents"][0]["items"] if e["uid"] == u["s1"])
    assert s1["attributes"] == {"priority": "hoch", "owner": "Anna", "tags": "a, b"}
    assert [c["uid"] for c in s1["children"]] == sorted([u["r1"], u["r2"]])
    assert all(c["ok"] for c in s1["children"])
    assert len(s1["images"]) == 2 and all(d["images"][i]["ok"] for i in s1["images"])
    assert "#tabelle(2" in s1["markup"]
    s2 = next(e for e in d["documents"][0]["items"] if e["uid"] == u["s2"])
    assert s2["attributes"] == {"priority": "niedrig"}                    # leere Werte fallen weg
    assert d["images"][s2["images"][0]]["hint"] == "Datei nicht gefunden"
    assert d["attribute_names"] == ["owner", "priority", "tags"]
    assert set(d["_files"]) == {d["images"][i]["file"].lstrip("/") for i in s1["images"]}
    heading = d["documents"][0]["items"][0]
    assert heading["kind"] == "heading" and heading["level"] == "1"


def test_build_data_auswahl(projekt_e1):
    pid, u = projekt_e1
    d = ts.build_data(pid, attributes=["priority", "gibt-es-nicht"])
    s1 = next(e for e in d["documents"][0]["items"] if e["uid"] == u["s1"])
    assert s1["attributes"] == {"priority": "hoch"}
    assert d["attribute_names"] == ["priority"]
    d = ts.build_data(pid, attributes=[])
    assert all(e.get("attributes", {}) == {} for e in d["documents"][0]["items"])
    # documents hat Vorrang vor document
    d = ts.build_data(pid, "SYS", documents=["SRS"])
    assert [x["prefix"] for x in d["documents"]] == ["SRS"] and d["subtitle"] == "Dokument SRS"
    d = ts.build_data(pid, documents=["SYS", "SRS"])
    assert [x["prefix"] for x in d["documents"]] == ["SYS", "SRS"] and d["subtitle"] == "Lastenheft"
    with pytest.raises(KeyError):
        ts.build_data(pid, documents=["SYS", "XYZ"])
    # nur ausgewählte UIDs; Überschrift bleibt, weil darunter etwas gezeigt wird
    d = ts.build_data(pid, documents=["SYS"], uids=[u["s2"]])
    assert [e["uid"] for e in d["documents"][0]["items"]] == [u["h"], u["s2"]]
    assert d["counts"]["anforderungen"] == 1
    assert [t["parent"]["uid"] for t in d["trace"]] == [u["s2"]]
    d = ts.build_data(pid, documents=["SRS"], uids=[u["r1"]])
    r1 = d["documents"][0]["items"][0]
    assert r1["parents"] == [{"uid": u["s1"], "ref": ts.label_for(u["s1"]), "ok": False}]


# ── Satz ─────────────────────────────────────────────────────────────────────

@needs_typst
def test_pdf_mit_bildern_tabellen_und_schrift(projekt_e1):
    pid, _ = projekt_e1
    pdf = ts.build_pdf(pid)
    assert pdf.startswith(b"%PDF")
    assert b"LiberationSans" in pdf                     # mitgelieferte Schrift eingebettet
    assert pdf.count(b"/Subtype /Image") + pdf.count(b"/Subtype/Image") >= 1


@needs_typst
def test_kaputtes_bild_bricht_satz_nicht_ab(projekt_e1, uploads):
    """Magische Bytes stimmen, Inhalt nicht → Typst scheitert → Bild wird durch Hinweis ersetzt."""
    (uploads / "ok.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"kaputt" * 10)
    pid, _ = projekt_e1
    assert ts.build_pdf(pid).startswith(b"%PDF")


@needs_typst
def test_compile_pdf_vorlage_und_zusatzdateien(projekt_e1):
    pid, _ = projekt_e1
    d = ts.build_data(pid, "SYS")
    assert ts.compile_pdf(d, template="lastenheft", extra_files={"logo.png": _png()}).startswith(b"%PDF")
    with pytest.raises(ValueError):
        ts.compile_pdf(d, template="gibt-es-nicht")
    with pytest.raises(ValueError):
        ts.compile_pdf(d, template="../lastenheft")
    with pytest.raises(ValueError):
        ts.compile_pdf(d, extra_files={"../raus.png": b"x"})


def test_vorlagen_und_schrift_vorhanden():
    assert (ts.TEMPLATES_DIR / "gemeinsam.typ").is_file()
    assert '#import "gemeinsam.typ"' in (ts.TEMPLATES_DIR / "lastenheft.typ").read_text(encoding="utf-8")
    fonts = sorted(p.name for p in ts.FONTS_DIR.glob("*.ttf"))
    assert fonts == ["LiberationSans-Bold.ttf", "LiberationSans-BoldItalic.ttf",
                     "LiberationSans-Italic.ttf", "LiberationSans-Regular.ttf"]
    assert "Open Font License" in (ts.FONTS_DIR / "LICENSE-LiberationSans.txt").read_text(encoding="utf-8")
    assert "DejaVu" not in (ts.TEMPLATES_DIR / "lastenheft.typ").read_text(encoding="utf-8")
