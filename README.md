# ReqMan

Webbasiertes Anforderungsmanagement auf Basis von [doorstop](https://github.com/doorstop-dev/doorstop).
Anforderungen werden als YAML-Dateien versioniert abgelegt; ReqMan stellt dafür eine
Mehrbenutzer-Oberfläche mit Editor, Traceability, Metriken und KI-gestützter Qualitätsprüfung bereit.

## Funktionen

- **Anforderungen bearbeiten** – Dokumentbaum, Item-Liste und Rich-Text-Editor (TipTap) mit Tabellen, Bildern und PlantUML
- **Dokumentstruktur** – Dokumente mit freien Präfixen und wählbarem UID-Trennzeichen anlegen und konfigurieren
- **Verlinkung & Traceability** – Links zwischen Anforderungen, Traceability-Ansicht und Traceability-Matrix
- **Review & Validierung** – Review-Status von Items, Git-basierte Validierung
- **Metriken** – Dashboard mit Kennzahlen zu Abdeckung und Review-Stand
- **KI-Qualitätsanalyse** – Bewertung von Anforderungen über Anthropic, OpenAI oder lokal per Ollama
- **MATLAB/Simulink** – Traceability zwischen Anforderungen und Simulink-Modellen
- **Export** – CSV, TSV, XLSX und YAML
- **Benutzer & Rollen** – `admin` (Vollzugriff, Benutzer- und Attributverwaltung), `editor` (Anforderungen und Projekte bearbeiten), `viewer` (nur lesen)

## Tech-Stack

| Bereich | Technologie |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy/SQLite (Benutzer), doorstop 3.1 (Anforderungen) |
| Auth | JWT (python-jose), bcrypt via passlib |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TipTap |
| KI | Anthropic, OpenAI oder Ollama (OpenAI-kompatibel) |
| Deployment | Docker Compose mit nginx als Reverse Proxy |

## Schnellstart (lokal)

Voraussetzungen: Python 3.12+ und Node.js mit npm.

```bash
./install.sh   # legt backend/.venv an und installiert die npm-Pakete
./start.sh     # startet Backend (Port 8000) und Frontend (Port 5173)
./stop.sh      # beendet beide Prozesse
```

Unter Windows (Git Bash) stattdessen `win_install.sh` und `win_start.sh` verwenden.

Danach ist die App unter <http://localhost:5173> erreichbar, die API-Dokumentation unter
<http://localhost:8000/docs>.

**Standard-Login:** `admin` / `admin123` – wird beim ersten Start angelegt, wenn noch kein
Benutzer existiert. Das Passwort sollte danach im Admin-Bereich geändert werden.

### Optionen von `start.sh`

```bash
./start.sh --provider ollama            # KI-Provider: anthropic (Standard) | ollama | openai
./start.sh --provider openai --model gpt-4o-mini
./start.sh --host                       # im Netzwerk verfügbar machen (bindet 0.0.0.0)
```

Für Anthropic bzw. OpenAI muss `ANTHROPIC_API_KEY` bzw. `OPENAI_API_KEY` gesetzt sein.
Ohne gesetztes `SECRET_KEY` erzeugt das Backend bei jedem Start einen zufälligen Schlüssel –
bestehende Logins werden dann ungültig.

## Betrieb mit Docker

```bash
cp .env.example .env   # SECRET_KEY, CORS_ORIGINS und KI-Provider anpassen
docker compose up -d --build
```

Die App ist dann über nginx unter <http://localhost> erreichbar. Standardmäßig wird ein
Ollama-Container als lokaler KI-Server mitgestartet. Persistente Daten liegen in `data/`
(Datenbank, Projektliste, Attribute) und `projects/` (doorstop-Projekte).

## Projektstruktur

```
backend/     FastAPI-App (main.py, routers/, Services für doorstop, KI, Git, Simulink)
frontend/    React-App: src/features (editor, review, ai, trace, …) und src/shared,
             siehe docs/adr/0001-frontend-architektur.md
website/     Projekt-Landingpage (Astro)
docs/        Konzepte und Workflows (Review/Validierung, Simulink, Sidecar-Metadateien)
data/        Laufzeitdaten: SQLite-Datenbank, projects.json, attributes.yml
projects/    doorstop-Projekte
nginx/       Reverse-Proxy-Konfiguration für Docker
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run check:boundaries   # Modulgrenzen zwischen features/ und shared/
```

## Hinweise

- `bcrypt` ist auf Version 4.0.1 fixiert – neuere Versionen sind mit passlib inkompatibel.
- KI-Bewertungen und Simulink-Verknüpfungen werden als Sidecar-Dateien neben den Anforderungen
  gespeichert, siehe [docs/sidecar-metadateien.md](docs/sidecar-metadateien.md).
