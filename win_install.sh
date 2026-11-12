#!/usr/bin/env bash
# ReqMan Installation Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "╔══════════════════════════════════════════╗"
echo "║     ReqMan Installation                  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Backend
echo "📦 Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
# "python3" ist unter Windows meist nur der Microsoft-Store-Platzhalter –
# daher den py-Launcher bevorzugen (wird vom python.org-Installer mitgeliefert).
if command -v py >/dev/null 2>&1; then PY="py -3"; else PY="python"; fi
$PY -m venv .venv
# activate.bat wirkt in Git Bash nicht – pip direkt aus der venv aufrufen,
# sonst landen die Pakete im System-Python.
.venv/Scripts/python.exe -m pip install -q -r requirements.txt
echo "  ✓ Backend ready"

# Frontend
echo ""
echo "📦 Installing frontend dependencies..."
cd "$SCRIPT_DIR/frontend"
npm install
echo "  ✓ Frontend ready"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Installation abgeschlossen!             ║"
echo "║                                          ║"
echo "║  Starten mit: ./start.sh                 ║"
echo "╚══════════════════════════════════════════╝"
