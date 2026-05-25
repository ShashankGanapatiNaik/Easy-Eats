#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  start.sh — Easy Eats local dev (no Docker required)
#  Usage:  bash start.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${GREEN}🍔  Easy Eats — Local Dev Starter${NC}"
echo "────────────────────────────────────"

# ── Check prerequisites ───────────────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}✗  $1 not found. Please install it first.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓${NC}  $1 found"
}

echo ""
echo "Checking prerequisites…"
check_cmd python3
check_cmd pip3
check_cmd node
check_cmd npm

# ── Backend setup ─────────────────────────────────────────────────────────────

echo ""
echo "Setting up backend…"
cd "$BACKEND"

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
  echo "  Creating virtual environment…"
  python3 -m venv .venv
fi

# Activate
source .venv/bin/activate

# Install/update dependencies
echo "  Installing Python dependencies…"
pip install -q -r requirements.txt

# Check .env exists
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}  ⚠  .env not found. Copying from .env.example…${NC}"
  cp .env.example .env 2>/dev/null || true
  echo -e "${YELLOW}  ✏  Please edit backend/.env and add your MONGODB_URI, then re-run this script.${NC}"
  exit 1
fi

# Check MONGODB_URI is set
if grep -q "CHANGE_ME" .env; then
  echo ""
  echo -e "${RED}✗  backend/.env still has CHANGE_ME placeholders.${NC}"
  echo -e "   Open ${YELLOW}backend/.env${NC} and replace MONGODB_URI with your MongoDB Atlas connection string."
  echo ""
  echo "   Quick Atlas steps:"
  echo "   1. Go to cloud.mongodb.com → Create free M0 cluster"
  echo "   2. Security → Add your IP to Network Access"
  echo "   3. Security → Database Access → Add user with readWrite"
  echo "   4. Connect → Drivers → Python → copy the URI"
  echo "   5. Paste into backend/.env"
  echo ""
  exit 1
fi

echo -e "${GREEN}  ✓  Backend ready${NC}"

# ── Frontend setup ────────────────────────────────────────────────────────────

echo ""
echo "Setting up frontend…"
cd "$FRONTEND"

if [ ! -d "node_modules" ]; then
  echo "  Installing npm packages (first run — takes ~30 seconds)…"
  npm install --silent
else
  echo "  npm packages already installed"
fi

echo -e "${GREEN}  ✓  Frontend ready${NC}"

# ── Seed prompt ───────────────────────────────────────────────────────────────

echo ""
read -r -p "Seed demo data (stalls + menu + orders)? [y/N] " SEED
if [[ "$SEED" =~ ^[Yy]$ ]]; then
  cd "$BACKEND"
  source .venv/bin/activate
  echo "  Seeding…"
  python scripts/seed_demo.py
fi

# ── Start both servers ────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}Starting servers…${NC}"
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both."
echo "────────────────────────────────────"

# Start backend in background
cd "$BACKEND"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Small delay so backend starts before frontend
sleep 2

# Start frontend in background
cd "$FRONTEND"
npm run dev &
FRONTEND_PID=$!

# Trap Ctrl+C to kill both
cleanup() {
  echo ""
  echo "Stopping servers…"
  kill $BACKEND_PID  2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup INT TERM

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
