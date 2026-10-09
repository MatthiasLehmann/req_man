# Workflow: Anforderungen · Review · Validierung

**req_man** – Internes Requirements-Management-System
Stand: 2026-03-08

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Rollen & Berechtigungen](#2-rollen--berechtigungen)
3. [Anforderungen erstellen](#3-anforderungen-erstellen)
4. [Anforderungen bearbeiten](#4-anforderungen-bearbeiten)
5. [Anforderungsstatus verstehen](#5-anforderungsstatus-verstehen)
6. [Review-Workflow (Stempeln)](#6-review-workflow-stempeln)
7. [Validierungs-Workflow](#7-validierungs-workflow)
8. [Auto-Stamp: Review + Validierung verknüpfen](#8-auto-stamp-review--validierung-verknüpfen)
9. [Artefakte & Dateistruktur](#9-artefakte--dateistruktur)
10. [Git-Integration](#10-git-integration)
11. [Kompletter Lebenszyklusablauf (End-to-End)](#11-kompletter-lebenszyklusablauf-end-to-end)
12. [Normen & Referenzprojekte](#12-normen--referenzprojekte)

---

## 1. Überblick

req_man verwaltet Anforderungen in **doorstop**-Projekten (YAML-Dateien, Git-versioniert) und bietet zwei formale Qualitätsstufen:

```
Entwurf → [Review] → Reviewed → [Validierung] → APPROVED / REJECTED / NEEDS_REVISION
                                       ↓
                            (APPROVED triggert ggf. Auto-Stamp)
```

| Begriff        | Bedeutung im System |
|----------------|---------------------|
| **Review**     | Formaler Inhaltsstempel: „Diese Version des Textes wurde geprüft." Speichert SHA256-Fingerprint des Anforderungstexts im YAML. |
| **Validierung**| Strukturierter Prüfprozess mit Checkliste, Status (APPROVED/REJECTED/NEEDS_REVISION) und Git-Commit. Erzeugt einen YAML-Report im `validation/`-Verzeichnis. |
| **OUTDATED**   | Das Badge erscheint, wenn der Anforderungstext seit der letzten Validierung geändert wurde (Fingerprint-Vergleich). |

---

## 2. Rollen & Berechtigungen

| Aktion | viewer | editor | admin |
|--------|:------:|:------:|:-----:|
| Anforderungen lesen | ✓ | ✓ | ✓ |
| Anforderungen erstellen/bearbeiten | – | ✓ | ✓ |
| Review-Stempel setzen | – | ✓ | ✓ |
| Validierung durchführen | – | ✓ | ✓ |
| Benutzerverwaltung | – | – | ✓ |
| Attribut-Konfiguration | – | – | ✓ |

---

## 3. Anforderungen erstellen

### 3.1 Dokument anlegen

Bevor Anforderungen erstellt werden können, muss ein **Dokument** (doorstop-Prefix) existieren.

1. Seite **Anforderungen** öffnen
2. Im linken Panel (Dokumentenbaum) auf **„+ Neues Dokument"** klicken
3. Prefix eingeben (z. B. `SRS`, `SWD`, `SYS`)
4. Optional: übergeordnetes Dokument auswählen (für Traceability-Hierarchien)

```
Empfohlene Prefix-Konvention:
  SYS – Systemanforderungen (oberste Ebene)
  SRS – Software-Anforderungsspezifikation
  SWD – Software-Design
  IRS – Integrationsanforderungen
  TST – Testanforderungen
```

### 3.2 Anforderung erstellen

1. Dokument in der linken Spalte auswählen
2. **„+"**-Schaltfläche in der Anforderungsliste klicken
3. Die neue Anforderung erhält automatisch eine sequenzielle UID (z. B. `SRS001`, `SRS002`)
4. Anforderung in der Liste auswählen → Editor öffnet sich

### 3.3 Felder ausfüllen

| Feld | Beschreibung | Pflicht |
|------|-------------|:-------:|
| **Anforderungstext** | Vollständiger Text der Anforderung (Rich-Text/HTML via TipTap-Editor) | – |
| **Ebene** | Gliederungsnummer (z. B. `1.2.3`). Steuert die Einrückung in der Baum-Ansicht | – |
| **Aktiv** | Deaktivierte Anforderungen werden in Metriken und Traceability nicht gezählt | ✓ |
| **Normativ** | Normative Anforderungen sind verbindlich. Nicht-normative Einträge erscheinen mit „Info"-Badge | ✓ |
| **Abschnitt** | Markiert den Eintrag als Gliederungsüberschrift (kein eigener Anforderungsinhalt) | – |
| **Abgeleitet** | Kennzeichnet abgeleitete Anforderungen (derived requirements, z. B. aus übergeordneten) | – |
| **Verlinkungen** | UIDs verknüpfter Anforderungen (parent ↔ child für Traceability-Matrix) | – |
| **Benutzerdefinierte Attribute** | Projektspezifische Felder (vom Admin konfigurierbar) | ± |

> **Tipp:** Ein gutes Anforderungsformat ist: *„Das System MUSS/SOLL/KANN [Funktion] [unter Bedingung] [mit Qualität]."*

### 3.4 Speichern

- **„Speichern"**-Schaltfläche im Header des Editors klicken (oder Änderungsindikator beachten)
- Das Badge **„Ungespeichert"** erscheint bei nicht gespeicherten Änderungen
- Beim Wechsel zu einer anderen Anforderung erscheint ein Warndialog, wenn ungespeicherte Änderungen vorliegen

---

## 4. Anforderungen bearbeiten

### 4.1 Anforderung öffnen

1. Dokument in der linken Spalte wählen
2. Anforderung in der mittleren Spalte anklicken
3. Editor öffnet sich im rechten Panel

### 4.2 Tabs im Editor

| Tab | Inhalt |
|-----|--------|
| **Details** | Alle Felder der Anforderung (Text, Level, Flags, Links, Attribute) |
| **Validierungen** | Vollständige Validierungshistorie (alle Validierungsreports für diese UID) |

### 4.3 Verlinkungen (Traceability)

- Anforderungs-UIDs in das Eingabefeld eingeben und **„+ Hinzufügen"** klicken
- Mehrere UIDs werden als einzelne Tags angezeigt
- Links können über das **×** entfernt werden
- Verlinkungen werden in der **Traceability-Matrix** visualisiert

### 4.4 Auswirkung von Textänderungen

Wenn der Anforderungstext nach einer abgeschlossenen Validierung geändert wird:
- Das **OUTDATED**-Badge erscheint neben dem Validierungsstatus
- Die fingerprint-basierte Erkennung nutzt den SHA256 von UID + Text + Ref + Links
- Eine neue Validierung muss durchgeführt werden, um den Status zu aktualisieren

---

## 5. Anforderungsstatus verstehen

### 5.1 Review-Status (doorstop)

| Anzeige | Bedeutung |
|---------|-----------|
| **Reviewed** (grün) | SHA256-Fingerprint des aktuellen Inhalts stimmt mit dem gespeicherten Stamp überein |
| **Ausstehend** (gelb) | Kein Stempel gesetzt, oder Text wurde nach dem Stempel geändert |

> Der Fingerprint wird berechnet aus: `SHA256(uid + text + ref + links)` — doorstop-intern als `item.stamp(links=True)`.

### 5.2 Validierungsstatus-Badges

| Badge | Farbe | Bedeutung |
|-------|-------|-----------|
| **APPROVED** | Grün | Validierung erfolgreich abgeschlossen |
| **REJECTED** | Rot | Anforderung wurde abgelehnt |
| **NEEDS REVISION** | Gelb | Überarbeitung erforderlich |
| **OUTDATED** | Orange | Text wurde nach letzter Validierung geändert |
| _(kein Badge)_ | – | Noch keine Validierung vorhanden |

### 5.3 Status-Icons in der Anforderungsliste

| Icon | Bedeutung |
|------|-----------|
| ✓ Grün | Aktiv + Reviewed |
| ⚠ Gelb | Aktiv + Nicht reviewed |
| ○ Grau | Inaktiv |

---

## 6. Review-Workflow (Stempeln)

Der Review-Stempel bestätigt: *„Diese exakte Version des Anforderungstexts wurde inhaltlich geprüft."*

### 6.1 Manuellen Review-Stempel setzen

1. Anforderung im Editor öffnen
2. Im Block **„Review-Status"** auf **„Stempeln"** klicken
3. Der aktuelle SHA256-Fingerprint wird in das Anforderungs-YAML geschrieben
4. Das Badge wechselt zu **„✓ Reviewed"**

> **Voraussetzung:** Die Anforderung muss gespeichert sein (kein „Ungespeichert"-Badge). Die Schaltfläche ist deaktiviert, solange ungespeicherte Änderungen vorliegen.

### 6.2 Was der Stempel technisch macht

```yaml
# Vorher (SRS001.yml)
reviewed: ''

# Nachher
reviewed: ZVRhX50usHTNMxPnLq3BLEjayaVeAjUlPE5YyZduBS4=
```

Der gespeicherte Hash wird bei jedem Laden mit dem aktuell berechneten Fingerprint verglichen. Weichen sie ab → „Ausstehend".

### 6.3 Wann muss neu gestempelt werden?

Immer wenn sich ändert:
- Anforderungstext (`text`)
- Referenz (`ref`)
- Verlinkungen (`links`)

Nicht bei Änderungen an: `level`, `active`, `normative`, `header`, custom attributes.

---

## 7. Validierungs-Workflow

Die Validierung ist der formale Nachweis, dass eine Anforderung alle Qualitätskriterien erfüllt. Sie erzeugt einen **signierten Bericht** (YAML) und einen **Git-Commit**.

### 7.1 Validierung starten

1. Anforderung im Editor öffnen
2. **„Validieren"**-Schaltfläche (GitCommit-Icon) im Header klicken
3. Der Validierungsdialog öffnet sich

### 7.2 Validierungsdialog – Felder

#### Status wählen

| Option | Wann verwenden |
|--------|---------------|
| **Genehmigt (APPROVED)** | Anforderung erfüllt alle Kriterien, kann implementiert werden |
| **Abgelehnt (REJECTED)** | Anforderung ist grundsätzlich abzulehnen |
| **Revision nötig (NEEDS_REVISION)** | Anforderung muss überarbeitet werden |

#### Checkliste

Alle Checkpunkte können mit einem optionalen Notizfeld erweitert werden (▼-Pfeil):

| Checkpunkt | Pflicht | Zusatzfelder |
|-----------|:-------:|-------------|
| Anforderung vollständig und eindeutig formuliert | **Ja** | Anmerkung |
| Akzeptanzkriterien definiert | **Ja** | Anmerkung |
| Implementierung verlinkt | Nein | Referenz-UIDs (z. B. `SWR-007`) |
| Tests existieren und sind bestanden | Nein | Coverage %, Test-Run-ID |
| Peer-Review durchgeführt | Nein | Reviewer-Name, Datum |
| Sicherheitsaudit | Nein | Anmerkung, **N/A**-Option |

> **Hinweis:** Die zwei Pflicht-Checkpunkte müssen für die Validierung nicht zwingend aktiviert sein — der Status „Abgelehnt" oder „Revision nötig" kann auch ohne sie gespeichert werden. Es erscheint aber eine Warnung im Footer.

#### Zusammenfassung (Pflichtfeld)

Freitextbeschreibung des Validierungsergebnisses. Erscheint in der Commit-Message und im Report.

### 7.3 Erweiterte Optionen

<details>

| Option | Beschreibung |
|--------|-------------|
| **Auto-Stamp (Standard: aktiv)** | Bei APPROVED-Validierungen wird der doorstop Review-Stempel automatisch gesetzt. Der SHA256-Hash im YAML stimmt mit dem Validierungsreport überein. |
| **Review-Stempel NICHT setzen** | Opt-out für Projekte nach DO-178C oder ISO 26262, die Review und Validation formal getrennt nachweisen müssen. |
| **doorstop check überspringen** | Umgeht die interne doorstop-Baumvalidierung. Nützlich für Projekte mit unvollständigem Anforderungsbaum. |

</details>

### 7.4 Speichern & Committen

1. **„Speichern & Committen"** klicken
2. Im Hintergrund werden folgende Schritte ausgeführt:

```
1. SHA256-Fingerprint berechnen (aktueller Stand)
2. doorstop check ausführen (prüft Konsistenz des gesamten Baums)
3. Validierungsreport als YAML schreiben (validation/<uid>-val-<datum>-<nr>.yml)
4. git add <anforderung.yml> <report.yml>
5. git commit (mit strukturierter Commit-Message)
6. Bei APPROVED (ohne skip_review_stamp): item.review() → Stempel setzen
```

3. Toast-Benachrichtigung mit Commit-Hash (z. B. `a3b2f1c8`)
4. Tab wechselt automatisch zu **„Validierungen"**

### 7.5 Validierungshistorie anzeigen

Im Editor unter Tab **„Validierungen"**:
- Alle Reports der Anforderung, sortiert nach Datum (neueste zuerst)
- Jeder Report zeigt: Status, Datum, Validator, Fingerprint-Übereinstimmung, Checkliste
- Ein **OUTDATED**-Badge erscheint, wenn der gespeicherte Fingerprint vom aktuellen abweicht

---

## 8. Auto-Stamp: Review + Validierung verknüpfen

### 8.1 Motivation

In den meisten Entwicklungsprozessen (ISO 26262, ASPICE, IEEE 29148) ist eine abgeschlossene Validierung gleichbedeutend mit einem erfolgreichen Review. Tools wie Codebeamer oder Jama trigern bei einem APPROVED-Review automatisch den „Reviewed"-Statusübergang.

req_man implementiert dieses Muster als **Option A (Auto-Stamp)**:

```
APPROVED-Validierung → item.review() → SHA256 in Item-YAML == SHA256 im Validierungsreport
```

### 8.2 Verhalten

| Validierungsstatus | skip_review_stamp | Aktion |
|-------------------|:-----------------:|--------|
| APPROVED | false (Standard) | Stempel wird automatisch gesetzt (`review_stamped = true`) |
| APPROVED | true (Opt-out) | Kein automatischer Stempel |
| REJECTED | – | Kein automatischer Stempel |
| NEEDS_REVISION | – | Kein automatischer Stempel |

### 8.3 Wann Opt-out verwenden?

Der Opt-out ist für Projekte gedacht, die:
- **DO-178C** (Luftfahrt): Review und Validation sind formal getrennte Aktivitäten mit separaten Nachweisen
- **ISO 26262** (Automotive): Beide Aktivitäten werden von unterschiedlichen Personen durchgeführt und separat dokumentiert

In diesen Fällen muss der Review-Stempel manuell (Schaltfläche „Stempeln") von einer autorisierten Person gesetzt werden.

---

## 9. Artefakte & Dateistruktur

### 9.1 Anforderungs-YAML

```yaml
# <prefix>/<prefix><nr>.yml  –  z.B. SRS/SRS001.yml
active: true
derived: false
header: ''
IS_REQUIREMENT: true          # benutzerdefiniertes Attribut
level: 1.0
links: []
normative: true
ref: ''
reviewed: ZVRhX50usHTNMxPnLq3BLEjayaVeAjUlPE5YyZduBS4=   # SHA256-Stamp (leer = unreviewed)
text: |
  Das System muss Benutzer authentifizieren.
```

### 9.2 Validierungsreport

```yaml
# validation/<uid>-val-<YYYYMMDD>-<nr>.yml  –  z.B. validation/SRS001-val-20260308-001.yml
schema_version: '1.0'
requirement_id: SRS001
requirement_document: SRS
requirement_text_hash: ZVRhX50usHTNMxPnLq3BLEjayaVeAjUlPE5YyZduBS4=   # Fingerprint zum Validierungszeitpunkt
validation_id: SRS001-val-20260308-001
validation_date: '2026-03-08'
validation_time: '14:32:17Z'
validator:
  username: jdoe
  display_name: Jane Doe
status: APPROVED
checklist:
  requirement_complete:
    value: true
    note: Anforderung ist SMART formuliert
  acceptance_criteria_defined:
    value: true
  implementation_linked:
    value: true
    refs:
      - SWR-042
  tests_passed:
    value: true
    coverage_percent: 94
    test_run_id: ci-run-4711
  peer_review:
    value: true
    reviewer_username: msmith
    reviewer_display_name: Mike Smith
    review_date: '2026-03-07'
  security_audit:
    value: false
    applicable: false          # N/A markiert
summary: Anforderung vollständig, Tests grün, Peer-Review abgeschlossen.
related_commits: []
supersedes: null
```

### 9.3 Verzeichnisstruktur

```
<projekt-verzeichnis>/
├── SRS/
│   ├── .doorstop.yml          # doorstop-Dokumentenkonfiguration
│   ├── SRS001.yml             # Anforderung
│   └── SRS002.yml
├── SWD/
│   ├── .doorstop.yml
│   └── SWD001.yml
└── validation/
    ├── SRS001-val-20260308-001.yml    # Erster Validierungsreport für SRS001
    ├── SRS001-val-20260308-002.yml    # Zweiter Report (Korrektur nach NEEDS_REVISION)
    └── SRS002-val-20260307-001.yml
```

---

## 10. Git-Integration

### 10.1 Commit-Struktur

Jede Validierung erzeugt automatisch einen Git-Commit:

```
validate(SRS001): APPROVED - Anforderung vollständig, Tests grün...

Validation-Report: validation/SRS001-val-20260308-001.yml
Validator: jdoe
Doorstop-Fingerprint: ZVRhX50usHTNMxPnLq3BLEjayaVeAjUlPE5YyZduBS4=
```

**Enthaltene Dateien:**
- `SRS/SRS001.yml` – Anforderungs-YAML (ggf. mit aktualisiertem `reviewed`-Hash)
- `validation/SRS001-val-20260308-001.yml` – Validierungsreport

### 10.2 Git-Log einsehen

Unter **Metriken → Git-Log** (oder API: `GET /api/projects/{id}/git/log`) sind die letzten Commits einsehbar.

### 10.3 Versionierung & Auditierbarkeit

- Jede Anforderungsänderung, jeder Stempel und jede Validierung ist durch Git-History nachvollziehbar
- `git blame SRS/SRS001.yml` zeigt, wer wann was geändert hat
- Validierungsreports sind unveränderlich (new file per Commit)
- Der `requirement_text_hash` im Report belegt, gegen welche exakte Version der Anforderung validiert wurde

---

## 11. Kompletter Lebenszyklusablauf (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1: ERSTELLUNG                                                │
│                                                                     │
│  1. Dokument anlegen (z.B. SRS)                                     │
│  2. Anforderung erstellen  →  UID = SRS001                         │
│  3. Text verfassen, Links setzen, Attribute ausfüllen               │
│  4. Speichern                                                       │
│     Status: kein Badge | Review: Ausstehend                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2: REVIEW (optional / getrennt)                              │
│                                                                     │
│  5. Anforderung fachlich prüfen                                     │
│  6. „Stempeln" klicken                                              │
│     → reviewed = SHA256(uid+text+ref+links) in SRS001.yml          │
│     Status: Reviewed (grün)                                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 3: VALIDIERUNG                                               │
│                                                                     │
│  7. „Validieren" klicken                                            │
│  8. Checkliste ausfüllen:                                           │
│     ☑ Anforderung vollständig (Pflicht)                            │
│     ☑ Akzeptanzkriterien definiert (Pflicht)                       │
│     ☑ Implementierung verlinkt (z.B. SWR-042)                      │
│     ☑ Tests bestanden (Coverage: 94%, Run: ci-run-4711)            │
│     ☑ Peer-Review (Mike Smith, 2026-03-07)                         │
│     ☐ Sicherheitsaudit (N/A)                                       │
│  9. Status wählen: APPROVED                                         │
│  10. Zusammenfassung eingeben                                       │
│  11. „Speichern & Committen" klicken                               │
│                                                                     │
│  Ergebnis:                                                          │
│  → validation/SRS001-val-20260308-001.yml erstellt                  │
│  → git commit (SRS001.yml + Report)                                 │
│  → Auto-Stamp: reviewed = aktueller Fingerprint                    │
│     Status: APPROVED (grün) | Review: Reviewed (grün)              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                    Text ändert sich?
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 4: ÄNDERUNGSZYKLUS                                           │
│                                                                     │
│  12. Text bearbeiten & speichern                                    │
│      Status: APPROVED + OUTDATED (orange)                          │
│      Review: Ausstehend (Fingerprint hat sich geändert)            │
│                                                                     │
│  13. Neue Validierung durchführen (zurück zu Phase 3)              │
│      → neuer Report: SRS001-val-20260309-001.yml                    │
│      → OUTDATED-Badge verschwindet                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Typischer Sonderfall: NEEDS_REVISION

```
Validierung → NEEDS_REVISION
     │
     ▼
Anforderung überarbeiten (Text anpassen)
     │
     ▼
Erneut speichern
     │
     ▼
Neue Validierung → APPROVED
```

Alle NEEDS_REVISION-Reports bleiben in der History erhalten und sind im Tab „Validierungen" sichtbar.

---

## 12. Normen & Referenzprojekte

### Einordnung in gängige Standards

| Standard | Review | Validierung | Trennung erforderlich? |
|----------|--------|-------------|----------------------|
| **ISO 26262** (Automotive) | Peer Review (Work Product Review) | Software Validation | Ja – separate Rollen & Nachweise |
| **DO-178C** (Luftfahrt) | Software Review | Software Verification | Ja – formale Independence-Anforderungen |
| **IEC 62304** (Medizin) | Document Review | Software Verification | Empfohlen |
| **ASPICE** (Automotive SPICE) | Work Product Review | Validation | Nein – kombinierbar |
| **IEEE 29148** | Peer Review | Requirements Validation | Nein – kombinierbar |

### req_man-Empfehlungen nach Projektyp

| Projekttyp | Empfohlene Einstellung |
|-----------|----------------------|
| Standard-Software, Agile | Auto-Stamp aktiv (Standard). Review und Validation kombiniert. |
| ISO 26262 / DO-178C | `skip_review_stamp = true`. Review separat durch autorisierten Reviewer via „Stempeln". |
| ASPICE-Projekte | Auto-Stamp aktiv reicht für ASPICE Level 2+. Bei Level 3 separate Rollen sicherstellen. |

---

## Anhang: API-Referenz (Kurzübersicht)

```
POST   /api/projects/{pid}/items/{uid}/validate          Validierung erstellen
GET    /api/projects/{pid}/items/{uid}/validations        Alle Reports eines Items
GET    /api/projects/{pid}/items/{uid}/validations/latest Letzter Validierungsstatus
GET    /api/projects/{pid}/validations                    Alle Reports im Projekt
POST   /api/projects/{pid}/items/{uid}/review            Review-Stempel setzen
GET    /api/projects/{pid}/git/log                       Git-Commit-Historie
GET    /api/projects/{pid}/git/status                    Hat Projekt ein Git-Repo?
```

**Validierungs-Status-Werte:** `APPROVED` | `REJECTED` | `NEEDS_REVISION`

**Fingerprint:** SHA256, Base64-kodiert, berechnet über `uid + text + ref + links` (doorstop `item.stamp(links=True)`)
