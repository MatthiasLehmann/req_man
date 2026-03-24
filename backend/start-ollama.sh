#!/usr/bin/env bash
# Startet den Backend-Server mit Ollama als KI-Provider (llama3.3)

export AI_PROVIDER=ollama
export AI_MODEL=llama3.3
# AI_BASE_URL ist optional – Standard ist http://localhost:11434/v1

echo "KI-Provider : $AI_PROVIDER"
echo "Modell      : $AI_MODEL"
echo "Endpunkt    : ${AI_BASE_URL:-http://localhost:11434/v1 (Standard)}"
echo ""

uvicorn main:app --reload --host 0.0.0.0 --port 8000
