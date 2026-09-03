#!/usr/bin/env bash
# Helper used by the /ssp:config slash command. Usage: ssp.sh <config|install|render-test>
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PORT="${SSP_PORT:-4877}"
URL="http://127.0.0.1:${PORT}"
BUN="$(command -v bun || true)"
[ -n "$BUN" ] || { echo "bun not found in PATH — install from https://bun.sh"; exit 1; }

open_url() {
  case "$(uname -s)" in
    Darwin) open "$URL" ;;
    Linux) xdg-open "$URL" >/dev/null 2>&1 || echo "open $URL in your browser" ;;
    *) echo "open $URL in your browser" ;;
  esac
}

case "${1:-config}" in
  config)
    if curl -sf --max-time 1 "$URL/api/widgets" >/dev/null 2>&1; then
      echo "configurator already running → $URL"
    else
      [ -f "$ROOT/web/dist/index.html" ] || echo "note: web/dist missing in $ROOT — run 'bun run build:web' there, API will still work"
      LOG="${TMPDIR:-/tmp}/claude-code-ssp-serve.log"
      nohup "$BUN" "$ROOT/src/cli/main.ts" serve --port "$PORT" >"$LOG" 2>&1 &
      disown || true
      for _ in $(seq 1 40); do
        curl -sf --max-time 1 "$URL/api/widgets" >/dev/null 2>&1 && break
        perl -e 'select(undef,undef,undef,0.1)'
      done
      if curl -sf --max-time 1 "$URL/api/widgets" >/dev/null 2>&1; then
        echo "configurator started → $URL (log: $LOG)"
      else
        echo "failed to start; log:"; cat "$LOG"; exit 1
      fi
    fi
    open_url
    ;;
  install)
    "$BUN" "$ROOT/src/cli/main.ts" install "${@:2}"
    ;;
  render-test)
    COLUMNS="${COLUMNS:-120}" "$BUN" "$ROOT/src/cli/main.ts" render --fixture "$ROOT/src/fixtures/basic.json"
    ;;
  *)
    echo "usage: ssp.sh <config|install|render-test>"; exit 2 ;;
esac
