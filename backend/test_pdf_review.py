"""Tests für die Review-Unterlage (E3): Daten, Auswahl, Satz."""
import doorstop
import pytest

import doorstop_service as ds
import pdf_reports as pr
import pdf_review
import typst_service as ts

needs_typst = pytest.mark.skipif(not ts.typst_available(), reason="Typst nicht installiert")


def _add(doc, text, **attrs):
    item = doc.add_item()
    item.text = text
    for k, v in attrs.items():
        item.set(k, v)
    item.save()
    return item


@pytest.fixture
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "proj"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    doc = tree.create_document(str(root / "SYS"), "SYS")
    other = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    a = _add(doc, "Das System muss bremsen & lenken #1 $5.", priority="hoch")
    b = _add(doc, "<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>", priority="niedrig")
    c = _add(doc, "Dritte.", priority="hoch")
    _add(other, "Software.")
    a.review()  # eine Anforderung als geprüft markieren
    p = ds.import_project(str(root), name="Review Test: Ä/Ö")
    return p["id"], [str(i.uid) for i in (a, b, c)]


def req(**kw):
    return pr.PdfRequest.model_validate({"template": "review", **kw})


def test_registriert():
    assert pr.RENDERERS["review"] is pdf_review.render


def test_daten_ohne_filter(project):
    pid, u = project
    d = pdf_review.build_review_data(pid, req(documents=["SYS"]))
    assert [r["uid"] for r in d["rows"]] == u
    assert [r["nr"] for r in d["rows"]] == [1, 2, 3]
    assert d["gesamt"] == 3
    assert {s["status"]: s["anzahl"] for s in d["summary"]} == {"nicht geprüft": 2, "geändert nach Prüfung": 0, "geprüft": 1}
    assert d["meeting"]["title"] == "Review-Unterlage" and d["meeting"]["participants"] == []
    assert d["rows"][1]["gross"] is True and d["rows"][0]["gross"] is False


def test_daten_filter_und_attribute(project):
    pid, u = project
    r = req(documents=["SYS"], filter={"attribute": {"name": "priority", "value": "hoch"}, "status": ["nicht geprüft"]},
            options={"attributes": ["priority"], "meeting": {"title": "Termin", "participants": ["A", " ", "B"]}})
    d = pdf_review.build_review_data(pid, r)
    assert [x["uid"] for x in d["rows"]] == [u[2]]
    assert d["rows"][0]["attributes_markup"] == [{"name": "priority", "markup": "hoch"}]
    assert d["meeting"] == {"title": "Termin", "date": "", "place": "", "participants": ["A", "B"]}
    assert "priority = hoch" in d["auswahl"] and "nicht geprüft" in d["auswahl"]
    # ohne gewählte Attribute werden keine gezeigt, der Filter wirkt trotzdem
    d = pdf_review.build_review_data(pid, req(documents=["SYS"], filter={"attribute": {"name": "priority", "value": "hoch"}}))
    assert len(d["rows"]) == 2 and d["rows"][0]["attributes_markup"] == []


def test_alle_dokumente_und_unbekanntes(project):
    pid, _ = project
    assert pdf_review.build_review_data(pid, req())["gesamt"] == 4
    with pytest.raises(KeyError):
        pdf_review.build_review_data(pid, req(documents=["NOPE"]))
    with pytest.raises(ValueError):
        pdf_review.build_review_data("gibtsnicht", req())


@needs_typst
def test_satz_pdf(project):
    pid, _ = project
    pdf, name = pr.render(pid, req(documents=["SYS"], options={"attributes": ["priority"],
                          "meeting": {"title": "Ä Ö #1", "date": "2026-11-23", "participants": ["Anna"]}}))
    assert pdf.startswith(b"%PDF-") and name.endswith("_Review.pdf")


@needs_typst
def test_satz_leere_auswahl_und_viele_zeilen(project):
    pid, _ = project
    assert pr.render(pid, req(documents=["SYS"], filter={"uids": ["KEINE"]}))[0].startswith(b"%PDF-")
    d = pdf_review.build_review_data(pid, req(documents=["SYS"]))
    d["rows"] = [dict(d["rows"][0], nr=i + 1) for i in range(60)]
    kurz = ts.compile_pdf(pdf_review.build_review_data(pid, req(documents=["SYS"])), "review")
    lang = ts.compile_pdf(d, "review")
    assert lang.startswith(b"%PDF-") and len(lang) > len(kurz)
