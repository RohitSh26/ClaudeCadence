---
description: Stop any running ClaudeCadence local viewer server
---

Stop any ClaudeCadence server running for this project or in hub mode.

Run:

```bash
KILLED=0
for SCOPE in "project:$CLAUDE_PROJECT_DIR/.claude/cadence" "hub:${CLAUDECADENCE_HUB_DIR:-$HOME/.claude/cadence}"; do
  DIR="${SCOPE#*:}"
  TAG="${SCOPE%%:*}"
  PIDFILE="$DIR/.server.pid"
  PORTFILE="$DIR/.server.port"
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill "$PID" 2>/dev/null; then
      echo "stopped $TAG server (pid $PID, was on port $(cat "$PORTFILE" 2>/dev/null || echo "?"))"
      KILLED=1
    fi
    rm -f "$PIDFILE" "$PORTFILE"
  fi
done
[ "$KILLED" = 0 ] && echo "Nothing running."
```
