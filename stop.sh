#!/usr/bin/env bash
# ReqMan Stop Script – beendet alle laufenden ReqMan-Prozesse

echo "╔══════════════════════════════════════════╗"
echo "║         ReqMan - Stopping services       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

killed_any=false

# ── Prozesse anhand der Ports beenden ────────────────────────────────────────
# Backend: uvicorn auf Port 8000 | Frontend: Vite dev server auf Port 5173
for port in 8000 5173; do
  pids="$(lsof -ti tcp:"$port" 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "  Beende Prozess(e) auf Port $port: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null
    sleep 1
    # Falls noch am Leben: hart beenden
    still="$(lsof -ti tcp:"$port" 2>/dev/null)"
    if [ -n "$still" ]; then
      # shellcheck disable=SC2086
      kill -9 $still 2>/dev/null
    fi
    killed_any=true
  fi
done

# ── Restliche ReqMan-Prozesse anhand des Namens beenden ──────────────────────
# (falls auf anderen Ports gestartet oder verwaiste Prozesse)
for pattern in "uvicorn main:app" "vite"; do
  pids="$(pgrep -f "$pattern" 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "  Beende '$pattern': $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    killed_any=true
  fi
done

echo ""
if [ "$killed_any" = true ]; then
  echo "✓ ReqMan-Prozesse beendet"
else
  echo "ℹ️  Keine laufenden ReqMan-Prozesse gefunden"
fi
