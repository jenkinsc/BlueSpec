#!/usr/bin/env bash
# Run BlueSpec e2e test suite
# Usage: bash packages/web/e2e/run_tests.sh [pytest-args...]
# Example: bash packages/web/e2e/run_tests.sh -v --tb=short -k test_auth
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
E2E_DIR="$REPO_ROOT/packages/web/e2e"

# ---- Dependency check ----
if ! python3 -c "import playwright" 2>/dev/null; then
  echo "Installing playwright..."
  pip3 install playwright --quiet
  python3 -m playwright install chromium
fi
if ! python3 -c "import pytest" 2>/dev/null; then
  echo "Installing pytest..."
  pip3 install pytest --quiet
fi

# ---- Start servers ----
API_LOG=$(mktemp)
WEB_LOG=$(mktemp)

cleanup() {
  echo "Stopping servers..."
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
  wait "$API_PID" "$WEB_PID" 2>/dev/null || true
  rm -f "$API_LOG" "$WEB_LOG"
}
trap cleanup EXIT

cd "$REPO_ROOT"
npm run dev:api >"$API_LOG" 2>&1 &
API_PID=$!
npm run dev:web >"$WEB_LOG" 2>&1 &
WEB_PID=$!

# ---- Wait for API (port 3000) ----
echo "Waiting for API on :3000..."
for i in $(seq 1 40); do
  nc -z 127.0.0.1 3000 2>/dev/null && break
  sleep 1
done
nc -z 127.0.0.1 3000 2>/dev/null || { echo "API did not start"; cat "$API_LOG"; exit 1; }

# ---- Wait for Web (port 5173) ----
echo "Waiting for web on :5173..."
for i in $(seq 1 40); do
  nc -z 127.0.0.1 5173 2>/dev/null && break
  sleep 1
done
nc -z 127.0.0.1 5173 2>/dev/null || { echo "Web did not start"; cat "$WEB_LOG"; exit 1; }

echo "Both servers ready. Running tests..."
sleep 1  # brief settle

# ---- Run tests ----
python3 -m pytest "$E2E_DIR/test_bluespec.py" -v --tb=short "$@"
