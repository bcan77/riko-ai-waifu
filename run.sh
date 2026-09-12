#!/usr/bin/env bash
set -euo pipefail

# Waifu MMD — one-command runner (desktop mode by default)
# Usage:
#   ./run.sh                # desktop dev: vite :5173 + Electron (backend auto-started on :8000)
#   ./run.sh --web          # web dev: uvicorn :8000 + vite :5173 (no Electron)
#   ./run.sh --desktop      # same as default (explicit)
#   ./run.sh --build        # build + run desktop production (dist + electron)
#   ./run.sh --headless     # desktop with --no-sandbox --disable-gpu (servers / CI)
#   ./run.sh --install      # force npm/pip reinstall (combine with any mode)
#   ./run.sh --backend      # backend only
#   ./run.sh --frontend     # frontend (vite) only

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

MODE="desktop"
FORCE_INSTALL=0
HEADLESS=0
ONLY_BACKEND=0
ONLY_FRONTEND=0

for arg in "$@"; do
  case "$arg" in
    --web)       MODE="web" ;;
    --desktop)   MODE="desktop" ;;
    --build)     MODE="build" ;;
    --headless)  HEADLESS=1 ;;
    --install)   FORCE_INSTALL=1 ;;
    --backend)   ONLY_BACKEND=1; MODE="web" ;;
    --frontend)  ONLY_FRONTEND=1; MODE="web" ;;
    -h|--help)
      echo "Waifu MMD — one-command runner (desktop mode by default)"
      echo "Usage:"
      echo "  ./run.sh                # desktop dev: vite :5173 + Electron (backend auto-started on :8000)"
      echo "  ./run.sh --web          # web dev: uvicorn :8000 + vite :5173 (no Electron)"
      echo "  ./run.sh --desktop      # same as default (explicit)"
      echo "  ./run.sh --build        # build + run desktop production (dist + electron)"
      echo "  ./run.sh --headless     # desktop with --no-sandbox --disable-gpu (servers / CI)"
      echo "  ./run.sh --install      # force npm/pip reinstall (combine with any mode)"
      echo "  ./run.sh --backend      # backend only"
      echo "  ./run.sh --frontend     # frontend (vite) only"
      trap - INT TERM EXIT
      exit 0
      ;;
    *) echo "Unknown arg: $arg (try --help)" >&2; exit 1 ;;
  esac
done

need_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }

