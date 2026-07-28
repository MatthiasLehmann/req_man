"""
Tests für doorstop_service.py

Fokus: Sidecar-Metadateien (<UID>.ai-quality.yml, <UID>.simulink.yml) dürfen nicht
als eigene Anforderungen auftauchen (Issue #17).

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
