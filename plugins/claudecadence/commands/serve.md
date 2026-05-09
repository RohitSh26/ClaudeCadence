---
description: Start the ClaudeCadence local viewer (http server) for this project
---

Start the ClaudeCadence timeline viewer for the current project.

Run this command:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" "$CLAUDE_PROJECT_DIR"
```

This starts a local Python http.server on `0.0.0.0:4173` rooted at `$CLAUDE_PROJECT_DIR/.claude/cadence/` so you can open http://localhost:4173/ in your browser. It also auto-opens your default browser if available.

The server runs in the background. The timeline auto-fills as you keep working — refresh the browser tab whenever you want to see the latest. Stop the server with `/claudecadence:stop`.
