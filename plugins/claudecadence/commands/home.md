---
description: Open the cross-project ClaudeCadence home — every cadence you've started, with status filters
---

Start the ClaudeCadence hub server — the home page that lists every project where you've ever opened a Claude Code session with this plugin enabled, with active / stale / inactive status.

Run:

```bash
HUB_DIR="${CLAUDECADENCE_HUB_DIR:-$HOME/.claude/cadence}"
mkdir -p "$HUB_DIR"
LOG="$HUB_DIR/.server.log"
PIDFILE="$HUB_DIR/.server.pid"
PORTFILE="$HUB_DIR/.server.port"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  PORT=$(cat "$PORTFILE" 2>/dev/null || echo 4173)
  echo "ClaudeCadence hub already running (pid $(cat "$PIDFILE")) on port $PORT."
  echo "Open: http://localhost:$PORT/"
  exit 0
fi

DETACH=$(command -v setsid || echo "nohup")
$DETACH python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" --hub --no-open \
  > "$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PIDFILE"

for i in 1 2 3 4 5 6 7 8; do
  if [ -f "$PORTFILE" ]; then break; fi
  sleep 0.25
done

if [ ! -f "$PORTFILE" ]; then
  echo "[claudecadence] hub didn't start within 2s. Last 20 lines of log:"
  tail -20 "$LOG" 2>/dev/null || echo "(no log)"
  rm -f "$PIDFILE"
  exit 2
fi

PORT=$(cat "$PORTFILE")
echo "ClaudeCadence hub started (pid $PID) on port $PORT."
echo "Open: http://localhost:$PORT/"
echo "Log:  $LOG"
echo "Stop with: /claudecadence:stop"
```

This serves `~/.claude/cadence/` — the cross-project home page. Click any cadence card to dive into that project's timeline. Filter by status (active / stale / inactive) or search by name / path.

Stop the server with `/claudecadence:stop`.
