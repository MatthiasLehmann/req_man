"""Tests für pdf_filter (E3): jedes Filterfeld, Kombination, Git-Datum/Commit."""
import os
import subprocess

import pytest

import pdf_filter as pf
from pdf_reports import PdfAttributeFilter, PdfFilter

ITEMS = [
    {"kind": "heading", "uid": "H1"},
    {"kind": "req", "uid": "A1", "status": "nicht geprüft", "attributes": {"priority": "hoch", "tags": "x, y"}},
    {"kind": "req", "uid": "A2", "status": "geprüft", "attributes": {"priority": "niedrig"}},
    {"kind": "req", "uid": "A3", "status": "geändert nach Prüfung", "attributes": {}},
    {"kind": "req", "uid": "A4", "status": "geprüft", "attributes": {"Priority": "Hoch"}},
]


def uids(res):
    return [i["uid"] for i in res]


def test_leerer_filter_gibt_alle_anforderungen_ohne_ueberschriften():
    assert uids(pf.select(ITEMS, PdfFilter())) == ["A1", "A2", "A3", "A4"]
    assert uids(pf.select(ITEMS, None)) == ["A1", "A2", "A3", "A4"]
    assert not pf.is_active(PdfFilter())


def test_uids():
    assert uids(pf.select(ITEMS, PdfFilter(uids=["A3", "A1", "X"]))) == ["A1", "A3"]
    assert pf.is_active(PdfFilter(uids=["A1"]))


def test_status_einzeln_und_mehrere():
    assert uids(pf.select(ITEMS, PdfFilter(status=["nicht geprüft"]))) == ["A1"]
    assert uids(pf.select(ITEMS, PdfFilter(status=["nicht geprüft", "geändert nach Prüfung"]))) == ["A1", "A3"]


def test_attribut_textvergleich():
    f = PdfFilter(attribute=PdfAttributeFilter(name="priority", value="hoch"))
    assert uids(pf.select(ITEMS, f)) == ["A1", "A4"]  # ohne Beachtung von Groß-/Kleinschreibung
    f = PdfFilter(attribute=PdfAttributeFilter(name="tags", value="y"))
    assert uids(pf.select(ITEMS, f)) == ["A1"]  # Listenelement
    f = PdfFilter(attribute=PdfAttributeFilter(name="priority", value=""))
    assert uids(pf.select(ITEMS, f)) == ["A1", "A2", "A4"]  # nur „gesetzt“
    f = PdfFilter(attribute=PdfAttributeFilter(name="gibtsnicht", value="x"))
    assert pf.select(ITEMS, f) == []
    assert not pf.is_active(PdfFilter(attribute=PdfAttributeFilter(name="", value="x")))


def test_kombination_ist_und():
    f = PdfFilter(status=["geprüft"], attribute=PdfAttributeFilter(name="priority", value="hoch"), uids=["A1", "A4"])
    assert uids(pf.select(ITEMS, f)) == ["A4"]


def test_dict_als_filter():
    assert uids(pf.select(ITEMS, {"status": ["geprüft"], "attribute": {"name": "priority", "value": "niedrig"}})) == ["A2"]


def test_datum_parsen():
    assert pf.parse_date("2026-11-01").day == 1
    assert pf.parse_date("1.11.2026").month == 11
    assert pf.parse_date("2026-13-40") is None
    assert pf.parse_date("abc") is None


# ── Git ──────────────────────────────────────────────────────────────────────

def _git(cwd, *args, date=None):
    env = dict(os.environ, GIT_AUTHOR_NAME="t", GIT_AUTHOR_EMAIL="t@t", GIT_COMMITTER_NAME="t", GIT_COMMITTER_EMAIL="t@t")
    if date:
        env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = date
    return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout.strip()


@pytest.fixture
def repo(tmp_path):
    p = tmp_path / "r"
    (p / "DOC").mkdir(parents=True)
    _git(p, "init", "-q")
    (p / "DOC" / "A1.yml").write_text("text: a\n")
    (p / "DOC" / "A2.yml").write_text("text: b\n")
    _git(p, "add", "-A")
    _git(p, "commit", "-qm", "alt", date="2026-01-10T12:00:00")
    c1 = _git(p, "rev-parse", "HEAD")
    (p / "DOC" / "A2.yml").write_text("text: b2\n")
    (p / "DOC" / "A2.ai-quality.yml").write_text("x: 1\n")  # Nebendatei zählt nicht als eigene UID
    (p / "DOC" / "A3.yml").write_text("text: c\n")
    _git(p, "add", "-A")
    _git(p, "commit", "-qm", "neu", date="2026-03-05T12:00:00")
    return p, c1


def test_changed_since_datum(repo):
    p, _ = repo
    assert pf.changed_uids(str(p), "2026-03-01") == {"A2", "A3"}
    assert pf.changed_uids(str(p), "05.03.2026") == {"A2", "A3"}
    assert pf.changed_uids(str(p), "2026-01-01") == {"A1", "A2", "A3"}
    assert pf.changed_uids(str(p), "2026-12-01") == set()


def test_changed_since_commit_ohne_den_commit_selbst(repo):
    p, c1 = repo
    assert pf.changed_uids(str(p), c1) == {"A2", "A3"}
    assert pf.changed_uids(str(p), c1[:8]) == {"A2", "A3"}


def test_changed_since_uncommittete_aenderung(repo):
    p, _ = repo
    (p / "DOC" / "A1.yml").write_text("text: geaendert\n")
    assert pf.changed_uids(str(p), "2026-12-01") == {"A1"}


def test_changed_since_in_select(repo):
    p, _ = repo
    items = [{"kind": "req", "uid": u, "status": "geprüft", "attributes": {}} for u in ("A1", "A2", "A3")]
    assert uids(pf.select(items, PdfFilter(changed_since="2026-03-01"), str(p))) == ["A2", "A3"]
    assert uids(pf.select(items, PdfFilter(changed_since="2026-03-01", uids=["A3"]), str(p))) == ["A3"]


def test_changed_since_fehler(repo, tmp_path):
    p, _ = repo
    with pytest.raises(ValueError):
        pf.changed_uids(str(p), "gestern")
    with pytest.raises(ValueError):
        pf.changed_uids(str(p), "deadbeef")
    with pytest.raises(ValueError):
        pf.changed_uids(str(tmp_path / "kein_repo"), "2026-01-01")
    with pytest.raises(ValueError):
        pf.select([], PdfFilter(changed_since="2026-01-01"), None)
