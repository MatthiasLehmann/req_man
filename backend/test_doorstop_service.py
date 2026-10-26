"""
Tests für doorstop_service.py

Fokus: Sidecar-Metadateien (<UID>.ai-quality.yml, <UID>.simulink.yml) dürfen nicht
als eigene Anforderungen auftauchen (Issue #17). Projekte löschen darf nur von
ReqMan angelegte Dateien entfernen (Issue #34).

Ausführen:
    cd backend && .venv/bin/pytest test_doorstop_service.py -v
"""
import os
import sys
from pathlib import Path

import doorstop
import pytest

sys.path.insert(0, str(Path(__file__).parent))

import doorstop_service as ds


# ─── _is_sidecar ─────────────────────────────────────────────────────────────


class TestIsSidecar:
    def test_real_uids_are_not_sidecars(self):
        for uid in ["NEED001", "SRS-042", "REQ_1", "scorpos_icd-000001"]:
            assert ds._is_sidecar(uid) is False

    def test_ai_quality_and_simulink_are_sidecars(self):
        assert ds._is_sidecar("NEED001.ai-quality") is True
        assert ds._is_sidecar("NEED001.simulink") is True

    def test_case_insensitive(self):
        assert ds._is_sidecar("srs001.AI-QUALITY") is True
        assert ds._is_sidecar("SRS001.Simulink") is True

    def test_accepts_doorstop_uid_object(self):
        # str()-Fallback muss auch für Nicht-Strings greifen
        assert ds._is_sidecar(doorstop.core.types.UID("NEED001.ai-quality")) is True
        assert ds._is_sidecar(doorstop.core.types.UID("NEED001")) is False


# ─── _real_items gegen echten doorstop-Baum ──────────────────────────────────


class TestRealItemsFiltersSidecars:
    def _build_project(self, root: Path):
        """Legt ein Dokument mit einem echten Item + zwei Sidecar-YAMLs an."""
        tree = doorstop.build(root=str(root))
        doc = tree.create_document(str(root / "NEED"), "NEED")
        item = doc.add_item()
        uid = str(item.uid)
        (root / "NEED" / f"{uid}.ai-quality.yml").write_text(
            f"requirement_uid: {uid}\nscore: 80\n", encoding="utf-8"
        )
        (root / "NEED" / f"{uid}.simulink.yml").write_text(
            f"requirement_uid: {uid}\nlinks: []\n", encoding="utf-8"
        )
        return uid

    def test_doorstop_loads_sidecars_but_real_items_hides_them(self, tmp_path):
        uid = self._build_project(tmp_path)

        # Frischer Baum ohne Cache
        tree = doorstop.build(root=str(tmp_path))
        doc = tree.find_document("NEED")

        # doorstop selbst sieht alle drei Dateien als Items …
        all_uids = sorted(str(i.uid) for i in doc.items)
        assert len(all_uids) == 3
        assert f"{uid}.ai-quality" in all_uids
        assert f"{uid}.simulink" in all_uids

        # … _real_items blendet die Sidecars aus.
        real_uids = [str(i.uid) for i in ds._real_items(doc)]
        assert real_uids == [uid]


# ─── Projekte anlegen und löschen ────────────────────────────────────────────


@pytest.fixture
def registry(tmp_path, monkeypatch):
    """Eigene Projekt-Registry und eigenes Home-Verzeichnis je Test."""
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path / "home"))
    return tmp_path


def _project_with_item(path: Path) -> str:
    """Legt ein Projekt mit Dokument REQ, einem Item, Sidecar und Validierungsbericht an."""
    project = ds.create_project("Test", path=str(path))
    ds.create_document(project["id"], "REQ")
    doc = doorstop.build(root=str(path)).find_document("REQ")
    uid = str(doc.add_item().uid)
    (path / "REQ" / f"{uid}.ai-quality.yml").write_text(f"requirement_uid: {uid}\n", encoding="utf-8")
    (path / "validation").mkdir()
    (path / "validation" / f"{uid}-val-20261026-001.yml").write_text("status: APPROVED\n", encoding="utf-8")
    return project["id"]


class TestDeleteProject:
    def test_keeps_foreign_files(self, registry):
        path = registry / "home" / "Desktop" / "arbeit"
        (path / "Thesis").mkdir(parents=True)
        (path / "Thesis" / "kapitel1.docx").write_text("x", encoding="utf-8")
        (path / "notizen.txt").write_text("x", encoding="utf-8")
        project_id = _project_with_item(path)

        assert ds.delete_project(project_id, delete_files=True)

        assert (path / "Thesis" / "kapitel1.docx").exists()
        assert (path / "notizen.txt").exists()
        assert not (path / "REQ").exists()
        assert not (path / "validation").exists()
        assert ds.get_project(project_id) is None

    def test_removes_pure_project_folder(self, registry):
        path = registry / "projekte" / "demo"
        project_id = _project_with_item(path)

        assert ds.delete_project(project_id, delete_files=True)

        assert not path.exists()

    def test_without_delete_files_touches_nothing(self, registry):
        path = registry / "projekte" / "demo"
        project_id = _project_with_item(path)

        assert ds.delete_project(project_id)

        assert (path / "REQ" / ".doorstop.yml").exists()
        assert ds.get_project(project_id) is None

    def test_delete_document_keeps_foreign_files(self, registry):
        path = registry / "projekte" / "demo"
        project_id = _project_with_item(path)
        (path / "REQ" / "skizze.png").write_bytes(b"png")

        assert ds.delete_document(project_id, "REQ")

        assert (path / "REQ" / "skizze.png").exists()
        assert not (path / "REQ" / ".doorstop.yml").exists()
        assert list((path / "REQ").glob("*.yml")) == []


class TestProtectedProjectPaths:
    @pytest.mark.parametrize("sub", ["", "Desktop", "Documents", "Downloads", "OneDrive"])
    def test_create_rejects_user_folders(self, registry, sub):
        path = registry / "home" / sub
        path.mkdir(parents=True, exist_ok=True)
        with pytest.raises(ValueError):
            ds.create_project("Test", path=str(path))
        assert not (path / ".git").exists()

    def test_create_rejects_drive_root(self, registry):
        with pytest.raises(ValueError):
            ds.create_project("Test", path=os.path.abspath(os.sep))

    def test_create_allows_subfolder_of_desktop(self, registry):
        project = ds.create_project("Test", path=str(registry / "home" / "Desktop" / "reqs"))
        assert ds.get_project(project["id"]) is not None

    def test_import_rejects_user_folder(self, registry):
        path = registry / "home" / "Desktop"
        path.mkdir(parents=True)
        doorstop.build(root=str(path)).create_document(str(path / "REQ"), "REQ")
        with pytest.raises(ValueError):
            ds.import_project(str(path))
