---
description: Show ClaudeCadence status (node count, server state, viewer location)
---

Print the current ClaudeCadence status for this project.

Run:

```bash
NODES_FILE="$CLAUDE_PROJECT_DIR/.claude/cadence/data/nodes.js"
COUNT=$([ -f "$NODES_FILE" ] && grep -o '"id"' "$NODES_FILE" | wc -l | tr -d ' ' || echo 0)
SERVING=$(lsof -ti:4173 -nP 2>/dev/null | head -1)

echo "ClaudeCadence — project: $(basename "$CLAUDE_PROJECT_DIR")"
echo "Nodes recorded: $COUNT"
echo "Data file:      $NODES_FILE"
echo "Server:         $([ -n "$SERVING" ] && echo "running (pid $SERVING) — http://localhost:4173/" || echo "not running — /claudecadence:serve to start")"
```
