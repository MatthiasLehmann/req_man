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
| `analyze_impact` | Was von einer Änderung betroffen wäre |
| `check_requirement_quality` | Qualitätsprüfung auslösen – **speichert** das Ergebnis (nicht nur lesend) |
| `propose_text_change`, `propose_new_requirement`, `propose_link` | **Legen einen Vorschlag an**, ändern nichts; ein Mensch übernimmt oder lehnt ab (ReqMan → „Vorschläge“). Begründung Pflicht |
| `reqman_help` | Wie etwas in ReqMan bedient wird |

Prompts: `einstieg(project)`, `review_dokument(project, document)`. Alle lesenden Werkzeuge sind als
`read_only` markiert; der Server ändert keine Anforderungen. Vorschläge dürfen auch `viewer` anlegen,
übernehmen dürfen nur `editor` und `admin` – in der ReqMan-Oberfläche.

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
