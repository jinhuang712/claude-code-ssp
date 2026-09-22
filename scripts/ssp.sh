#!/usr/bin/env bash
# Helper used by the /ssp:* slash commands. Usage: ssp.sh <config|reset|install|render-test>
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

nap() { perl -e 'select(undef,undef,undef,0.1)'; }
json_field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }

# web/dist is gitignored, so a pull leaves it missing or older than web/src.
web_stale() {
  [ -f "$ROOT/web/dist/index.html" ] || return 0
  [ -n "$(find "$ROOT/web/src" "$ROOT/web/index.html" -newer "$ROOT/web/dist/index.html" -print 2>/dev/null | head -1)" ]
}

# Sets REASON to why the server on $PORT can't be reused (empty = reuse it) and STALE_PID to its pid.
check_running() {
  REASON="" STALE_PID=""
  local h root
  h="$(curl -sf --max-time 1 "$URL/api/health" 2>/dev/null || true)"
  if [ -z "$h" ]; then
    REASON="older version"
    STALE_PID="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
    return
  fi
  STALE_PID="$(printf '%s' "$h" | json_field pid)"
  root="$(printf '%s' "$h" | json_field root)"
  if [ "$root" != "$ROOT_REAL" ]; then REASON="was serving $root"
  elif [ "$(printf '%s' "$h" | json_field codeChanged)" = "true" ]; then REASON="source changed since it started"
  fi
}

stop_server() {
  local pid="$1" cmd
  cmd="$(ps -o command= -p "$pid" 2>/dev/null || true)"
  case "$cmd" in
    *main.ts\ serve*|*claude-code-ssp*serve*) ;;
    *) echo "port $PORT is held by another program (pid $pid: ${cmd:-unknown}) — set SSP_PORT"; exit 1 ;;
  esac
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || return 0; nap; done
  kill -9 "$pid" 2>/dev/null || true
}

start_server() {
  nohup "$BUN" "$ROOT/src/cli/main.ts" serve --port "$PORT" >"$LOG" 2>&1 &
  disown || true
  for _ in $(seq 1 40); do
    curl -sf --max-time 1 "$URL/api/health" >/dev/null 2>&1 && return 0
    nap
  done
  echo "failed to start; log:"; cat "$LOG"; exit 1
}

case "${1:-config}" in
  config)
    ROOT_REAL="$(cd "$ROOT" && pwd -P)"
    TMP="${TMPDIR:-/tmp}"
    LOG="${TMP%/}/claude-code-ssp-serve.log"
    BUILD_LOG="${TMP%/}/claude-code-ssp-build.log"
    built=""
    if web_stale; then
      if { [ -d "$ROOT/web/node_modules" ] || "$BUN" install --cwd "$ROOT/web"; } >"$BUILD_LOG" 2>&1 \
        && "$BUN" run --cwd "$ROOT/web" build >>"$BUILD_LOG" 2>&1; then
        built="rebuilt web UI · "
      else
        echo "web UI build failed; log:"; tail -20 "$BUILD_LOG"; exit 1
      fi
    fi
    if curl -sf --max-time 1 "$URL/api/widgets" >/dev/null 2>&1; then
      check_running
      if [ -z "$REASON" ]; then
        echo "${built}configurator already running → $URL"
      else
        [ -n "$STALE_PID" ] || { echo "can't find the process on port $PORT ($REASON) — stop it and retry"; exit 1; }
        stop_server "$STALE_PID"
        start_server
        echo "${built}configurator restarted ($REASON) → $URL (log: $LOG)"
      fi
    else
      start_server
      echo "${built}configurator started → $URL (log: $LOG)"
    fi
    open_url
    ;;
  install)
    "$BUN" "$ROOT/src/cli/main.ts" install "${@:2}"
    ;;
  reset)
    "$BUN" "$ROOT/src/cli/main.ts" reset "${@:2}"
    ;;
  render-test)
    COLUMNS="${COLUMNS:-120}" "$BUN" "$ROOT/src/cli/main.ts" render --fixture "$ROOT/src/fixtures/basic.json"
    ;;
  *)
    echo "usage: ssp.sh <config|reset|install|render-test>"; exit 2 ;;
esac
