#!/usr/bin/env bash
# ReqMan Startup Script
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "╔══════════════════════════════════════════╗"
echo "║         ReqMan - Requirements Mgmt       ║"
echo "╚══════════════════════════════════════════╝"

# Check for required tools
command -v python3 >/dev/null 2>&1 || { echo "❌ Python 3 not found. Please install Python 3.10+"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Please install Node.js 18+"; exit 1; }

# Setup backend
echo ""
echo "🔧 Setting up backend..."

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "  Creating Python virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt
echo "  ✓ Backend dependencies installed"

# Setup frontend
echo ""
echo "🔧 Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages (this may take a few minutes)..."
  npm install
fi
echo "  ✓ Frontend dependencies installed"

# Start services
echo ""
echo "🚀 Starting services..."

# Start backend in background
cd "$BACKEND_DIR"
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  ✓ Backend started (PID: $BACKEND_PID)"

# Start frontend dev server
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

# Wait and cleanup
cleanup() {
  echo ""
  echo "Stopping services..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  echo "✓ Stopped"
  exit 0
}

trap cleanup SIGINT SIGTERM
wait
