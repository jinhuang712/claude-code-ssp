#!/usr/bin/env bash
# Headless smoke test of the web configurator.
#
#   scripts/ui-smoke.sh [output-dir]
#
# Needs playwright-cli (npm i -g @playwright/cli) and Chrome (see .playwright/cli.config.json).
# Starts `serve --sandbox` on a spare port — throwaway copies, never your real config or
# settings.json — then checks: a clean console, Tab reaches the footer without getting stuck, both
# drawers open with focus inside and close on Esc, and no horizontal scroll at 1440/1024/720/390.
# Full-page screenshots land in the output dir so a human can eyeball the result.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${SMOKE_PORT:-4893}"
OUT="${1:-$(mktemp -d "${TMPDIR:-/tmp}/ssp-ui-smoke.XXXXXX")}"
SESSION="ssp-ui-smoke"
mkdir -p "$OUT"
command -v playwright-cli >/dev/null || { echo "playwright-cli not found: npm i -g @playwright/cli"; exit 2; }

bun "$ROOT/src/cli/main.ts" serve --sandbox --port "$PORT" >"$OUT/serve.log" 2>&1 &
SERVER=$!
cleanup() {
  kill "$SERVER" 2>/dev/null || true
  playwright-cli -s="$SESSION" close >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 50); do
  curl -sf --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.1
done
curl -sf --max-time 1 "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "sandbox server did not start:"; cat "$OUT/serve.log"; exit 1; }

# The snippet can't take arguments, so bake the URL and output dir into a copy.
sed "s#__URL__#http://127.0.0.1:$PORT#; s#__OUT__#$OUT#" "$ROOT/scripts/ui-smoke.js" >"$OUT/smoke.js"
playwright-cli -s="$SESSION" open "http://127.0.0.1:$PORT" >/dev/null
report="$(playwright-cli -s="$SESSION" --raw run-code --filename="$OUT/smoke.js")"
echo "$report"
if printf '%s' "$report" | grep -q '\\"ok\\":true\|"ok":true'; then
  echo "UI smoke passed — screenshots in $OUT"
else
  echo "UI smoke FAILED — screenshots and serve.log in $OUT"
  exit 1
fi