cleanup() {
  echo ""
  echo "[run] shutting down..."
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# --- common setup -----------------------------------------------------------
setup_backend() {
  echo "[run] backend setup..."
  if [[ ! -f backend/.env && -f backend/.env.example ]]; then
    echo "[run] creating backend/.env from .env.example (add OPENROUTER_API_KEY / GROQ_API_KEY)"
    cp backend/.env.example backend/.env
  fi
  if [[ ! -d backend/.venv ]]; then
    echo "[run] creating backend/.venv..."
    python3 -m venv backend/.venv
  fi
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
  if [[ $FORCE_INSTALL -eq 1 ]] || ! python -c "import fastapi" 2>/dev/null; then
    echo "[run] pip install -r backend/requirements.txt..."
    pip install -q -r backend/requirements.txt
  fi
}

setup_viewer() {
  echo "[run] waifu-viewer setup..."
  if [[ $FORCE_INSTALL -eq 1 ]] || [[ ! -d waifu-viewer/node_modules ]]; then
    echo "[run] npm install --prefix waifu-viewer..."
    npm install --prefix waifu-viewer 2>&1 | tail -5
  fi
}

setup_desktop() {
  echo "[run] desktop setup..."
  if [[ $FORCE_INSTALL -eq 1 ]] || [[ ! -d apps/desktop/node_modules ]]; then
    echo "[run] npm install --prefix apps/desktop..."
    npm install --prefix apps/desktop 2>&1 | tail -5
  fi
  # root workspaces (scripts)
  if [[ $FORCE_INSTALL -eq 1 ]] || [[ ! -d node_modules ]]; then
    npm install 2>&1 | tail -5 || true
  fi
}

# --- launchers --------------------------------------------------------------
kill_port_5173() {
  # Kill stale vite on :5173 that causes "Port 5173 is in use on wildcard but localhost available"
  # and makes wait-on succeed via old server → Electron sees stale content / exits 0.
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti:5173 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      echo "[run] killing stale process on :5173 ($pids)..."
      kill $pids 2>/dev/null || true
      sleep 1
      # force if still there
      pids=$(lsof -ti:5173 2>/dev/null || true)
      if [[ -n "$pids" ]]; then kill -9 $pids 2>/dev/null || true; fi
      sleep 1
    fi
  elif command -v fuser >/dev/null 2>&1; then
    fuser -k 5173/tcp 2>/dev/null || true
    sleep 1
  fi
  # also kill leftover concurrently/electron/vite procs from previous run.sh
  pkill -f "vite.*5173" 2>/dev/null || true
}

start_desktop_dev() {
  echo ""
  echo "[run] launching DESKTOP dev"
  echo "[run]   vite     -> http://localhost:5173 (host:true)"
  echo "[run]   backend  -> auto-started by Electron (probe :8000, fallback :8001)"
  echo "[run]   Electron -> desktop window"
  echo ""
  kill_port_5173
  if [[ $HEADLESS -eq 1 || -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
    echo "[run] headless/no DISPLAY detected — Electron will use --no-sandbox --disable-gpu"
    if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" && $HEADLESS -eq 0 ]]; then
      echo "[run] tip: run with --headless or set DISPLAY, otherwise window may not appear"
    fi
  fi
  # concurrently handles vite + electron; electron/main.js auto-spawns backend
  if [[ $HEADLESS -eq 1 ]]; then
    npm --prefix apps/desktop run dev:vite &
    VITE_PID=$!
    echo "[run] waiting for vite :5173..."
    npx --prefix apps/desktop wait-on http://127.0.0.1:5173 --timeout 30000
    npx --prefix apps/desktop electron apps/desktop --no-sandbox --disable-gpu &
    ELECTRON_PID=$!
    wait -n $VITE_PID $ELECTRON_PID 2>/dev/null || true
    wait 2>/dev/null || true
  else
    exec npm --prefix apps/desktop run dev
  fi
}

start_desktop_build() {
  echo "[run] building desktop production..."
  npm --prefix waifu-viewer run build
  # electron-builder packs from apps/desktop
  npm --prefix apps/desktop run build
  echo "[run] starting built Electron..."
  if [[ $HEADLESS -eq 1 ]]; then
    exec npm --prefix apps/desktop run start:headless
  else
    exec npm --prefix apps/desktop run start
  fi
}

start_web_backend_only() {
  setup_backend
  echo "[run] backend only -> http://localhost:${PORT:-8000}/health"
  # shellcheck disable=SC1091
  source backend/.venv/bin/activate
  exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "${PORT:-8000}" --reload
}

start_web_frontend_only() {
  setup_viewer
  echo "[run] frontend only -> http://localhost:5173"
  exec npm --prefix waifu-viewer run dev -- --host 0.0.0.0 --port 5173
}

start_web_both() {
  setup_backend
  setup_viewer
  echo ""
  echo "[run] starting WEB mode (Ctrl+C to stop)"
  echo "[run]   frontend -> http://localhost:5173"
  echo "[run]   backend  -> http://localhost:${PORT:-8000}/health"
  echo "[run]   ws       -> ws://localhost:${PORT:-8000}/ws/talk"
  echo ""

  # backend bg
  (
    # shellcheck disable=SC1091
    source backend/.venv/bin/activate
    exec python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port "${PORT:-8000}" --reload
  ) &
  BACKEND_PID=$!
  sleep 2
  ( exec npm --prefix waifu-viewer run dev -- --host 0.0.0.0 --port 5173 ) &
  FRONTEND_PID=$!
  wait -n $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null || true
}

# === main ===================================================================
if [[ $ONLY_BACKEND -eq 1 ]]; then
  need_cmd python3
  start_web_backend_only
elif [[ $ONLY_FRONTEND -eq 1 ]]; then
  need_cmd npm
  start_web_frontend_only
else
  case "$MODE" in
    desktop)
      need_cmd python3; need_cmd npm
      # electron needs display for window; still allow --headless
      setup_backend
      setup_viewer
      setup_desktop
      start_desktop_dev
      ;;
    web)
      need_cmd python3; need_cmd npm
      start_web_both
      ;;
    build)
      need_cmd npm; need_cmd python3
      setup_backend
      setup_viewer
      setup_desktop
      start_desktop_build
      ;;
  esac
fi
