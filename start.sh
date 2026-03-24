#!/usr/bin/env bash
# ReqMan Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── KI-Provider Konfiguration ────────────────────────────────────────────────
# Nutzung: ./start.sh [--provider anthropic|ollama|openai] [--model <modell>]
# Alternativ: AI_PROVIDER=ollama ./start.sh

AI_PROVIDER="${AI_PROVIDER:-}"
AI_MODEL="${AI_MODEL:-}"
AI_BASE_URL="${AI_BASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --provider) AI_PROVIDER="$2"; shift 2 ;;
    --model)    AI_MODEL="$2";    shift 2 ;;
    --base-url) AI_BASE_URL="$2"; shift 2 ;;
    *) echo "Unbekannte Option: $1"; exit 1 ;;
  esac
done

# Standardwerte je Provider
if [ -z "$AI_PROVIDER" ]; then
  AI_PROVIDER="anthropic"
fi

if [ -z "$AI_MODEL" ]; then
  case "$AI_PROVIDER" in
    anthropic) AI_MODEL="claude-sonnet-4-6" ;;
    ollama)    AI_MODEL="llama3.2" ;;
    openai)    AI_MODEL="gpt-4o-mini" ;;
    *)         AI_MODEL="" ;;
  esac
fi

if [ -z "$AI_BASE_URL" ] && [ "$AI_PROVIDER" = "ollama" ]; then
  AI_BASE_URL="http://localhost:11434/v1"
fi

export AI_PROVIDER AI_MODEL AI_BASE_URL

# ── Voraussetzungen prüfen ───────────────────────────────────────────────────
echo "╔══════════════════════════════════════════╗"
echo "║         ReqMan - Requirements Mgmt       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  KI-Provider : $AI_PROVIDER"
echo "  Modell      : $AI_MODEL"
if [ -n "$AI_BASE_URL" ]; then
echo "  Endpunkt    : $AI_BASE_URL"
fi
echo ""

command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 not found. Please install Python 3.10+"; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "❌ Node.js not found. Please install Node.js 18+"; exit 1; }

# Ollama-Erreichbarkeit prüfen
if [ "$AI_PROVIDER" = "ollama" ]; then
  BASE="${AI_BASE_URL%/v1}"
  if ! curl -sf "$BASE/api/tags" >/dev/null 2>&1; then
    echo "⚠️  Ollama nicht erreichbar unter $BASE"
    echo "   Starte Ollama mit: ollama serve"
    echo "   Oder wechsle Provider: ./start.sh --provider anthropic"
    echo ""
  else
    echo "  ✓ Ollama erreichbar"
  fi
fi

# API-Key Warnung
if [ "$AI_PROVIDER" = "anthropic" ] && [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  ANTHROPIC_API_KEY nicht gesetzt – KI-Qualitätsprüfung nicht verfügbar"
  echo ""
fi
if [ "$AI_PROVIDER" = "openai" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "⚠️  OPENAI_API_KEY nicht gesetzt – KI-Qualitätsprüfung nicht verfügbar"
  echo ""
fi

# ── Backend Setup ────────────────────────────────────────────────────────────
echo "🔧 Setting up backend..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "  Creating Python virtual environment..."
  python3 -m venv .venv
fi

.venv/bin/pip install -q -r requirements.txt
echo "  ✓ Backend dependencies installed"

# ── Frontend Setup ───────────────────────────────────────────────────────────
echo "🔧 Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages (this may take a few minutes)..."
  npm install
fi
echo "  ✓ Frontend dependencies installed"

# ── Services starten ─────────────────────────────────────────────────────────
echo ""
echo "🚀 Starting services..."

# Port freigeben
lsof -ti tcp:8000 | xargs kill -9 2>/dev/null || true

cd "$BACKEND_DIR"
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"

cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
echo "  ✓ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "══════════════════════════════════════════"
echo "  Backend API:  http://localhost:8000"
echo "  API Docs:     http://localhost:8000/docs"
echo "  Frontend:     http://localhost:5173"
echo ""
echo "  Default Login: admin / admin123"
echo "══════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

cleanup() {
  echo ""
  echo "Stopping services..."
  kill $BACKEND_PID  2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "✓ Stopped"
  exit 0
}

trap cleanup SIGINT SIGTERM
wait
