# Git-Validierungsintegration – Konzept 2: Validierungsreport als dedizierte Datei im Commit

## Inhaltsverzeichnis

1. [Motivation](#1-motivation)
2. [Grundprinzip](#2-grundprinzip)
3. [Dateistruktur](#3-dateistruktur)
4. [Validierungsreport – Schema & Format](#4-validierungsreport--schema--format)
5. [Commit-Konventionen](#5-commit-konventionen)
6. [Vollständiger Validierungs-Workflow](#6-vollständiger-validierungs-workflow)
7. [Git-Abfragen & Audit-Trail](#7-git-abfragen--audit-trail)
8. [Implementierungsplan Backend](#8-implementierungsplan-backend)
9. [Implementierungsplan Frontend](#9-implementierungsplan-frontend)
10. [Git Hooks](#10-git-hooks)
11. [Zusammenhang mit doorstop](#11-zusammenhang-mit-doorstop)
12. [Offene Entscheidungen](#12-offene-entscheidungen)

---

## 1. Motivation

Anforderungen in req_man werden mit [doorstop](https://github.com/doorstop-dev/doorstop) als YAML-Dateien in Git gespeichert.
Bisher wird die **Validierung** (Prüfung, ob eine Anforderung vollständig, testbar und abgedeckt ist) nur
im Tool selbst dokumentiert – nicht in Git. Das führt zu zwei Problemen:

- **Kein Audit-Trail**: Wer hat wann welche Anforderung validiert? Mit welchem Ergebnis?
- **Keine Unveränderlichkeit**: Validierungsergebnisse können ohne Spur überschrieben werden.

### Ziele

| Ziel | Umsetzung |
|---|---|
| Eindeutige Zuordnung Commit ↔ Anforderungs-ID | Strukturierter Commit-Message-Prefix + Report-Dateiname |
| Unveränderlicher Validierungsnachweis | Validierungsreport als separate YAML-Datei im Commit |
| Vollständige Checkliste je Validierung | Definiertes Schema mit Pflichtfeldern |
| Maschinenlesbarkeit für Reports/Dashboards | YAML-Format, query-bar über `git log` |
| Kompatibilität mit doorstop | Fingerprint-Integration, `doorstop check` als Pre-Commit-Hook |

---

## 2. Grundprinzip

Ein Validierungs-Commit enthält **immer zwei Dateien**:

1. Die geänderte oder bestätigte **Anforderungs-YAML** (doorstop-Format, z. B. `SYS/SYS-042.yml`)
2. Einen neuen **Validierungsreport** (z. B. `validation/SYS-042-val-20260307-001.yml`)

Der doorstop-Fingerprint (SHA256-Hash über den Anforderungsinhalt) wird im Report gespeichert.
Ändert sich die Anforderung danach, ist der Fingerprint im Report nicht mehr aktuell → die Validierung
gilt als veraltet und muss wiederholt werden.

```
projects/my-project/
├── SYS/
│   ├── .doorstop.yml          ← doorstop-Dokumentkonfiguration
│   └── SYS-042.yml            ← Anforderung (doorstop)
├── SWR/
│   └── SWR-007.yml
└── validation/
    ├── SYS-042-val-20260307-001.yml   ← Validierungsreport (neu)
    └── SYS-001-val-20260101-001.yml   ← älterer Report (Beispiel)
```

---

## 3. Dateistruktur

### Namenskonvention Validierungsreport

```
<DOC>-<ID>-val-<DATUM>-<LAUFNUMMER>.yml
```

| Bestandteil | Beschreibung | Beispiel |
|---|---|---|
| `<DOC>` | Dokumentpräfix (doorstop) | `SYS` |
| `<ID>` | Vollständige Anforderungs-ID | `SYS-042` |
| `val` | Kennzeichner (Literal) | `val` |
| `<DATUM>` | ISO 8601, kompakt | `20260307` |
| `<LAUFNUMMER>` | 3-stellig, für Mehrfachvalidierungen am gleichen Tag | `001` |

**Beispiele:**
- `SYS-042-val-20260307-001.yml` – erste Validierung von SYS-042 am 07.03.2026
- `SYS-042-val-20260307-002.yml` – zweite Validierung am gleichen Tag (nach Review-Kommentar)

### Ablageort

Der `validation/`-Ordner liegt **im gleichen Projektverzeichnis** wie die doorstop-Dokumente,
**nicht** innerhalb eines doorstop-Dokuments (doorstop würde ihn ignorieren, da kein Präfix passt).

---

## 4. Validierungsreport – Schema & Format

### Vollständiges Schema

```yaml
# validation/SYS-042-val-20260307-001.yml

# --- Identifikation ---
schema_version: "1.0"
requirement_id: "SYS-042"
requirement_document: "SYS"
requirement_text_hash: "a3f7b2c1d4e5f6..."   # doorstop SHA256-Fingerprint
validation_id: "SYS-042-val-20260307-001"

# --- Zeitstempel & Verantwortlichkeit ---
validation_date: "2026-03-07"
validation_time: "14:32:00Z"
validator:
  username: "admin"
  display_name: "Max Mustermann"
status: "APPROVED"              # APPROVED | REJECTED | NEEDS_REVISION

# --- Checkliste ---
checklist:
  requirement_complete:
    value: true
    note: ""
  acceptance_criteria_defined:
    value: true
    note: "Kriterien in Abschnitt 3.2 des SRS"
  implementation_linked:
    value: true
    refs: ["SWR-007", "SWR-008"]
    note: ""
  tests_passed:
    value: true
    coverage_percent: 87
    test_run_id: "ci-run-1337"
    note: ""
  peer_review:
    value: true
    reviewer_username: "jdoe"
    reviewer_display_name: "Jane Doe"
    review_date: "2026-03-06"
    note: ""
  security_audit:
    value: false
    applicable: false
    note: "Kein sicherheitskritisches Feature – N/A"

# --- Freitext ---
summary: >
  Anforderung vollständig validiert. Kleinere Formulierung in
  Satz 2 angepasst. Coverage knapp unter Ziel (87% vs. 90%),
  akzeptiert da Feature non-critical.

# --- Verlinkung ---
related_commits: []            # wird nach Commit hier eingetragen (optional)
supersedes: null               # z. B. "SYS-042-val-20260101-001" bei Re-Validierung
```

### Pflichtfelder

Folgende Felder müssen vorhanden sein; fehlende Pflichtfelder lassen den Pre-Commit-Hook
fehlschlagen:

| Feld | Typ | Pflicht |
|---|---|---|
| `schema_version` | String | Ja |
| `requirement_id` | String | Ja |
| `requirement_text_hash` | String | Ja |
| `validation_date` | String (ISO 8601) | Ja |
| `validator.username` | String | Ja |
| `status` | Enum | Ja |
| `checklist.*` (alle Felder) | Bool | Ja |
| `summary` | String | Ja |

### Status-Werte

| Status | Bedeutung |
|---|---|
| `APPROVED` | Anforderung ist validiert und genehmigt |
| `REJECTED` | Anforderung ist nicht akzeptabel, muss überarbeitet werden |
| `NEEDS_REVISION` | Formale Revision nötig, vor nächster Validierung einarbeiten |

---

## 5. Commit-Konventionen

### Commit-Message-Format

```
validate(<REQ-ID>): <STATUS> - <Kurzbeschreibung>

[optionaler Freitext]

Validation-Report: validation/<DATEINAME>
Validator: <username>
Doorstop-Fingerprint: <hash>
```

### Beispiele

```
validate(SYS-042): APPROVED - Login-Sicherheitsanforderung

Kriterien vollständig erfüllt. Coverage 87%.

Validation-Report: validation/SYS-042-val-20260307-001.yml
Validator: admin
Doorstop-Fingerprint: a3f7b2c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678
```

```
validate(SYS-015): REJECTED - Unvollständige Akzeptanzkriterien

Akzeptanzkriterien fehlen für Szenario 3 und 4.
Anforderung muss vor Re-Validierung überarbeitet werden.

Validation-Report: validation/SYS-015-val-20260307-001.yml
Validator: jdoe
Doorstop-Fingerprint: b7c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1
```

### Prefix-Typen

Nur Commits mit dem Prefix `validate(...)` sind Validierungs-Commits. Normale Änderungen
an Anforderungen verwenden andere Prefixe:

| Prefix | Bedeutung |
|---|---|
| `feat(REQ-ID):` | Neue Anforderung erstellt |
| `fix(REQ-ID):` | Anforderung inhaltlich korrigiert |
| `validate(REQ-ID):` | Validierungskommit (mit Report) |
| `docs(REQ-ID):` | Nur Dokumentation/Kommentar geändert |

---

## 6. Vollständiger Validierungs-Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        req_man UI                               │
│                                                                 │
│  1. User öffnet Anforderung SYS-042                             │
│  2. User klickt "Validierung starten"                           │
│  3. Validierungs-Dialog erscheint:                              │
│     ┌────────────────────────────────────────┐                  │
│     │ Checkliste für SYS-042                 │                  │
│     │ [x] Anforderung vollständig            │                  │
│     │ [x] Akzeptanzkriterien vorhanden       │                  │
│     │ [x] Implementierung verlinkt           │                  │
│     │ [ ] Tests bestanden       [Eingabe]    │                  │
│     │ [ ] Peer-Review           [Eingabe]    │                  │
│     │ [ ] Sicherheitsaudit   N/A [toggle]   │                  │
│     │ Status: [APPROVED ▼]                   │                  │
│     │ Zusammenfassung: [Freitext]            │                  │
│     │                     [Abbrechen][Speichern & Commit]       │
│     └────────────────────────────────────────┘                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /api/projects/{id}/validate
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                          │
│                                                                 │
│  4. Fingerprint aus doorstop-Item auslesen                      │
│  5. Validierungsreport-YAML generieren                          │
│  6. Report in validation/ schreiben                             │
│  7. doorstop check ausführen (Link-Integrität)                  │
│  8. git add <req.yml> <report.yml>                              │
│  9. git commit -m "validate(SYS-042): APPROVED - ..."           │
│ 10. Commit-Hash in response zurückgeben                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    Git-Repository
                    (unveränderlicher Nachweis)
```

### Schritt-für-Schritt

| Schritt | Akteur | Aktion |
|---|---|---|
| 1 | User | Anforderung in req_man öffnen |
| 2 | User | "Validierung starten" klicken |
| 3 | User | Checkliste ausfüllen, Status setzen, Zusammenfassung schreiben |
| 4 | Backend | doorstop-Fingerprint der Anforderung lesen |
| 5 | Backend | `validation/<ID>-val-<DATUM>-<NR>.yml` generieren |
| 6 | Backend | `doorstop check` ausführen – bei Fehler Abbruch mit Fehlermeldung |
| 7 | Backend | `git add` für Anforderungs-YAML + Report-YAML |
| 8 | Backend | `git commit` mit strukturierter Commit-Message |
| 9 | Backend | Commit-Hash an Frontend zurückgeben |
| 10 | UI | Erfolgs-Banner mit Commit-Hash und Link zu Git-Log anzeigen |

---

## 7. Git-Abfragen & Audit-Trail

Da Validierungsreports als Dateien in Git liegen, sind alle Standard-Git-Befehle nutzbar.

### Alle Validierungen einer Anforderung

```bash
git log --all --diff-filter=A --name-only --pretty=format:"%H %ad %s" \
  -- "validation/SYS-042-*.yml"
```

### Letzter Validierungsstatus einer Anforderung

```bash
git log --all -1 --pretty=format:"%H %ad" -- "validation/SYS-042-*.yml"
```

### Alle Anforderungen mit REJECTED-Status (aus Commit-Messages)

```bash
git log --all --grep="validate.*REJECTED" --pretty=format:"%H %s"
```

### Wer hat wann welche Anforderung validiert?

```bash
git log --all --grep="^validate(" \
  --pretty=format:"%ad | %an | %s" --date=short
```

### Inhalt eines spezifischen Validierungsreports anzeigen

```bash
git show HEAD:validation/SYS-042-val-20260307-001.yml
```

### Alle Validierungen an einem bestimmten Tag

```bash
git log --all --after="2026-03-07" --before="2026-03-08" \
  --grep="^validate(" --pretty=format:"%H %s"
```

---

## 8. Implementierungsplan Backend

### Neue Abhängigkeit

```
gitpython>=3.1.0
```

### Neue Dateien

```
backend/
├── git_service.py          ← Git-Operationen (gitpython)
├── validation_service.py   ← Report-Generierung, Fingerprint-Auslesen
└── routers/
    └── validation_router.py  ← API-Endpunkte für Validierung
```

### API-Endpunkte

#### `POST /api/projects/{project_id}/items/{item_id}/validate`

Startet eine neue Validierung.

**Request Body:**
```json
{
  "status": "APPROVED",
  "checklist": {
    "requirement_complete": { "value": true, "note": "" },
    "acceptance_criteria_defined": { "value": true, "note": "Abschnitt 3.2" },
    "implementation_linked": { "value": true, "refs": ["SWR-007"], "note": "" },
    "tests_passed": { "value": true, "coverage_percent": 87, "test_run_id": "ci-1337", "note": "" },
    "peer_review": { "value": true, "reviewer_username": "jdoe", "review_date": "2026-03-06", "note": "" },
    "security_audit": { "value": false, "applicable": false, "note": "N/A" }
  },
  "summary": "Anforderung vollständig validiert."
}
```

**Response:**
```json
{
  "validation_id": "SYS-042-val-20260307-001",
  "commit_hash": "a1b2c3d4e5f6...",
  "report_path": "validation/SYS-042-val-20260307-001.yml",
  "status": "APPROVED"
}
```

#### `GET /api/projects/{project_id}/items/{item_id}/validations`

Gibt alle Validierungsreports für eine Anforderung zurück (aus Git-History rekonstruiert).

**Response:**
```json
[
  {
    "validation_id": "SYS-042-val-20260307-001",
    "validation_date": "2026-03-07",
    "validator": "admin",
    "status": "APPROVED",
    "commit_hash": "a1b2c3d4...",
    "report_path": "validation/SYS-042-val-20260307-001.yml"
  }
]
```

#### `GET /api/projects/{project_id}/items/{item_id}/validations/latest`

Gibt den neuesten Validierungsreport zurück.

#### `GET /api/projects/{project_id}/validations`

Gibt alle Validierungen im Projekt zurück (für Dashboard/Audit-Übersicht).

### `git_service.py` – Kernfunktionen

```python
from git import Repo
from pathlib import Path

def get_repo(project_path: str) -> Repo:
    """Gibt das Git-Repo für ein Projekt zurück."""
    # Sucht das nächste .git-Verzeichnis aufwärts
    return Repo(project_path, search_parent_directories=True)

def commit_validation(
    project_path: str,
    req_yaml_path: str,
    report_path: str,
    commit_message: str,
    author_name: str,
    author_email: str,
) -> str:
    """
    Fügt Anforderungs-YAML + Validierungsreport zum Index hinzu
    und erstellt einen Commit. Gibt den Commit-Hash zurück.
    """
    repo = get_repo(project_path)
    repo.index.add([req_yaml_path, report_path])
    actor = Actor(author_name, author_email)
    commit = repo.index.commit(
        commit_message,
        author=actor,
        committer=actor,
    )
    return commit.hexsha

def get_validation_history(project_path: str, item_id: str) -> list:
    """
    Gibt alle Commits zurück die einen Validierungsreport für
    item_id hinzugefügt haben (diff-filter=A).
    """
    repo = get_repo(project_path)
    pattern = f"validation/{item_id}-val-*.yml"
    commits = []
    for commit in repo.iter_commits(all=True, paths=pattern):
        commits.append({
            "hash": commit.hexsha,
            "date": commit.authored_datetime.isoformat(),
            "author": commit.author.name,
            "message": commit.message.strip(),
        })
    return commits
```

---

## 9. Implementierungsplan Frontend

### Neue Komponenten

```
src/components/validation/
├── ValidationDialog.tsx     ← Haupt-Dialog mit Checkliste
├── ChecklistItem.tsx        ← Einzelne Checklisten-Zeile (Bool + Note + optionale Felder)
├── ValidationHistory.tsx    ← Liste aller Validierungen einer Anforderung
└── ValidationBadge.tsx      ← Status-Badge (APPROVED/REJECTED/NEEDS_REVISION/UNVALIDATED)
```

### Integration in ItemEditor

- **Badge** neben dem Anforderungstitel zeigt aktuellen Validierungsstatus
- **"Validierung starten"**-Button (nur für Editor/Admin sichtbar)
- **"Validierungs-History"**-Tab im Item-Detail-Panel

### Statusanzeige

| Zustand | Badge-Farbe | Anzeige |
|---|---|---|
| Noch nicht validiert | Grau | `UNVALIDATED` |
| Validiert, Fingerprint aktuell | Grün | `APPROVED` |
| Fingerprint veraltet (Req geändert) | Orange | `OUTDATED` |
| Abgelehnt | Rot | `REJECTED` |
| Revision nötig | Gelb | `NEEDS_REVISION` |

### Fingerprint-Vergleich

Das Backend gibt bei jedem Item-Abruf zurück:

```json
{
  "id": "SYS-042",
  "text": "...",
  "fingerprint": "a3f7b2c1...",
  "validation": {
    "status": "APPROVED",
    "fingerprint_at_validation": "a3f7b2c1...",
    "is_current": true,
    "validation_date": "2026-03-07",
    "validator": "admin"
  }
}
```

Wenn `fingerprint !== fingerprint_at_validation` → Badge zeigt `OUTDATED`.

---

## 10. Git Hooks

### `pre-commit` Hook – doorstop Check

Wird vor jedem Commit ausgeführt. Verhindert Commits mit invaliden doorstop-Links.

```bash
#!/bin/sh
# .githooks/pre-commit
echo "Running doorstop check..."
doorstop check
if [ $? -ne 0 ]; then
  echo "ERROR: doorstop check fehlgeschlagen. Commit abgebrochen."
  exit 1
fi
```

### `commit-msg` Hook – Validierungsreport-Pflichtprüfung

Erzwingt für `validate(...)`-Commits die Angabe des Report-Pfads.

```bash
#!/bin/sh
# .githooks/commit-msg
COMMIT_MSG=$(cat "$1")

# Nur validate()-Commits prüfen
if echo "$COMMIT_MSG" | grep -qE "^validate\("; then
  if ! echo "$COMMIT_MSG" | grep -qE "Validation-Report:"; then
    echo "ERROR: validate()-Commit muss 'Validation-Report: ...' im Footer enthalten."
    exit 1
  fi
  if ! echo "$COMMIT_MSG" | grep -qE "Doorstop-Fingerprint:"; then
    echo "ERROR: validate()-Commit muss 'Doorstop-Fingerprint: ...' im Footer enthalten."
    exit 1
  fi
fi
```

### Hooks aktivieren

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/commit-msg
```

Die Hooks werden zusammen mit dem Projekt-Repository verteilt und gelten für alle Contributors.

---

## 11. Zusammenhang mit doorstop

### Fingerprint-Mechanismus

doorstop berechnet für jedes Item einen SHA256-Hash über den Anforderungsinhalt.
Dieser Fingerprint wird im Item gespeichert, wenn `doorstop review` ausgeführt wird:

```yaml
# SYS/SYS-042.yml (doorstop)
active: true
derived: false
header: Login-Sicherheit
level: 1.0
links:
  - SWR-007: a1b2c3d4...
  - SWR-008: e5f6a7b8...
normative: true
ref: ''
reviewed: a3f7b2c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678
text: >
  Das System muss Passwörter mit bcrypt (min. Cost 12) hashen.
```

Wenn sich `text` oder `links` ändert, weicht der aktuelle Hash vom gespeicherten `reviewed`-Wert ab.
req_man kann diesen Zustand abfragen und im Frontend als `OUTDATED` anzeigen.

### doorstop check

`doorstop check` validiert:
- Alle verlinkten Items existieren tatsächlich
- Keine zirkulären Abhängigkeiten
- Alle Pflichtfelder vorhanden

Dieser Check wird im Backend vor dem Commit-Schritt ausgeführt. Schlägt er fehl,
wird die Validierung mit einem Fehler abgebrochen.

---

## 12. Offene Entscheidungen

| Frage | Optionen | Empfehlung |
|---|---|---|
| Wo liegt das Git-Repo? | Innerhalb jedes Projekts / zentral für alle Projekte | Pro Projekt ein eigenes Git-Repo |
| Git-Repo-Initialisierung | Manuell / automatisch beim Projekt-Erstellen | Automatisch (in `create_project()`) |
| Commit-Autor | req_man-Service-Account / eingeloggter User | Eingeloggter User (Name + E-Mail aus Profil) |
| Remote-Push | Nein / Optional / Automatisch | Optional (konfigurierbar pro Projekt) |
| Re-Validierung | Erlaubt / Nur nach REJECTED | Immer erlaubt, `supersedes`-Feld dokumentiert Vorgänger |
| Validierung rückgängig machen | Möglich / Nicht möglich | Nicht möglich (Audit-Trail-Anforderung) |

---

*Dokument erstellt: 2026-03-07*
*Version: 1.0*
*Status: Entwurf – zur Abstimmung*
