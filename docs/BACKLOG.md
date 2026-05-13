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

## Next up

### Embed real images in the prompt-hero
Today the hook captures `payload.prompt` (text only). When the user attaches an image, the harness leaves a literal `[Image #N]` placeholder in the prompt text where the bytes were inlined in the chat input. v2.5.4 strips the placeholder and shows a small `📎 image attached` chip in the prompt-hero so the user knows one was sent.

Real fix: during `handleUserPrompt`, read `payload.transcript_path`, find the corresponding user-message entry (most recent unconsumed user role with this prompt's content), extract any `image` content blocks (base64 + mime), and attach them to the captured prompt node as `image` blocks. Renderer then shows them inline below the h1.

Touchpoints: `cadence_hook.js :: handleUserPrompt`; new helper `extractImageBlocksFromTranscript`; `_timeline.js` renderers map already supports custom block types. Estimate ~2 hours.



### Group task-notification entries per long-running task
Long-running tasks (background scripts, agents that run for tens of minutes) emit `<task-notification>` updates every ~2 minutes. Today each one lands as its own row — a 10-minute task can produce 50+ near-identical timeline entries that visually drown the prompt and response.

Goal: collapse N task-notifications referencing the same `task-id` into ONE row that shows the latest status + a count + a click-to-expand list of the individual notifications. Same pattern we use for tool groups (`read · 5`, `bash · 11`).

Detection: `<task-notification>` blocks carry `<task-id>X</task-id>`. Group by that ID within a turn. Header row shows latest status, oldest start time, total count.

Estimate ~2 hours. Touchpoints:
- `cadence_hook.js` — detect repeated task-notifications and either fold at capture time or mark them with a `task_group_id` for the viewer to roll up.
- `_timeline.js :: childRow` / `renderTurn` — collapsed group + expansion.

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
