"""Schreibt das OpenAPI-Schema der FastAPI-App als JSON-Datei (ohne laufenden Server).

Aufruf: python export_openapi.py <zieldatei>
Wird von `npm run generate:api` im Frontend genutzt, siehe docs/adr/0001-frontend-architektur.md.
"""
import json
import os
import sys

from pydantic import BaseModel

# Nur für den Import nötig; verhindert die Warnung über einen flüchtigen Schlüssel.
os.environ.setdefault("SECRET_KEY", "openapi-export")

# Felder mit Default (z. B. `reviewed: Optional[str] = None`) sind in Antworten immer
# enthalten, weil kein Endpunkt `response_model_exclude_unset/none` nutzt. Pydantic markiert sie
# im Schema standardmäßig trotzdem als optional. Diese Einstellung beschreibt das Ausgabeschema
# korrekt; FastAPI legt dann für Modelle, die in Request und Response vorkommen, getrennte
# „-Input"/„-Output"-Schemas an. Muss vor dem Import der Modelle gesetzt werden und ändert
# nur das Schema, nicht das Laufzeitverhalten.
BaseModel.model_config["json_schema_serialization_defaults_required"] = True

from main import app  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Aufruf: python export_openapi.py <zieldatei>")

    schema = app.openapi()
    # Nur die API: Der SPA-Fallback /{full_path} existiert nur, wenn frontend/dist gebaut ist,
    # und würde das Schema sonst vom Build-Zustand abhängig machen.
    schema["paths"] = {p: v for p, v in schema["paths"].items() if p.startswith("/api/")}

    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, ensure_ascii=False, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    main()
