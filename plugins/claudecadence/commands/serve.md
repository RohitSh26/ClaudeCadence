---
description: Start the per-project ClaudeCadence viewer (http server) for this project
---

Start the ClaudeCadence timeline viewer for the current project.

Run this single bash command (note: redirects + nohup background the server so this slash command returns immediately):

```bash
PORT=4173
PIDFILE="$CLAUDE_PROJECT_DIR/.claude/cadence/.server.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "ClaudeCadence already running (pid $(cat "$PIDFILE")). Open: http://localhost:$PORT/"
else
  mkdir -p "$CLAUDE_PROJECT_DIR/.claude/cadence"
  nohup python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" "$CLAUDE_PROJECT_DIR" --port "$PORT" --no-open \
    > "$CLAUDE_PROJECT_DIR/.claude/cadence/.server.log" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 0.6
  echo "ClaudeCadence started (pid $(cat "$PIDFILE")). Open: http://localhost:$PORT/"
  echo "Log: $CLAUDE_PROJECT_DIR/.claude/cadence/.server.log"
  echo "Stop with: /claudecadence:stop"
fi
```

The server runs in the background. The timeline auto-refreshes every 5 seconds — refresh your browser tab any time you want to see the latest. Stop the server with `/claudecadence:stop`.

If you're remote (Tailscale / SSH tunnel), forward port 4173 first, or set `CADENCE_PORT` to a different port and pass `--host 0.0.0.0` to the binary.
