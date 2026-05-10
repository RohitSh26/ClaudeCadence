---
description: Start the per-project ClaudeCadence viewer for this project
---

Start the ClaudeCadence timeline viewer for the current project.

Run this single bash command (the server detaches with `setsid` so it survives the slash command return; the chosen port is picked automatically if 4173 is taken):

```bash
PROJECT="$CLAUDE_PROJECT_DIR"
mkdir -p "$PROJECT/.claude/cadence"
LOG="$PROJECT/.claude/cadence/.server.log"
PIDFILE="$PROJECT/.claude/cadence/.server.pid"
PORTFILE="$PROJECT/.claude/cadence/.server.port"

# Already running and the PID is alive? Nothing to do.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  PORT=$(cat "$PORTFILE" 2>/dev/null || echo 4173)
  echo "ClaudeCadence already running (pid $(cat "$PIDFILE")) on port $PORT."
  echo "Open: http://localhost:$PORT/"
  exit 0
fi

# Detach so it survives the Claude Code Bash tool returning. setsid is
# the most robust way; nohup falls back if setsid isn't on the box.
DETACH=$(command -v setsid || echo "nohup")
$DETACH python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" "$PROJECT" --no-open \
  > "$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"

# Wait briefly for the server to write the port file.
for i in 1 2 3 4 5 6 7 8; do
  if [ -f "$PORTFILE" ]; then break; fi
  sleep 0.25
done

if [ ! -f "$PORTFILE" ]; then
  echo "[claudecadence] server didn't start within 2s. Last 20 lines of log:"
  tail -20 "$LOG" 2>/dev/null || echo "(no log)"
  rm -f "$PIDFILE"
  exit 2
fi

PORT=$(cat "$PORTFILE")
echo "ClaudeCadence started (pid $PID) on port $PORT."
echo "Open: http://localhost:$PORT/"
echo "Log:  $LOG"
echo "Stop with: /claudecadence:stop"
```

The server runs in the background. The viewer auto-refreshes every 5 seconds — refresh your browser tab any time you want to see the latest. Stop the server with `/claudecadence:stop`.

If port 4173 is taken, the server auto-walks up to 4181 and prints the chosen port. If you're remote (Tailscale / SSH tunnel), forward whatever port it printed.
