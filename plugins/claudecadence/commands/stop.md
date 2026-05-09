---
description: Stop any running ClaudeCadence local viewer server
---

Stop any ClaudeCadence server running for this project or in hub mode.

Run:

```bash
PORT=4173
KILLED=0
for PIDFILE in \
  "$CLAUDE_PROJECT_DIR/.claude/cadence/.server.pid" \
  "${CLAUDECADENCE_HUB_DIR:-$HOME/.claude/cadence}/.server.pid"
do
  if [ -f "$PIDFILE" ]; then
    PID=$(cat "$PIDFILE")
    if kill "$PID" 2>/dev/null; then
      echo "stopped pid $PID ($PIDFILE)"
      KILLED=1
    fi
    rm -f "$PIDFILE"
  fi
done
# Belt-and-suspenders: also kill anything still bound to the port.
PORTPIDS=$(lsof -ti :"$PORT" -nP 2>/dev/null || true)
if [ -n "$PORTPIDS" ]; then
  echo "$PORTPIDS" | xargs kill 2>/dev/null && echo "freed port $PORT" && KILLED=1
fi
[ "$KILLED" = 0 ] && echo "Nothing to stop on port $PORT."
```
