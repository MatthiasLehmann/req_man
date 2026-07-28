# Sidecar-Metadateien (ai-quality, simulink)

## Was sind Sidecar-Dateien?

Zusätzliche Metadaten zu einer Anforderung werden **nicht** in der doorstop-Item-YAML
gespeichert, sondern in separaten „Sidecar"-Dateien direkt daneben:

```
NEED/
  NEED001.yml                  # Anforderung (doorstop-Standard, unverändert)
  NEED001.ai-quality.yml       # KI-Qualitätsbewertung (von req_man verwaltet)
  NEED001.simulink.yml         # Simulink-/MATLAB-Traceability-Links
```

Dadurch bleibt die eigentliche Anforderungsdatei doorstop-kompatibel, während req_man
zusätzliche Informationen portabel und versionierbar neben der Anforderung ablegt.

| Suffix | Erzeugt von | Inhalt |
|--------|-------------|--------|
| `.ai-quality.yml` | `ai_quality_service.py` | Score, Issues, Profil, Zeitstempel der KI-Prüfung |
| `.simulink.yml`   | `simulink_service.py`  | Verlinkte Simulink-Blöcke / MATLAB-Zeilen |

## Das Problem (Issue #17)

doorstop durchsucht den Dokumentordner **rekursiv** (`os.walk`, `doorstop/core/document.py`)
und akzeptiert jede Datei als Item, deren Dateiname-Stamm die UID-Prüfung besteht
(`doorstop/core/item.py`). Diese Prüfung ist sehr permissiv — `NEED001.ai-quality`
besteht sie. Ergebnis: Die Sidecars wurden von doorstop als **eigene Anforderungen**
geladen und tauchten in Liste, Baum, Zählungen, Metriken und Traceability auf
(z. B. ein Phantom-Item `NEED001.ai-quality`).

> **Warum ein Unterordner nicht hilft:** `os.walk` steigt rekursiv in Unterordner ab.
> Nur ein Unterordner mit eigener `.doorstop.yml` wird übersprungen — dann wird er aber
> selbst zu einem eingebetteten doorstop-Dokument. Umbenennen hilft ebenfalls nicht,
> weil die UID-Prüfung nahezu jeden Namen akzeptiert. Details siehe Issue #17.

## Umgesetzte Lösung (App-seitiges Filtern)

Zentrale Helfer in `backend/doorstop_service.py`:

```python
SIDECAR_SUFFIXES = (".ai-quality", ".simulink")

def _is_sidecar(uid) -> bool:
    """True, wenn die UID zu einer Sidecar-Metadatei gehört (kein echtes Item)."""
    return str(uid).lower().endswith(SIDECAR_SUFFIXES)

def _real_items(doc) -> List:
    """doc.items ohne Sidecar-Metadateien (echte Anforderungen)."""
    return [item for item in doc.items if not _is_sidecar(item.uid)]
```

`_real_items()` / `_is_sidecar()` werden an **allen** Stellen angewandt, die
`doc.items` konsumieren:

- `list_items()` — Anforderungsliste im Editor
- `_document_to_dict()` → `item_count` — Zählungen/Badges
- `get_item()` — Guard: eine Sidecar-UID liefert `None`
- `get_traceability()` — Knoten **und** Links
- `get_metrics()` — Coverage/Statistik

`simulink_service.py` (Coverage + Import-`known_uids`) nutzt `ds.list_items()` und wird
dadurch automatisch mitgefiltert. `ai_quality_service.py` iteriert nicht über Items
(arbeitet pro-UID) und braucht keine Anpassung.

### Neue Suffixe hinzufügen

Kommt eine weitere Sidecar-Art hinzu, genügt es, das Suffix zu `SIDECAR_SUFFIXES`
hinzuzufügen — die Filterung an allen Konsumenten greift dann automatisch. Wichtig:
Jede neue Stelle, die `doc.items` direkt iteriert, muss ebenfalls `_real_items()`
verwenden.

### Tests

`backend/test_doorstop_service.py` verifiziert `_is_sidecar` (inkl. case-insensitive
und doorstop-`UID`-Objekt) sowie `_real_items` gegen einen echten doorstop-Baum, der
bestätigt, dass doorstop die Sidecars lädt und der Filter sie entfernt.

## Bekannte Einschränkung / offener Punkt

Dies ist die nicht-invasive Variante: Die doorstop-internen Sidecar-„Items" existieren
weiterhin, werden aber nirgends in der Ausgabe angezeigt. Der Filter muss an jeder
`doc.items`-Konsumstelle diszipliniert angewandt werden — wird eine Stelle vergessen,
kann ein Sidecar dort wieder auftauchen.

Als robustere Ausbaustufe ist geplant, die Sidecars **physisch aus dem Dokumentordner
heraus** in ein projektweites `.meta/`-Verzeichnis zu verlagern (mit Migration
bestehender Dateien). Dann sieht doorstop sie gar nicht erst, und die App-seitige
Filterung entfällt. Siehe das zugehörige Folge-Issue.
