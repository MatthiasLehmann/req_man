# Simulink Traceability – Konzept 1: MATLAB-Export-basierte Integration

## Inhaltsverzeichnis

1. [Motivation & Ziel](#1-motivation--ziel)
2. [Überblick & Architektur](#2-überblick--architektur)
3. [Voraussetzungen](#3-voraussetzungen)
4. [Schritt 1 – Anforderungs-UIDs in Simulink eintragen](#4-schritt-1--anforderungs-uids-in-simulink-eintragen)
5. [Schritt 2 – MATLAB-Exportskript ausführen](#5-schritt-2--matlab-exportskript-ausführen)
6. [Schritt 3 – JSON-Format der Exportdatei](#6-schritt-3--json-format-der-exportdatei)
7. [Schritt 4 – Import in req_man](#7-schritt-4--import-in-req_man)
8. [Schritt 5 – Traceability in req_man anzeigen](#8-schritt-5--traceability-in-req_man-anzeigen)
9. [Schritt 6 – Coverage-Auswertung](#9-schritt-6--coverage-auswertung)
10. [Implementierungsplan Backend](#10-implementierungsplan-backend)
11. [Implementierungsplan Frontend](#11-implementierungsplan-frontend)
12. [CI/CD-Integration](#12-cicd-integration)
13. [Datenmodell & Dateistruktur](#13-datenmodell--dateistruktur)
14. [Offene Fragen & Entscheidungen](#14-offene-fragen--entscheidungen)

---

## 1. Motivation & Ziel

In sicherheitskritischen Projekten (z. B. nach DO-178C, ISO 26262, ASPICE) muss für jede
Anforderung nachweisbar sein, durch welches Modell-Element sie umgesetzt wird
(*Low-Level Requirements → Implementation*). Umgekehrt muss jeder Simulink-Block auf
eine Anforderung rückführbar sein (*Block Coverage*).

Heute werden diese Links entweder gar nicht oder manuell in Tabellen gepflegt – fehleranfällig
und schwer auditierbar.

**Ziel dieses Konzepts:** Simulink-Blöcke werden direkt mit Anforderungs-UIDs aus req_man
annotiert. Ein MATLAB-Skript exportiert diese Verknüpfungen in eine JSON-Datei. req_man
importiert die Datei und zeigt die Traceability im Interface an – ohne dass MATLAB auf dem
req_man-Server installiert sein muss.

---

## 2. Überblick & Architektur

```
┌──────────────────────────────────────────────────────────┐
│  Ingenieur-Arbeitsplatz (MATLAB + Simulink)              │
│                                                          │
│  1. UIDs in Block-Properties eintragen                   │
│     z. B. Block Description: "REQ: SRS001, SRS042"      │
│                                                          │
│  2. export_simulink_trace.m ausführen                    │
│     → liest alle Blöcke des Modells                      │
│     → erzeugt simulink_trace.json                        │
└────────────────────┬─────────────────────────────────────┘
                     │  simulink_trace.json
                     ▼
┌──────────────────────────────────────────────────────────┐
│  req_man Backend                                         │
│                                                          │
│  POST /api/projects/{id}/simulink/import                 │
│  → parst JSON                                            │
│  → speichert Links als Sidecar-YAML                      │
│     z. B. SRS001.simulink.yml                            │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  req_man Frontend                                        │
│                                                          │
│  • "Simulink"-Tab im ItemEditor                          │
│  • Coverage-Badge in der Requirements-Liste              │
│  • Coverage-Matrix (welche Anforderungen fehlen)         │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Voraussetzungen

| Was | Wo benötigt | Version |
|-----|-------------|---------|
| MATLAB + Simulink | Ingenieur-Arbeitsplatz | R2021a oder neuer |
| Python 3.10+ | req_man Server | – |
| req_man läuft | Server / lokal | aktueller Stand |
| MATLAB-Skript `export_simulink_trace.m` | Ingenieur-Arbeitsplatz | wird hier bereitgestellt |

> **Hinweis:** Auf dem req_man-Server wird **keine** MATLAB-Lizenz benötigt.
> Der Import verarbeitet nur die fertige JSON-Datei.

---

## 4. Schritt 1 – Anforderungs-UIDs in Simulink eintragen

Jeder Simulink-Block, der eine Anforderung umsetzt, erhält im Feld **Description**
(Block Parameters → allgemeine Eigenschaften) einen Eintrag nach folgendem Muster:

```
REQ: SRS001
```

Mehrere Anforderungen werden kommagetrennt angegeben:

```
REQ: SRS001, SRS042, SRS107
```

### Wo das Feld in Simulink zu finden ist

1. Doppelklick auf den Block → Block-Parameter öffnen
   **oder:** Rechtsklick auf Block → *Properties...*
2. Reiter **General**
3. Feld **Description** → UIDs eintragen

```
┌─────────────────────────────────────────────┐
│  Block Properties: SpeedController          │
│─────────────────────────────────────────────│
│  General │ Block Annotation │ Callbacks     │
│                                             │
│  Description:                               │
│  ┌─────────────────────────────────────────┐│
│  │ REQ: SRS001, SRS042                     ││
│  └─────────────────────────────────────────┘│
│                                             │
│             OK    Cancel    Help            │
└─────────────────────────────────────────────┘
```

> **Alternative:** Statt `Description` kann auch ein Custom-Parameter verwendet werden,
> z. B. über *Mask* → Parameter `req_uid`. Das Exportskript unterstützt beide Varianten
> (konfigurierbar über `ANNOTATION_FIELD`).

---

## 5. Schritt 2 – MATLAB-Exportskript ausführen

Das folgende Skript wird einmalig ins Projektverzeichnis des MATLAB-Projekts abgelegt
und bei Bedarf – oder automatisch per MATLAB-Build – ausgeführt.

### `export_simulink_trace.m`

```matlab
%% export_simulink_trace.m
%  Exportiert Simulink-Block-zu-Anforderung-Links als JSON-Datei.
%
%  Konfiguration:
%    MODEL_NAME       - Name des Simulink-Modells (ohne .slx)
%    OUTPUT_FILE      - Pfad der erzeugten JSON-Datei
%    ANNOTATION_FIELD - Block-Property, die die UIDs enthält ('Description')
%
%  Verwendung:
%    >> export_simulink_trace
%  oder:
%    >> export_simulink_trace('MeinModell', 'output/trace.json')
%
%  Format der Ausgabe:  siehe Abschnitt 3 dieser Dokumentation

function export_simulink_trace(model_name, output_file)

    %% ── Konfiguration ────────────────────────────────────────────────────────
    ANNOTATION_FIELD = 'Description';   % Alternativ: 'UserData' oder Mask-Parameter
    REQ_PREFIX       = 'REQ:';          % Präfix vor den UIDs

    if nargin < 1 || isempty(model_name)
        model_name = bdroot;            % Aktuell geöffnetes Modell
    end
    if nargin < 2 || isempty(output_file)
        output_file = fullfile(pwd, 'simulink_trace.json');
    end

    %% ── Modell laden ─────────────────────────────────────────────────────────
    fprintf('Lade Modell: %s\n', model_name);
    if ~bdIsLoaded(model_name)
        load_system(model_name);
        model_was_loaded = true;
    else
        model_was_loaded = false;
    end

    %% ── Alle Blöcke durchlaufen ──────────────────────────────────────────────
    all_blocks = find_system(model_name, 'LookUnderMasks', 'all', 'FollowLinks', 'on');
    fprintf('  Gefundene Blöcke: %d\n', numel(all_blocks));

    links = {};
    skipped = 0;

    for i = 1:numel(all_blocks)
        block_path = all_blocks{i};

        try
            description = get_param(block_path, ANNOTATION_FIELD);
        catch
            skipped = skipped + 1;
            continue;
        end

        if isempty(description)
            continue;
        end

        % Nach "REQ: ..." Pattern suchen
        pattern = [REQ_PREFIX, '\s*([A-Za-z0-9,\s\-_]+)'];
        tokens  = regexp(description, pattern, 'tokens', 'ignorecase');

        if isempty(tokens)
            continue;
        end

        % UIDs parsen und trimmen
        uid_string = tokens{1}{1};
        uid_list   = strsplit(uid_string, ',');
        uid_list   = cellfun(@strtrim, uid_list, 'UniformOutput', false);
        uid_list   = uid_list(~cellfun(@isempty, uid_list));

        if isempty(uid_list)
            continue;
        end

        % Block-Metadaten erfassen
        try
            block_type = get_param(block_path, 'BlockType');
        catch
            block_type = 'Unknown';
        end

        % Eintrag für jeden verlinkten UID
        for j = 1:numel(uid_list)
            entry.block_path  = block_path;
            entry.block_type  = block_type;
            entry.model_file  = [model_name, '.slx'];
            entry.uid         = uid_list{j};
            entry.link_type   = 'implements';
            links{end+1}      = entry; %#ok<AGROW>
        end
    end

    %% ── JSON erzeugen ────────────────────────────────────────────────────────
    model_info.name         = model_name;
    model_info.file         = [model_name, '.slx'];
    model_info.matlab_version = version;
    model_info.export_date  = datestr(now, 'yyyy-mm-ddTHH:MM:SS');
    model_info.total_blocks = numel(all_blocks);
    model_info.linked_blocks = numel(links);

    output.model  = model_info;
    output.links  = links;

    json_str = jsonencode(output, 'PrettyPrint', true);

    %% ── Datei schreiben ──────────────────────────────────────────────────────
    [out_dir, ~, ~] = fileparts(output_file);
    if ~isempty(out_dir) && ~exist(out_dir, 'dir')
        mkdir(out_dir);
    end

    fid = fopen(output_file, 'w', 'n', 'UTF-8');
    if fid == -1
        error('Konnte Datei nicht schreiben: %s', output_file);
    end
    fwrite(fid, json_str, 'char');
    fclose(fid);

    fprintf('Export abgeschlossen:\n');
    fprintf('  Verlinkte Blöcke : %d\n', numel(links));
    fprintf('  Übersprungen     : %d (kein %s-Feld)\n', skipped, ANNOTATION_FIELD);
    fprintf('  Ausgabedatei     : %s\n', output_file);

    %% ── Aufräumen ────────────────────────────────────────────────────────────
    if model_was_loaded
        close_system(model_name, 0);
    end

end
```

### Skript ausführen

```matlab
% Variante A: Aktuell geöffnetes Modell, Ausgabe im aktuellen Verzeichnis
>> export_simulink_trace

% Variante B: Bestimmtes Modell, bestimmte Ausgabedatei
>> export_simulink_trace('SpeedController', 'C:/Projekte/trace/simulink_trace.json')

% Variante C: Als Teil eines Build-Skripts
>> export_simulink_trace(bdroot, fullfile(getenv('CI_OUTPUT_DIR'), 'simulink_trace.json'))
```

**Erwartete Konsolenausgabe:**

```
Lade Modell: SpeedController
  Gefundene Blöcke: 142
Export abgeschlossen:
  Verlinkte Blöcke : 37
  Übersprungen     : 12 (kein Description-Feld)
  Ausgabedatei     : C:/Projekte/trace/simulink_trace.json
```

---

## 6. Schritt 3 – JSON-Format der Exportdatei

Die erzeugte `simulink_trace.json` hat folgendes Format:

```json
{
  "model": {
    "name": "SpeedController",
    "file": "SpeedController.slx",
    "matlab_version": "9.13.0.2193358 (R2022b)",
    "export_date": "2026-03-24T14:30:00",
    "total_blocks": 142,
    "linked_blocks": 37
  },
  "links": [
    {
      "block_path": "SpeedController/Subsystem/PID_Controller",
      "block_type": "SubSystem",
      "model_file": "SpeedController.slx",
      "uid": "SRS001",
      "link_type": "implements"
    },
    {
      "block_path": "SpeedController/Subsystem/PID_Controller",
      "block_type": "SubSystem",
      "model_file": "SpeedController.slx",
      "uid": "SRS042",
      "link_type": "implements"
    },
    {
      "block_path": "SpeedController/Safety/OverspeedCheck",
      "block_type": "SubSystem",
      "model_file": "SpeedController.slx",
      "uid": "SRS107",
      "link_type": "implements"
    }
  ]
}
```

### Felder im Detail

| Feld | Typ | Beschreibung |
|------|-----|--------------|
| `model.name` | string | Simulink-Modellname |
| `model.file` | string | Dateiname der `.slx`-Datei |
| `model.export_date` | ISO 8601 | Zeitpunkt des Exports |
| `model.linked_blocks` | int | Anzahl Blöcke mit mindestens einem Link |
| `links[].block_path` | string | Vollständiger Pfad des Blocks im Modell |
| `links[].block_type` | string | Simulink-Blocktyp (SubSystem, Gain, ...) |
| `links[].uid` | string | Anforderungs-UID in req_man |
| `links[].link_type` | string | Art der Verknüpfung (`implements`, `verifies`, `refines`) |

---

## 7. Schritt 4 – Import in req_man

Die JSON-Datei wird über die req_man-Weboberfläche oder die API importiert.

### Über die Weboberfläche (geplant)

1. In req_man das Projekt öffnen
2. Menü **Projekt-Einstellungen** → Reiter **Simulink**
3. Schaltfläche **"Traceability importieren"**
4. JSON-Datei auswählen → **Importieren**
5. Ergebnis: Zusammenfassung mit Anzahl erkannter/unbekannter UIDs

### Über die REST-API (direkt / CI)

```bash
curl -X POST \
  http://localhost:8000/api/projects/mein-projekt/simulink/import \
  -H "Authorization: Bearer <token>" \
  -F "file=@simulink_trace.json"
```

**Antwort:**

```json
{
  "imported": 37,
  "unknown_uids": ["SRS999"],
  "updated_requirements": ["SRS001", "SRS042", "SRS107"],
  "model": "SpeedController",
  "timestamp": "2026-03-24T14:35:00Z"
}
```

> **Hinweis:** UIDs die in der JSON-Datei vorkommen, aber in req_man nicht existieren,
> werden in `unknown_uids` zurückgemeldet und **nicht** gespeichert.

---

## 8. Schritt 5 – Traceability in req_man anzeigen

Nach dem Import sind die Links in der Anforderung sichtbar:

### ItemEditor – neuer "Simulink"-Tab

```
┌─────────────────────────────────────────────────────┐
│ SRS001  Details │ Referenzen │ Reviews │ Simulink ▼  │
│─────────────────────────────────────────────────────│
│ Verlinkte Simulink-Blöcke                           │
│                                                     │
│ ✅ SpeedController/Subsystem/PID_Controller         │
│    Typ: SubSystem  │  Modell: SpeedController.slx   │
│    Link-Typ: implements  │  Stand: 24.03.2026        │
│                                                     │
│ ✅ SpeedController/Safety/SpeedLimiter              │
│    Typ: SubSystem  │  Modell: SpeedController.slx   │
│    Link-Typ: implements  │  Stand: 24.03.2026        │
│                                                     │
│   Letzter Import: 24.03.2026 14:35 Uhr              │
└─────────────────────────────────────────────────────┘
```

### Requirements-Liste – Coverage-Badge

In der Anforderungsliste erscheint ein Badge das anzeigt ob eine Anforderung durch
mindestens einen Block abgedeckt ist:

```
┌──────────┬────────────────────────────────────┬──────────┬──────────────┐
│ UID      │ Text                               │ Status   │ Simulink     │
├──────────┼────────────────────────────────────┼──────────┼──────────────┤
│ SRS001   │ Das System muss...                 │ approved │ ✅ 2 Blöcke  │
│ SRS002   │ Die Bremse muss...                 │ draft    │ ⚠️ 0 Blöcke  │
│ SRS042   │ Der Regler soll...                 │ approved │ ✅ 1 Block   │
└──────────┴────────────────────────────────────┴──────────┴──────────────┘
```

---

## 9. Schritt 6 – Coverage-Auswertung

req_man stellt einen Coverage-Endpunkt bereit, der für Audits und CI/CD genutzt werden kann:

### API

```bash
GET /api/projects/{id}/simulink/coverage
```

**Antwort:**

```json
{
  "total_requirements": 120,
  "covered": 87,
  "not_covered": 33,
  "coverage_percent": 72.5,
  "not_covered_uids": ["SRS002", "SRS015", "SRS033", ...],
  "model": "SpeedController",
  "last_import": "2026-03-24T14:35:00Z"
}
```

### Coverage-Matrix (geplant)

Eine Tabelle die Anforderungen (Zeilen) gegen Simulink-Blöcke (Spalten) darstellt –
ähnlich einer FMEA-Matrix – um Lücken auf einen Blick zu erkennen.

---

## 10. Implementierungsplan Backend

### Neue Dateien

```
backend/
  simulink_service.py          # Import-Logik, Persistenz, Coverage-Berechnung
  routers/
    simulink_router.py         # REST-Endpunkte
```

### `simulink_service.py` – Kernfunktionen

```python
class SimulinkLink(BaseModel):
    block_path: str
    block_type: str
    model_file: str
    uid: str
    link_type: str = "implements"
    imported_at: str

class SimulinkImportResult(BaseModel):
    imported: int
    unknown_uids: List[str]
    updated_requirements: List[str]
    model: str
    timestamp: str

def import_simulink_trace(project_id: str, json_data: dict) -> SimulinkImportResult:
    """Verarbeitet die JSON-Exportdatei und speichert Links als Sidecar-YAMLs."""
    ...

def get_simulink_links(project_id: str, uid: str) -> List[SimulinkLink]:
    """Gibt alle Simulink-Links für eine Anforderung zurück."""
    ...

def get_coverage(project_id: str) -> dict:
    """Berechnet die Simulink-Coverage über alle Anforderungen."""
    ...
```

### Sidecar-YAML pro Anforderung

Links werden analog zur KI-Qualitätsprüfung als Sidecar gespeichert:

```
SRS/
  SRS001.yml                  # Anforderung (unveränderter doorstop-Standard)
  SRS001.simulink.yml         # Simulink-Links (neu, durch req_man verwaltet)
```

Format der Sidecar-Datei:

```yaml
# SRS001.simulink.yml
requirement_uid: SRS001
links:
  - block_path: SpeedController/Subsystem/PID_Controller
    block_type: SubSystem
    model_file: SpeedController.slx
    link_type: implements
    imported_at: "2026-03-24T14:35:00Z"
  - block_path: SpeedController/Safety/SpeedLimiter
    block_type: SubSystem
    model_file: SpeedController.slx
    link_type: implements
    imported_at: "2026-03-24T14:35:00Z"
last_import: "2026-03-24T14:35:00Z"
model: SpeedController
```

### `simulink_router.py` – Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `POST` | `/api/projects/{id}/simulink/import` | JSON-Datei importieren |
| `GET` | `/api/projects/{id}/simulink/coverage` | Coverage-Statistik |
| `GET` | `/api/projects/{id}/items/{uid}/simulink-links` | Links einer Anforderung |
| `DELETE` | `/api/projects/{id}/simulink/links` | Alle Links zurücksetzen |

---

## 11. Implementierungsplan Frontend

### Neue Komponenten

```
frontend/src/
  components/requirements/
    SimulinkTab.tsx            # Tab im ItemEditor
    SimulinkCoverageBadge.tsx  # Badge in der Requirements-Liste
  hooks/
    useSimulinkLinks.ts        # TanStack Query Hook
  api/
    client.ts                  # Neue API-Aufrufe (erweitern)
```

### `SimulinkTab.tsx`

- Zeigt Liste der verlinkten Blöcke mit Block-Pfad, Typ, Modell, Import-Datum
- Leer-Zustand mit Hinweis auf Workflow (Export → Import)
- Link-Typ-Badge (`implements`, `verifies`, `refines`)

### Import-Dialog

- Datei-Upload-Dialog für die JSON-Exportdatei
- Fortschrittsanzeige
- Zusammenfassung nach Import (X neue Links, Y unbekannte UIDs)

---

## 12. CI/CD-Integration

Das Export-Import kann vollständig automatisiert werden:

### MATLAB Build-Skript (auf CI-Agent mit MATLAB)

```bash
# In der CI-Pipeline (z. B. GitHub Actions, Jenkins)
matlab -batch "export_simulink_trace('SpeedController', 'artifacts/simulink_trace.json')"
```

### req_man Import (auf CI-Agent ohne MATLAB)

```bash
# JSON-Datei in req_man importieren
curl -X POST \
  "${REQMAN_URL}/api/projects/${PROJECT_ID}/simulink/import" \
  -H "Authorization: Bearer ${REQMAN_TOKEN}" \
  -F "file=@artifacts/simulink_trace.json"

# Coverage prüfen (Exit-Code 1 wenn unter Schwellwert)
COVERAGE=$(curl -s "${REQMAN_URL}/api/projects/${PROJECT_ID}/simulink/coverage" | jq '.coverage_percent')
if (( $(echo "$COVERAGE < 80" | bc -l) )); then
  echo "❌ Simulink Coverage zu niedrig: ${COVERAGE}% (Minimum: 80%)"
  exit 1
fi
echo "✅ Simulink Coverage: ${COVERAGE}%"
```

### Empfohlener CI-Workflow

```
┌──────────────────────────────────────────────────────────┐
│  CI-Pipeline                                             │
│                                                          │
│  1. [MATLAB-Agent]  export_simulink_trace.m              │
│     → erzeugt simulink_trace.json als Artefakt           │
│                                                          │
│  2. [Linux-Agent]   Upload zu req_man                    │
│     → POST /api/projects/.../simulink/import             │
│                                                          │
│  3. [Linux-Agent]   Coverage-Check                       │
│     → GET /api/projects/.../simulink/coverage            │
│     → Pipeline schlägt fehl wenn < Mindestwert           │
└──────────────────────────────────────────────────────────┘
```

---

## 13. Datenmodell & Dateistruktur

### Gesamtüberblick

```
projects/
  mein-projekt/
    SRS/
      SRS001.yml                  # Anforderung (doorstop, unverändert)
      SRS001.simulink.yml         # Simulink-Links  ← NEU
      SRS001.ai-quality.yml       # KI-Qualität     (bereits vorhanden)
      SRS002.yml
      SRS002.simulink.yml
      ...
    SWD/
      SWD001.yml
      SWD001.simulink.yml
      ...
```

### Erweiterung `AiQualityResult` um Simulink-Status (optional)

Im KI-Qualitäts-Tab könnte zusätzlich angezeigt werden ob eine Anforderung durch
mindestens einen Simulink-Block abgedeckt ist – als Qualitätsdimension "Traceability":

```
KI-Qualitäts-Score: 78/100
  Klarheit:       85
  Testbarkeit:    72
  Vollständigkeit: 80
  Konsistenz:     75
  Traceability:   ✅ 2 Simulink-Blöcke   ← optional ergänzen
```

---

## 14. Offene Fragen & Entscheidungen

| # | Frage | Optionen | Empfehlung |
|---|-------|----------|------------|
| 1 | Welches Block-Feld für UIDs? | `Description`, Mask-Parameter, UserData | `Description` als Standard, konfigurierbar |
| 2 | Mehrere Modelle im Projekt? | Ein Import pro Modell oder alle zusammen | Ein Import pro Modell, alle Imports kumulieren |
| 3 | Alte Links beim Re-Import? | Ersetzen oder anhängen | Ersetzen (Stand bleibt aktuell) |
| 4 | Link-Typen | Nur `implements` oder auch `verifies`, `refines`? | Erstmal nur `implements`, erweiterbar |
| 5 | Coverage-Schwellwert | In req_man konfigurierbar oder fix? | Pro Projekt konfigurierbar |
| 6 | Bidirektionalität | Später: req_man → Simulink schreiben? | Konzept 3 (slreqx) als Ausbaustufe |

---

*Erstellt: März 2026 | Konzept 1 von 3 | Nächste Ausbaustufe: Konzept 3 (slreqx-basiert)*
