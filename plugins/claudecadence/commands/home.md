---
description: Open the cross-project ClaudeCadence home — every cadence you've started, with status filters
---

Start the ClaudeCadence hub server — the home page that lists every project where you've ever opened a Claude Code session with this plugin enabled, with active / stale / inactive status.

Run this single bash command (backgrounded so the slash command returns immediately):

```bash
PORT=4173
HUB_DIR="${CLAUDECADENCE_HUB_DIR:-$HOME/.claude/cadence}"
PIDFILE="$HUB_DIR/.server.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "ClaudeCadence hub already running (pid $(cat "$PIDFILE")). Open: http://localhost:$PORT/"
else
  mkdir -p "$HUB_DIR"
  nohup python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" --hub --port "$PORT" --no-open \
    > "$HUB_DIR/.server.log" 2>&1 &
  echo $! > "$PIDFILE"
  sleep 0.6
  echo "ClaudeCadence hub started (pid $(cat "$PIDFILE")). Open: http://localhost:$PORT/"
  echo "Log: $HUB_DIR/.server.log"
  echo "Stop with: /claudecadence:stop"
fi
```

This serves `~/.claude/cadence/` on port 4173. Click any cadence card to dive into that project's timeline. Filter by status (active / stale / inactive) or search by name / path.

Stop the server with `/claudecadence:stop`.
