# ReqMan-MCP-Server

Macht ReqMan für KI-Agenten nutzbar (Model Context Protocol, stdio). Der Server ist ein Client der REST-API
von ReqMan und enthält keine eigene Fachlogik; Rollen und Rechte des angemeldeten ReqMan-Benutzers gelten.

## Werkzeuge

| Werkzeug | Zweck |
|---|---|
| `list_projects` | Einstieg: welche Projekte gibt es |
| `get_project_overview` | Dokumente mit Hierarchie, Abdeckung, offene Punkte |
| `list_requirements` | Anforderungen eines Dokuments in Reihenfolge |
| `get_requirement` | Volltext, Links, Review-Stand, letztes KI-Ergebnis |
| `search_requirements` | Suche nach Bedeutung (zuerst, wenn die UID unbekannt ist) |
| `find_similar_requirements` | Dubletten und mögliche Widersprüche |
| `suggest_links` | Link-Kandidaten aus dem Eltern-Dokument (nur Vorschläge) |
| `analyze_impact` | Was von einer Änderung betroffen wäre (mit Ansicht, siehe „MCP Apps“) |
| `check_requirement_quality` | Qualitätsprüfung auslösen – **speichert** das Ergebnis (nicht nur lesend) |
| `propose_text_change`, `propose_new_requirement`, `propose_link` | **Legen einen Vorschlag an**, ändern nichts; ein Mensch übernimmt oder lehnt ab (ReqMan → „Vorschläge“). Begründung Pflicht |
| `reqman_help` | Wie etwas in ReqMan bedient wird |

Prompts: `einstieg(project)`, `review_dokument(project, document)`. Alle lesenden Werkzeuge sind als
`read_only` markiert; der Server ändert keine Anforderungen. Vorschläge dürfen auch `viewer` anlegen,
übernehmen dürfen nur `editor` und `admin` – in der ReqMan-Oberfläche.

## Stand der Spezifikation

Der Server nutzt das Python-SDK `mcp` **2.3.0** (Stand 15.11.2026, die neueste Version; `requirements.txt`:
`>=2.3,<3`). Ab SDK 2.0.0 (28.07.2026, Beta seit 2.0.0b1) spricht es die MCP-Spezifikation **2026-07-28** und
bedient ältere Revisionen vom selben Server aus; ein Live-Aufruf über stdio hat 2026-07-28 ausgehandelt. Der
Server ist zustandslos und nutzt weder Sampling, Roots, Logging noch Sitzungen (alle drei sind in 2026-07-28
abgekündigt). Er ist nur ein Client der REST-API. Einzelheiten: `experimente\B0_mcp_stand.md`.

## MCP Apps

Zwei Ansichten als `ui://`-Ressourcen (`text/html;profile=mcp-app`, Erweiterung `io.modelcontextprotocol/ui`),
die ein Host mit MCP-Apps-Unterstützung in einem abgeschotteten Rahmen zeigt:

| Ressource | Gehört zu | Inhalt |
|---|---|---|
| `ui://reqman/proposal.html` | `propose_text_change`, `propose_new_requirement`, `propose_link` | Vorschlagskarte: Bisher/Vorschlag (Wortvergleich), Begründung, Status; Knöpfe „Übernehmen“/„Ablehnen“ nur, wenn der Benutzer editor/admin ist |
| `ui://reqman/impact.html` | `analyze_impact` | abhängige, übergeordnete und ähnliche Anforderungen |

- **Text bleibt:** Die Werkzeuge liefern den gleichen Text wie ohne Apps. Nur wenn der Host MCP Apps aushandelt
  (`client_supports_apps`), kommen die Daten der Ansicht zusätzlich als `structuredContent`; andere Hosts verlieren nichts.
- **Knöpfe:** `accept_proposal` und `reject_proposal` sind nur für die Ansicht gedacht (`visibility: ["app"]`; ein
  Host zeigt sie dem Agenten nicht). Rolle und veraltete Vorschläge prüft das Backend (403/409). Der Agent selbst
  entscheidet also weiterhin nichts.
- **Aufbau:** `views\*.html` (eine Datei je Ansicht, ohne externe Skripte, Texte nur über `textContent`),
  `viewsridge.js` (Verbindung zum Host, JSON-RPC über `postMessage`), `viewsase.css`; `server.py` setzt sie zusammen.
- **Geprüft** nur in einer eigenen Minimal-Hülle (Ablauf `ui/initialize`, Tool-Ergebnis, Knopfklick, helles/dunkles
  Theme), **nicht** in Claude, ChatGPT, VS Code oder Goose. Siehe `experimente\B4_mcp_apps.md`.

## Einrichtung

1. Eigene Umgebung (nicht die des Backends):

   ```bash
   cd mcp_server
   python -m venv .venv
   .venv/Scripts/python -m pip install -r requirements.txt     # macOS/Linux: .venv/bin/python
   ```

2. In ReqMan einen eigenen Benutzer für den Agenten anlegen (Administration, Rolle `viewer` reicht für die
   lesenden Werkzeuge; `check_requirement_quality` braucht `editor`).
3. Backend starten (`http://localhost:8000`) und das Embedding-Modell laden (`ollama pull bge-m3`), sonst
   antworten Suche, Ähnliche, Link-Vorschläge und Auswirkungen mit einem Hinweis.

**Zugangsdaten stehen nur in der Konfiguration des MCP-Clients, nie im Repo.**

Umgebungsvariablen: `REQMAN_URL` (Standard `http://localhost:8000`), `REQMAN_USER`, `REQMAN_PASSWORD`,
optional `REQMAN_PROJECT` (Standardprojekt, Name oder ID).

### Claude Code

```bash
claude mcp add reqman --env REQMAN_USER=<agent> --env REQMAN_PASSWORD=<passwort> -- <Pfad>/mcp_server/.venv/Scripts/python <Pfad>/mcp_server/server.py
```

### Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "reqman": {
      "command": "<Pfad>\\mcp_server\\.venv\\Scripts\\python.exe",
      "args": ["<Pfad>\\mcp_server\\server.py"],
      "env": { "REQMAN_URL": "http://localhost:8000", "REQMAN_USER": "<agent>", "REQMAN_PASSWORD": "<passwort>" }
    }
  }
}
```

### VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "reqman": {
      "type": "stdio",
      "command": "<Pfad>/mcp_server/.venv/Scripts/python",
      "args": ["<Pfad>/mcp_server/server.py"],
      "env": { "REQMAN_USER": "<agent>", "REQMAN_PASSWORD": "<passwort>" }
    }
  }
}
```

### Ausprobieren ohne Agent

```bash
cd mcp_server && .venv/Scripts/mcp dev server.py     # Inspector im Browser
```

## Tests

```bash
cd mcp_server && .venv/Scripts/python -m pytest -q    # ohne laufendes Backend
```

## Hinweise

- Bei stdio ist stdout der Protokollkanal: im Server kein `print()`, Protokoll nur über `logging` (stderr).
- Fehlt etwas, zuerst den REST-Endpunkt in ReqMan ergänzen, nicht Logik im MCP-Server nachbauen.
