---
description: Open the cross-project ClaudeCadence home — every cadence you've started, with status filters
---

Start the ClaudeCadence hub server — the home page that lists every project where you've ever opened a Claude Code session with this plugin enabled, with active / stale / inactive status.

Run:

```bash
python3 "${CLAUDE_PLUGIN_ROOT}/bin/cadence-serve" --hub
```

This serves `~/.claude/cadence/` on port 4173 and opens your browser at the home page. Click any cadence card to dive into that project's full timeline. Filter by status (active / stale / inactive) or search by name / path.

Stop the server with `/claudecadence:stop`.
