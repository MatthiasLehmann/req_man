"""Satzzeit für ein großes Dokument (E1): 500 Anforderungen mit Tabellen, Bildern und Verweisen.

Gibt die gemessenen Zeiten aus (pytest -s) und prüft nur eine großzügige Obergrenze, damit der Test
auf langsamen Rechnern nicht zufällig scheitert.
"""
import struct
import time
import zlib

import doorstop
import pytest

import doorstop_service as ds
import typst_service as ts

ANZAHL = 500
GRENZE_S = 60          # = COMPILE_TIMEOUT_S des Programmaufrufs


def _png(w=60, h=30) -> bytes:
    raw = b"".join(b"\x00" + bytes((30, 90, 200)) * w for _ in range(h))

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


TABELLE = ("<table><tbody><tr><th><p>Größe</p></th><th><p>Wert</p></th><th><p>Einheit</p></th></tr>"
           + "".join(f"<tr><td><p>Messwert {k}</p></td><td><p>{k * 1.5}</p></td><td><p>m/s</p></td></tr>"
                     for k in range(4))
           + "</tbody></table>")


@pytest.fixture
def grosses_projekt(tmp_path, monkeypatch):
    monkeypatch.setattr(ds, "PROJECTS_CONFIG", str(tmp_path / "projects.json"))
    up = tmp_path / "uploads"
    up.mkdir()
    for k in range(5):
        (up / f"bild{k}.png").write_bytes(_png(60 + k, 30))
    monkeypatch.setattr(ts, "UPLOADS_DIR", up)
    root = tmp_path / "proj"
    root.mkdir()
    tree = doorstop.build(root=str(root))
    sys_doc = tree.create_document(str(root / "SYS"), "SYS")
    srs_doc = tree.create_document(str(root / "SRS"), "SRS", parent="SYS")
    sys_uids = []
    for n in range(50):
        it = sys_doc.add_item()
        it.text = f"Das System muss Funktion {n} mit **hoher** Verfügbarkeit bereitstellen."
        it.set("priority", ["hoch", "mittel", "niedrig"][n % 3])
        it.save()
        sys_uids.append(str(it.uid))
    for n in range(ANZAHL - 50):
        it = srs_doc.add_item()
        text = (f"Die Software muss Teilfunktion {n} innerhalb von {n % 90 + 10} ms ausführen, "
                "wenn das Eingangssignal gültig ist und kein Fehler #E-12 anliegt. " * 2)
        if n % 10 == 0:
            text += "\n\n" + TABELLE
        if n % 25 == 0:
            text += f"\n\n![Skizze {n}](/uploads/bild{n // 25 % 5}.png)"
        if n % 40 == 0:
            text += "\n\n- Punkt eins\n- Punkt zwei\n  - Unterpunkt"
        it.text = text
        it.link(sys_uids[n % 50])
        it.set("owner", f"Team {n % 7}")
        it.save()
    p = ds.import_project(str(root), name="Satzzeit 500")
    return p["id"]


@pytest.mark.skipif(not ts.typst_available(), reason="Typst nicht installiert")
def test_satzzeit_500_anforderungen(grosses_projekt):
    t0 = time.perf_counter()
    data = ts.build_data(grosses_projekt)
    t1 = time.perf_counter()
    pdf = ts.compile_pdf(data)
    t2 = time.perf_counter()
    assert data["counts"]["anforderungen"] == ANZAHL
    assert pdf.startswith(b"%PDF")
    print(f"\nSatzzeit {ANZAHL} Anforderungen: Daten {t1 - t0:.2f} s, Satz {t2 - t1:.2f} s, "
          f"PDF {len(pdf) // 1024} KB, Bilder {sum(1 for i in data['images'].values() if i['ok'])}")
    assert t2 - t1 < GRENZE_S
