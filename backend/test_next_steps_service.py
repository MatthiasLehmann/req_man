"""Tests für next_steps_service (A4, Teil 2) – ohne Sprachmodell und ohne Ollama."""

from pathlib import Path

import doorstop
import pytest
import yaml

import doorstop_service as ds
import next_steps_service as ns


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
    """SYS (3 Items, 1 Überschrift) ← SRS (4 Items, 1 Link, 1 inaktiv, 1 abgeleitet) + leeres TST."""
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "proj"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    sys_doc = tree.create_document(str(root / "SYS"), "SYS")
    srs_doc = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    tree.create_document(str(root / "TST"), "TST", parent="SRS")

    uids = {
        "sys_h": _add(sys_doc, "Allgemeines", header=True),
        "sys1": _add(sys_doc, "Das System muss bremsen können."),
        "sys2": _add(sys_doc, "Das System muss lenken können."),
    }
    uids["srs1"] = _add(srs_doc, "Die Software muss die Bremse ansteuern.", links=[uids["sys1"]])
    uids["srs2"] = _add(srs_doc, "Die Software muss die Lenkung ansteuern.")
    uids["srs3"] = _add(srs_doc, "Alte Anforderung.", active=False)
    uids["srs4"] = _add(srs_doc, "Interne Pufferung.", derived=True)

    # srs1 stempeln und danach ändern → changed_after_review
    tree = doorstop.build(root=str(root))
    item = tree.find_item(uids["srs1"])
    item.review()
    item.text = "Die Software muss die Bremse innerhalb von 10 ms ansteuern."
    item.save()
    # sys1 stempeln, unverändert → reviewed

    tree.find_item(uids["sys1"]).review()

    p = ds.import_project(str(root), name="Test")
    return p["id"], root, uids


def _by_key(steps):
    return {s["key"]: s for s in steps}


def test_unbekanntes_projekt(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    with pytest.raises(ValueError):
        ns.next_steps("gibtsnicht")


def test_regeln_und_reihenfolge(project):
    pid, _, uids = project
    steps = ns.next_steps(pid)
    keys = [s["key"] for s in steps]
    assert keys == ["empty_documents", "unlinked", "uncovered", "changed_after_review",
                    "never_reviewed", "not_checked"]
    s = _by_key(steps)
    assert s["empty_documents"]["uids"] == ["TST"]
    assert s["empty_documents"]["title"] == "1 Dokument ist noch leer"
    # srs2 ohne Link; srs3 inaktiv und srs4 abgeleitet zählen nicht
    assert s["unlinked"]["uids"] == [uids["srs2"]]
    assert s["unlinked"]["route"] == f"/linking/{pid}"
    # sys2 hat kein Kind; Überschrift zählt nicht. SRS hat Kind-Dokument TST → srs1, srs2, srs4 auch
    assert uids["sys2"] in s["uncovered"]["uids"]
    assert uids["sys1"] not in s["uncovered"]["uids"]
    assert uids["sys_h"] not in s["uncovered"]["uids"]
    assert s["changed_after_review"]["uids"] == [uids["srs1"]]
    assert uids["sys1"] not in s["never_reviewed"]["uids"]
    assert uids["srs1"] not in s["never_reviewed"]["uids"]
    assert uids["srs3"] not in s["never_reviewed"]["uids"]
    assert s["not_checked"]["count"] == 5  # sys1, sys2, srs1, srs2, srs4


def test_ki_ergebnis_unter_mindestnote(project):
    pid, root, uids = project
    for uid, passed in ((uids["sys1"], False), (uids["sys2"], True)):
        (root / "SYS" / f"{uid}.ai-quality.yml").write_text(yaml.safe_dump({
            "requirement_uid": uid, "timestamp": "2026-11-13T10:00:00",
            "profile_used": "standard", "model_used": "test",
            "score": {"overall": 50 if not passed else 90, "min_score": 70, "passed": passed},
            "issues": [], "summary": "",
        }), encoding="utf-8")
    s = _by_key(ns.next_steps(pid))
    assert s["below_min_score"]["uids"] == [uids["sys1"]]
    assert uids["sys1"] not in s["not_checked"]["uids"]
    assert uids["sys2"] not in s["not_checked"]["uids"]


def test_projekt_ohne_dokumente(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    root = tmp_path / "leer"
    root.mkdir()
    p = ds.create_project("Leer", path=str(root))
    steps = ns.next_steps(p["id"])
    assert [s["key"] for s in steps] == ["no_documents"]
    assert steps[0]["route"] == f"/document-structure/{p['id']}"


def test_uids_auf_zehn_begrenzt(project):
    pid, root, _ = project
    tree = doorstop.build(root=str(root))
    srs = tree.find_document("SRS")
    for i in range(12):
        _add(srs, f"Weitere Anforderung Nummer {i}.")
    s = _by_key(ns.next_steps(pid))
    assert s["unlinked"]["count"] == 13
    assert len(s["unlinked"]["uids"]) == 10


def test_zusatzregel_steht_vorne_und_fehler_stoert_nicht(project, monkeypatch):
    pid, _, _ = project

    def kaputt(_pid):
        raise RuntimeError("x")

    def vorschlaege(_pid):
        return {"key": "open_proposals", "title": "3 Vorschläge", "count": 3,
                "explanation": "", "route": "/proposals", "uids": []}

    monkeypatch.setattr(ns, "EXTRA_RULES", [kaputt, vorschlaege])
    steps = ns.next_steps(pid)
    assert steps[0]["key"] == "open_proposals"
