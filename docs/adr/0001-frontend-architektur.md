# ADR 0001: Frontend-Architektur – modulare SPA, generierter API-Client, KI als MCP-Client

- **Status:** Akzeptiert
- **Datum:** 2026-10-09
- **Betrifft:** `frontend/`, `backend/` (nur als API-Vertrag), Issues #22, #23

## Kontext

Das Backend (FastAPI, doorstop, SQLite) soll erhalten bleiben. Das Frontend soll sich weiterentwickeln
können, insbesondere in drei Richtungen: **Editor**, **Review** und **KI**. Dabei kam die Frage auf,
ob das Frontend in mehrere getrennte Frontends aufgeteilt werden soll.

Ausgangslage (Stand `fbb3c1e`):

- Eine React-SPA mit ca. 11.600 Zeilen TypeScript und 10 Seiten (`frontend/src/pages`).
- Ein handgeschriebener API-Client (`frontend/src/api/client.ts`, ca. 290 Zeilen) gegen `/api`.
- Authentifizierung per JWT im `localStorage` (`authStore`, Axios-Interceptor).
- nginx leitet `/api/` an das Backend und `/` an das Frontend weiter.
- Editor, Review und KI sind fachlich eng verzahnt: Review braucht die Darstellung des Editors
  (`MarkdownEditor`, `RequirementContent`), KI-Bewertungen hängen am einzelnen Item (`AiQualityTab`).
- Der Produktions-Build erzeugt einen Chunk über 500 kB.
- Entwicklung durch eine Person bzw. eine kleine BA-Gruppe, ein gemeinsamer Release-Takt.

## Entscheidung

### 1. Das Backend ist die stabile Schnittstelle

Die FastAPI-REST-API mit ihrem OpenAPI-Schema (`/openapi.json`) ist der Vertrag zwischen Backend und
allen Clients. Frontends greifen ausschließlich über diese API zu; Fachlogik wird nicht im Frontend
dupliziert.

### 2. API-Client aus OpenAPI generieren

Der handgeschriebene `client.ts` wird durch einen aus dem OpenAPI-Schema generierten, typisierten
Client ersetzt (z. B. `openapi-typescript` + `openapi-fetch` oder `orval`). Die Generierung läuft als
npm-Skript; Änderungen an der API führen so zu Typfehlern statt zu Laufzeitfehlern.

### 3. Eine modulare SPA statt mehrerer Frontends

Das Frontend bleibt vorerst **eine App**, wird aber nach Fachbereichen gegliedert:

```
frontend/src/
  features/
    editor/      Anforderungen, Dokumentstruktur, Linking, Simulink-Tab
    review/      Review-Status, Validierung
    ai/          KI-Qualitätsanalyse
    trace/       Traceability, Matrix, Metriken
    admin/       Benutzer, Attribute
    dashboard/   Projektübersicht
    help/        Hilfe und Workflow-Dokumentation
  shared/
    api/         API-Client, gegen generierte OpenAPI-Typen (schema.d.ts) typisiert
    types/       gemeinsame Typen
    auth/        Login, Token, Rollen
    store/       Projektauswahl
    layout/      Layout, Header, Sidebar
    ui/          kleine gemeinsame Komponenten (HelpTooltip)
    richtext/    TipTap-Editor, Anforderungsdarstellung, PlantUML
```

Regeln:

- Jedes Feature hat eine `index.ts` als öffentliche API. Seiten werden dort per `React.lazy`
  exportiert, sodass jede Seite ein eigener Chunk ist und nur ihre Bibliotheken nachlädt.
- `shared/` importiert nichts aus `features/`.
- Features importieren andere Features nur über deren `index.ts`, nie über tiefe Pfade.
  Beispiel: Der Editor bindet `ValidationBadge` aus `review` und `AiQualityTab` aus `ai` ein.
- Was mehrere Features brauchen und keinem fachlich gehört, wandert nach `shared/`.
- Die Regeln prüft `npm run check:boundaries` (`frontend/scripts/check-boundaries.mjs`).

### 4. KI als eigener Client über einen MCP-Server

