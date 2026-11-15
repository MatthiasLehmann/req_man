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
cp .env.example .env   # SECRET_KEY (Pflicht), CORS_ORIGINS und KI-Provider anpassen
docker compose up -d --build
```

Ohne gesetztes `SECRET_KEY` bricht `docker compose` mit einer Fehlermeldung ab.

Die App ist dann über nginx unter <http://localhost> erreichbar. Standardmäßig wird ein
Ollama-Container als lokaler KI-Server mitgestartet. Persistente Daten liegen in `data/`
(Datenbank, Projektliste, Attribute) und `projects/` (doorstop-Projekte).

**Bedeutungssuche (Ähnliche Anforderungen, Link-Vorschläge, Auswirkungen):** braucht ein Embedding-Modell
über einen OpenAI-kompatiblen Endpunkt, Standard Ollama mit `bge-m3` (`ollama pull bge-m3`, bei Docker
`docker compose exec ollama ollama pull bge-m3`). Variablen `EMBED_MODEL`, `EMBED_BASE_URL`, `EMBED_API_KEY`.
Ohne das Modell bleibt ReqMan benutzbar, die Suchfunktionen antworten dann mit 503. Der Index liegt unter
`data/rag/` und gleicht sich selbst ab.

## In Obsidian öffnen (Export)

Der Knopf „In Obsidian öffnen“ (Traceability-Seite und Projektkarte) schreibt das Projekt als Ordner mit
Markdown-Notizen, `Start.md`, `Uebersicht.base` und `Traceability.canvas` nach `data/obsidian/<Projekt>/`
(umstellbar über `OBSIDIAN_EXPORT_ROOT`; `REQMAN_PUBLIC_URL` setzt die Adresse in `reqman_url`). Nur
ReqMan → Obsidian; Dateien, die nicht von ReqMan stammen, werden nie angefasst (Liste in
`.reqman-export.json`). In Obsidian: „Ordner als Vault öffnen“ und diesen Ordner wählen. Bei Docker liegt er im
Volume `data/`, also auf dem Host unter `<Projektordner>/data/obsidian/<Projekt>/` – diesen Host-Pfad in
Obsidian öffnen, nicht den Pfad im Container.

## MCP-Server

`mcp_server/` macht ReqMan für KI-Agenten (Claude Desktop, Claude Code, VS Code) nutzbar: lesen, suchen,
Auswirkungen und Qualitätsprüfung. Er ist ein Client der REST-API (Rollen und Rechte des ReqMan-Benutzers
gelten). Einrichtung und Konfigurationsbeispiele: [mcp_server/README.md](mcp_server/README.md).

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
mcp_server/  MCP-Server (ReqMan als Werkzeugsatz für KI-Agenten)
```

## Tests

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npm run check:boundaries   # Modulgrenzen zwischen features/ und shared/
cd frontend && npm run check:api          # API-Typen passen zum Backend
cd mcp_server && .venv/bin/python -m pytest -q   # MCP-Server (eigene venv)
```

## API-Typen

Die TypeScript-Typen der API werden aus dem OpenAPI-Schema des Backends erzeugt
(`frontend/openapi.json`, `frontend/src/shared/api/schema.d.ts`). Nach jeder Änderung an
Pydantic-Modellen oder Endpunkten im Backend:

```bash
cd frontend && npm run generate:api
```

Danach zeigt `npx tsc --noEmit` alle Stellen im Frontend, die an die Änderung angepasst werden müssen.

## Hinweise

- `bcrypt` ist auf Version 4.0.1 fixiert – neuere Versionen sind mit passlib inkompatibel.
- KI-Bewertungen und Simulink-Verknüpfungen werden als Sidecar-Dateien neben den Anforderungen
  gespeichert, siehe [docs/sidecar-metadateien.md](docs/sidecar-metadateien.md).
