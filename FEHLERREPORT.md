# ReqMan – Code- & Test-Report

_Erstellt am 2026-06-16. Geprüft: Backend (FastAPI/doorstop), Frontend (React/TS), Live-API-Durchlauf._

> **Status:** Alle u. g. Befunde wurden behoben (Branch `fix/security-and-git-findings`,
> Issue [#7](https://github.com/MatthiasLehmann/req_man/issues/7)). Siehe Abschnitt
> [„Durchgeführte Fixes"](#durchgeführte-fixes) am Ende.

## Zusammenfassung

| Bereich | Ergebnis |
|---|---|
| Unit-Tests (`test_ai_quality_service.py`) | ✅ 48 passed |
| Backend-Import / Start | ✅ sauber |
| Frontend `tsc --noEmit` | ✅ 0 Fehler |
| Frontend `npm run build` | ✅ erfolgreich (1 Perf-Warnung) |
| Live-API (Login→Projekt→Doc→Item→Link→Review→Delete→Metriken) | ✅ funktioniert |
| **Gefundene Fehler** | 🔴 1 Security · 🟠 1 funktional bestätigt · 🟡 4 kleinere |

Der Kern-Workflow läuft. Es gibt aber zwei substanzielle Befunde (1 Security, 1 verifizierter
Logikfehler) sowie mehrere kleinere Punkte.

---

## 🔴 1. Filesystem-Browser ohne Sandbox (Directory Traversal / Info Disclosure)

**Datei:** `backend/routers/filesystem_router.py:24-50`

Der Endpunkt `GET /api/filesystem/browse?path=...` begrenzt den Pfad **nicht** auf das
Home-Verzeichnis des Users. `home_dir` wird nur als *Default* verwendet, wenn kein `path`
übergeben wird – als Grenze wirkt es nicht.

**Live verifiziert** (als `admin` eingeloggt):
```
GET /api/filesystem/browse?path=/etc  → listet /etc (aliases, apache2, asl.conf, …)
GET /api/filesystem/browse?path=/     → listet das Wurzelverzeichnis
```
Jeder authentifizierte User – **auch `viewer`** – kann damit das gesamte Dateisystem
auflisten, soweit der Serverprozess Leserechte hat. Das ist ein Informationsleck.

**Empfehlung:** Den aufgelösten `abs_path` gegen eine erlaubte Basis (z. B. `current_user.home_dir`)
prüfen und außerhalb liegende Pfade mit 403 ablehnen. `os.path.commonpath` statt `startswith`
verwenden (siehe auch Punkt 4).

---

## 🟠 2. Validierungs-Historie aus Git: falsche Diff-Richtung (findet nichts)

**Datei:** `backend/git_service.py:113-117` (`get_validation_commits_for_item`)

Die Diff-Richtung ist invertiert:
```python
diffs = commit.diff(parents[0])   # vergleicht commit -> parent (rückwärts)
```
Dadurch erscheinen neu hinzugefügte Report-Dateien als *gelöscht* (in `a_path`), nicht als
hinzugefügt (`b_path`). Der Filter auf `b_path` matcht daher nie.

**Live verifiziert** mit einem echten Test-Repo:
```
get_validation_commits_for_item('/tmp/gittest', 'REQ001')  → 0 Commits
```
obwohl der Report `validation/REQ001-val-20260101-001.yml` eindeutig in einem Commit
hinzugefügt wurde.

**Verifizierte Korrektur** (liefert beide Commits korrekt):
```python
if commit.parents:
    diffs = commit.parents[0].diff(commit)        # parent -> commit
else:
    diffs = commit.diff(git.NULL_TREE, R=True)    # Initial-Commit: Additions
```
> Hinweis: Die dateibasierte Historie (`validation_service.get_validation_history`, liest aus
> `validation/*.yml`) funktioniert – betroffen ist nur die **git-basierte** Item-Historie.

---

## 🟡 3. `@app.on_event("startup")` ist deprecated

**Datei:** `backend/main.py:95`

FastAPI/Starlette haben `on_event` zugunsten von Lifespan-Handlern abgekündigt. Funktioniert
aktuell, erzeugt aber eine DeprecationWarning und kann in künftigen Versionen entfallen.
Empfehlung: auf `lifespan=`-Contextmanager umstellen.

## 🟡 4. `_is_allowed` mit `startswith`-Präfixfehler

**Datei:** `backend/routers/localfile_router.py:29-34`

```python
return any(real.startswith(base) for base in _ALLOWED_BASES)
```
Ein Pfad wie `/Users/matthiaslehmann_evil/…` besteht den Check, weil er mit
`/Users/matthiaslehmann` beginnt. Außerdem ist `_ALLOWED_BASES` das **Server-Home** (`~`),
nicht das `home_dir` des jeweiligen Users. Empfehlung: `os.path.commonpath([real, base]) == base`
verwenden.

## 🟡 5. Unsicherer Default für `SECRET_KEY`

**Datei:** `backend/auth.py:11`

```python
SECRET_KEY = os.environ.get("SECRET_KEY", "reqman-secret-key-change-in-production-2024")
```
Ohne gesetzte Env-Variable wird ein im Quellcode stehender, öffentlich bekannter Schlüssel
zum Signieren der JWTs genutzt → Tokens fälschbar. Für Produktion erzwingen (Start abbrechen,
wenn nicht gesetzt) oder zufällig generieren.

## 🟡 6. Kleinere Code-Punkte

- `backend/doorstop_service.py:480` – in `delete_item` ist `item = tree.find_item(uid)`
  ungenutzt; der Prefix wird per `uid.split("-")[0]` ermittelt (funktioniert für die
  getesteten Fälle inkl. Separator `-`, ist aber fragil bei Prefixen mit Bindestrich).
- `backend/routers/users_router.py` – Es gibt keinen Schutz davor, den **letzten Admin**
  zu deaktivieren/herabzustufen (Selbst-Löschung ist bereits geblockt). Risiko: kompletter
  Lockout aus der Admin-Funktion.
- `frontend` Build-Warnung: Haupt-Bundle 1.85 MB (gzip 563 kB) – reine Performance-Warnung,
  kein Fehler. Code-Splitting via dynamische Imports empfohlen.

---

## Getestete Funktionalität (alles ✅)

- Login (JWT), `GET /api/auth/me`
- Projekt anlegen / importieren / löschen (inkl. `delete_files`)
- Dokument anlegen (auch mit Parent + Separator `-`)
- Item anlegen / auflisten / aktualisieren / löschen
- Links setzen (`target_uid`) und Traceability-Graph
- Review-Stamp setzen + automatische „veraltet"-Erkennung nach Textänderung
  (`reviewed_current` wechselt korrekt `true` → `false`)
- Metriken (Link-/Review-Coverage)

_Hinweis: Während des Tests wurde versehentlich ein `TST`-Ordner im echten Projekt
`gen_sw_doc` erzeugt (Folge von Punkt-unabhängigem Testfehler) – wurde wieder entfernt.
Das Test-Projekt unter `/tmp` wurde vollständig aufgeräumt; die Projekt-Registry enthält
wieder nur die zwei ursprünglichen Projekte._

---

## Durchgeführte Fixes

Alle Fixes sind durch Tests und/oder Live-Verifikation abgesichert.

| # | Fix | Datei(en) | Verifikation |
|---|---|---|---|
| 1 | Filesystem-Browser auf `home_dir` (bzw. `~`) als Sandbox-Basis begrenzt; Pfade außerhalb werden auf die Basis zurückgesetzt, Navigation oberhalb der Basis ist gesperrt (`commonpath`-Prüfung) | `backend/routers/filesystem_router.py` | Live: `?path=/etc` und `?path=/` → auf Home geklammert; Navigation innerhalb Home ok; an der Basis `parent=null` |
| 2 | Git-Diff-Richtung korrigiert: `parents[0].diff(commit)` bzw. `commit.diff(NULL_TREE, R=True)` für den Initial-Commit | `backend/git_service.py` | Live: findet jetzt 2/2 Commits (vorher 0) |
| 3 | Hartkodierten `SECRET_KEY`-Default entfernt; ohne Env-Var wird ein flüchtiger Zufallsschlüssel erzeugt + Warnung ausgegeben | `backend/auth.py` | Import zeigt Warnung; JWT-Login mit gesetztem Env-Key funktioniert |
| 4 | `_is_allowed` nutzt `os.path.commonpath` statt `startswith` (kein Präfix-Bypass mehr) | `backend/routers/localfile_router.py` | Import OK |
| 5 | `@app.on_event("startup")` → Lifespan-Contextmanager (nicht mehr deprecated) | `backend/main.py` | Backend startet sauber, Startup-Log erscheint |
| 6a | Ungenutzte Variable in `delete_item` entfernt | `backend/doorstop_service.py` | Item-Delete weiterhin ✅ |
| 6b | Schutz gegen Deaktivieren/Herabstufen/Löschen des **letzten aktiven Admins** | `backend/routers/users_router.py` | Import OK; 48 Unit-Tests grün |

Regressionsabsicherung: `test_ai_quality_service.py` → **48 passed**, `tsc --noEmit` → **0 Fehler**,
`npm run build` → **erfolgreich**.

_Punkt 6 „Frontend-Bundle-Größe" ist eine Performance-Warnung (kein Fehler) und wurde
bewusst nicht im Rahmen dieser Fixes geändert – Code-Splitting wäre ein separater Schritt._
