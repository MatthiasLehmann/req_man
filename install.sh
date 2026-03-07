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
python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt
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
