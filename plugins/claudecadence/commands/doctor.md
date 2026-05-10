---
description: Diagnose ClaudeCadence — hooks, viewer files, server, and registry
---

Run a self-diagnostic. Prints a checklist showing what's healthy and what's not, with remediation hints.

```bash
PROJECT="$CLAUDE_PROJECT_DIR"
HUB_DIR="${CLAUDECADENCE_HUB_DIR:-$HOME/.claude/cadence}"
CD="$PROJECT/.claude/cadence"

echo "── ClaudeCadence doctor ──────────────────────────────"
echo ""
echo "PROJECT       $PROJECT"
echo "PLUGIN_ROOT   ${CLAUDE_PLUGIN_ROOT:-(unset — not in a Claude Code session?)}"
echo "HUB_DIR       $HUB_DIR"
echo ""

# 0. Node — required runtime (Claude Code already needs it)
echo "── Runtime"
if command -v node >/dev/null 2>&1; then
  echo "  ✓ node $(node --version)"
else
  echo "  ✗ node NOT on PATH"
  echo "    → install Node.js (https://nodejs.org). Claude Code itself needs it too."
fi

# 1. Plugin install reachable
echo ""
echo "── Plugin install"
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/bin/cadence-serve" ]; then
  echo "  ✓ binary at $CLAUDE_PLUGIN_ROOT/bin/cadence-serve"
else
  echo "  ✗ cadence-serve binary NOT found via \$CLAUDE_PLUGIN_ROOT"
  echo "    → run /reload-plugins; if still missing, /plugin install claudecadence@claudecadence"
fi

# 2. Per-project viewer
echo ""
echo "── Per-project viewer ($CD)"
if [ -d "$CD" ]; then
  for f in index.html _design.css _timeline.js data/nodes.js; do
    if [ -f "$CD/$f" ]; then
      echo "  ✓ $f ($(wc -c < "$CD/$f" | tr -d ' ') bytes)"
    else
      echo "  ✗ MISSING: $f"
    fi
  done
else
  echo "  ✗ $CD doesn't exist"
  echo "    → no hooks have fired yet in this project. Send any prompt to Claude."
fi

# 3. Server status
echo ""
echo "── Project server"
PIDFILE="$CD/.server.pid"
PORTFILE="$CD/.server.port"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  PID=$(cat "$PIDFILE"); PORT=$(cat "$PORTFILE" 2>/dev/null || echo "?")
  echo "  ✓ running (pid $PID, port $PORT)"
  echo "    → http://localhost:$PORT/"
else
  echo "  ✗ not running"
  echo "    → /claudecadence:serve to start it"
  if [ -f "$CD/.server.log" ]; then
    echo "    last 5 lines of .server.log:"
    sed 's/^/      /' "$CD/.server.log" | tail -5
  fi
fi

# 4. Hub
echo ""
echo "── Hub"
if [ -f "$HUB_DIR/registry.json" ]; then
  N=$(grep -o '"path"' "$HUB_DIR/registry.json" 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ registry.json present ($N cadences)"
else
  echo "  ✗ registry.json missing"
  echo "    → no projects registered yet"
fi

# 5. Hooks loaded?
echo ""
echo "── Hooks (rough check — look at /reload-plugins output for the truth)"
if [ -n "$CLAUDE_PLUGIN_ROOT" ] && [ -f "$CLAUDE_PLUGIN_ROOT/hooks/hooks.json" ]; then
  N=$(grep -o '"hooks"' "$CLAUDE_PLUGIN_ROOT/hooks/hooks.json" 2>/dev/null | wc -l | tr -d ' ')
  echo "  ✓ hooks.json declares $N event handlers"
else
  echo "  ✗ hooks.json not found"
fi

# 6. Recent activity
echo ""
echo "── Recent activity"
if [ -f "$CD/data/nodes.js" ]; then
  COUNT=$(grep -o '"id":' "$CD/data/nodes.js" 2>/dev/null | wc -l | tr -d ' ')
  LAST=$(grep -o '"ts":\s*"[^"]*"' "$CD/data/nodes.js" | tail -1 | sed 's/.*"\(.*\)"/\1/')
  echo "  $COUNT nodes recorded, last at $LAST"
else
  echo "  no nodes.js yet"
fi

echo ""
echo "──────────────────────────────────────────────────────"
```