Für KI-Agenten (Issues #22, #23) wird keine zusätzliche Web-Oberfläche gebaut, sondern ein
**MCP-Server**, der die req_man-API als Werkzeuge bereitstellt (z. B. Items lesen, Traces abfragen,
Review-Kommentare vorschlagen). Er ist ein weiterer Client des Backends, wie die SPA.

Leitlinie: Schreibende Aktionen des Agenten sind Vorschläge; Freigaben bleiben bei Menschen bzw.
deterministischen Prüfungen.

## Betrachtete Alternativen

| Option | Bewertung |
|---|---|
| **Status quo** (eine SPA, unstrukturiert) | Grenzen zwischen Editor, Review und KI verschwimmen weiter; großes Bundle. Verworfen. |
| **Monorepo mit mehreren Apps** (`apps/editor`, `apps/review`, `packages/*`; pnpm/npm Workspaces, optional Turborepo/Nx) | Sauber, aber derzeit Mehraufwand (Builds, Routing, Versionierung) ohne entsprechenden Nutzen. **Zielbild für später**, siehe „Auslöser für eine Neubewertung". |
| **Micro-Frontends zur Laufzeit** (Module Federation, single-spa) | Lohnt sich bei mehreren Teams mit eigenem Release-Takt (z. B. Zalando, IKEA). Für req_man unverhältnismäßig. Verworfen. |
| **Separate KI-Weboberfläche** | Dupliziert Darstellung und Bedienung; ein MCP-Server macht die Funktionen für beliebige Agenten nutzbar. Verworfen zugunsten von Entscheidung 4. |

Vergleichbare Vorbilder: doorstop selbst (ein Kern, Frontends für CLI, Desktop-GUI und Webserver),
Headless-CMS (Strapi, Contentful), Backstage und Grafana (Shell + Plugins).

## Konsequenzen

**Positiv**

- Die API wird zum expliziten, typisierten Vertrag – Voraussetzung für jedes weitere Frontend.
- Klare Grenzen im Code machen einen späteren Umzug einzelner Features in eigene Apps mechanisch.
- Kleinere Bundles durch Code-Splitting; die 500-kB-Warnung entfällt voraussichtlich.
- Der MCP-Server ist ein klar abgegrenztes Thema für die BA und ändert das Backend nicht.

**Negativ / Risiken**

- Einmaliger Umbau: Dateien verschieben, Importe anpassen, `client.ts`-Aufrufe ersetzen.
- Die Abhängigkeitsregeln müssen eingehalten werden; `npm run check:boundaries` prüft sie
  (bewusst ohne ESLint, um keine weitere Toolchain einzuführen).
- Der generierte Client ist nur so gut wie das OpenAPI-Schema: Endpunkte ohne Pydantic-Response-Modell
  liefern ungenaue Typen und müssen im Backend nachgeschärft werden.

## Umsetzungsschritte

1. ✅ API-Typen aus OpenAPI generieren (#27). Umgesetzt als reine Typgenerierung
   (`openapi-typescript`); axios und die Funktionen in `client.ts` bleiben, sind aber gegen das
   Schema typisiert. `shared/types` leitet sich aus den generierten Typen ab. `npm run check:api`
   erkennt veraltete Typen. Offen: Response-Modelle und Literal-Typen im Backend (#28).
2. ✅ Ordnerstruktur `features/` und `shared/` anlegen, Seiten und Komponenten verschieben (#25).
3. ✅ Seiten mit `React.lazy` laden (#25). Ergebnis: beim Start 272 kB JS statt 1.858 kB;
   ProseMirror als eigener Chunk, keine Chunk-Größenwarnung mehr.
4. ✅ Abhängigkeitsregeln per Skript absichern (#25).
5. MCP-Server-Prototyp mit lesenden Werkzeugen (Projekte, Dokumente, Items, Traces), danach
   vorschlagende Werkzeuge (Review-Kommentare, Qualitätsbewertung).

## Auslöser für eine Neubewertung

Der Schritt zum Monorepo mit mehreren Apps wird erneut geprüft, wenn mindestens einer dieser Punkte
eintritt:

- Ein Frontend hat eine eigene Nutzergruppe mit stark abweichender Bedienung
  (z. B. eine schlanke Review-App für externe Prüfer, ggf. mobil).
- Ein Teil des Frontends braucht einen eigenen Release-Takt.
- Mehrere Teams arbeiten parallel an verschiedenen Bereichen.

Für den Login gilt dann: Alle Apps laufen unter derselben Domain (nginx-Pfadrouting), oder der Token
wird in ein httpOnly-Cookie verlagert.
