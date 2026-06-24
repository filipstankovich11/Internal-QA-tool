#!/usr/bin/env bash
# Dev launcher: start the Python API server alongside Vite so the frontend's
# /api/* calls work out of the box. The API is killed when Vite exits.
#
# Prefers python3.11 (the API uses `dict | None` syntax that needs Python 3.10+);
# falls back to python3 if 3.11 isn't installed.
set -u
cd "$(dirname "$0")/.."

PY="$(command -v python3.11 || command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "⚠  No python3 found — starting frontend only. Score/views/notify calls will fail."
else
  "$PY" api/score.py &
  API_PID=$!
  cleanup() { kill "$API_PID" 2>/dev/null; }
  trap cleanup EXIT INT TERM
  echo "▶  API server starting on :5001 (pid $API_PID)"
fi

npx vite "$@"
