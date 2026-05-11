---
description: Show ClaudeCadence status (node count, server state, viewer location)
---

Print the current ClaudeCadence status for this project.

Run:

```bash
NODES_FILE="$CLAUDE_PROJECT_DIR/.claude/cadence/data/nodes.js"
COUNT=$([ -f "$NODES_FILE" ] && grep -o '"id"' "$NODES_FILE" | wc -l | tr -d ' ' || echo 0)
SERVING=$(lsof -ti:4173 -nP 2>/dev/null | head -1)
PLUGIN_JSON="$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json"
VERSION=$([ -f "$PLUGIN_JSON" ] && grep '"version"' "$PLUGIN_JSON" | head -1 | sed 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/' || echo "unknown")
LATEST_CACHED=$(ls ~/.claude/plugins/cache/claudecadence/claudecadence/ 2>/dev/null | sort -V | tail -1)

echo "ClaudeCadence — project: $(basename "$CLAUDE_PROJECT_DIR")"
echo "Running version: $VERSION$([ "$VERSION" != "$LATEST_CACHED" ] && [ -n "$LATEST_CACHED" ] && echo "  (latest cached: $LATEST_CACHED — /reload-plugins to pick up)")"
echo "Nodes recorded:  $COUNT"
echo "Data file:       $NODES_FILE"
echo "Server:          $([ -n "$SERVING" ] && echo "running (pid $SERVING) — http://localhost:4173/" || echo "not running — /claudecadence:serve to start")"
```
