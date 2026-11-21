#!/usr/bin/env bash
# One command to run the integrated app locally.
#   ./dev.sh            -> MODEL=mock (no API key; tutor gives grounded stub answers)
#   MODEL=anthropic ANTHROPIC_API_KEY=sk-... ./dev.sh   -> real tutor + real uploads
#
# Opens the whole experience at:   http://localhost:3000
# The frontend proxies /backend/* to the FastAPI backend on 127.0.0.1:8787.
set -euo pipefail
cd "$(dirname "$0")"

export MODEL="${MODEL:-mock}"
BACK_PORT="${BACK_PORT:-8787}"

echo "▶ backend  (FastAPI, MODEL=$MODEL) on http://127.0.0.1:$BACK_PORT"
( cd backend && python3 -m uvicorn lumina.app:app --host 127.0.0.1 --port "$BACK_PORT" ) &
BACK_PID=$!
trap 'kill $BACK_PID 2>/dev/null || true' EXIT INT TERM

echo "▶ frontend (Next.js) on  http://localhost:3000"
npm run dev
