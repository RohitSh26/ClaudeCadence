# Backlog

Things parked for after the next release.

## Distribution

- Submit to the official Anthropic plugin marketplace via [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit).
- Add a screenshot of the live timeline to the README (best taken after a real session).
- Add a 30-second demo GIF.
- Logo / brand mark (currently just text). OG-image for social shares.

## Functionality

- Server-Sent Events for the per-project viewer (currently polls every 5 s).
- Per-project config file (`.claude/cadence/config.json`) for hook tuning, lane colors, default view mode.
- Wire real data sources for the remaining chart blocks (`agent_heatmap`, `lane_flow`, `progress_arc`).
- Cross-session view: two parallel sessions in the same project rendered side by side.
- Export a session as a static HTML bundle for sharing.

## Robustness

- Truncation + tooltip for very long titles / summaries.
- Graceful recovery from a malformed `nodes.js` (with `.bak` rotation).
- Browser matrix testing (Safari + Firefox + Chrome).
- Performance at 500+ nodes per cadence.
- Strict UTF-8 handling on hook input.

## Documentation

- `docs/HOOKS.md` — full hook taxonomy + how to add custom ones.
- `docs/DATA-MODEL.md` — JSON schema for nodes + block types.
- `docs/COOKBOOK.md` — examples of customizing what gets recorded.
- `CONTRIBUTING.md`.

## Deferred from v2.2

These were intentionally left out of the v2.2 bundle and need their own focused design pass.

### Bug B — mid-stream interrupt
When the user submits prompt #2 before Claude finishes responding to prompt #1, Cadence doesn't cleanly attribute the merged response to two distinct turns. v1.9.4's look-ahead heuristic was wrong (misidentified system-reminder injections as mid-stream interrupts). The correct fix is queue-aware: peek at remaining FIFO entries, bound collection by the next-turn's `lowerBoundTs`. Estimate ~4 hours. Start in `cadence_hook.js :: firstAssistantTextAfter`.

### Renderer virtualization
The viewer rebuilds the full DOM every 5s poll. Fine at ~500 nodes, stutters at 5,000+, locks at 50,000. Needs diff-based rendering that preserves `<details>` open state across rebuilds. ~6 hours.

### GitHub Pages demo
Host the iter6 demo viewer with synthetic BloomList data at `https://rohitsh26.github.io/ClaudeCadence/`. Requires enabling Pages in repo settings + choosing build approach (`docs/` folder vs `gh-pages` branch). ~30 min once decided.

### Full orchestrator response synthesis
v1.9.7's graph-derived capture handles simple turns. Multi-fork orchestrator turns (5 sub-agents dispatched, response interleaved with dispatches) still don't get cluster boundaries quite right. ~3 hours, mostly transcript-shape investigation. Start in `cadence_hook.js :: deriveCatchUpNodes`.
