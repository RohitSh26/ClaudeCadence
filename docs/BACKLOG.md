# Backlog

Things parked for after the next release. Items live here until they ship; once shipped they move to [`CHANGELOG.md`](../CHANGELOG.md) and out of this file.

## Distribution

- Submit to the official Anthropic plugin marketplace via [claude.ai/settings/plugins/submit](https://claude.ai/settings/plugins/submit).
- Replace the synthetic SVG mockups in `docs/img/` with screenshots from a real session (synthetic data only — no project IP).
- Add a 30-second demo GIF / Loom.
- Logo / brand mark (currently just text). OG-image for social shares.

## Functionality

- **Server-Sent Events** for the per-project viewer (currently polls every 5 s). Lower latency + less CPU when no events fire.
- **Per-project config file** (`.claude/cadence/config.json`) for hook tuning, lane colors, default view mode, attachment caps.
- **Cross-session view** — two parallel sessions in the same project rendered side by side instead of one-or-the-other through the dropdown.
- **Export a session as a static HTML bundle** for sharing — single self-contained file with embedded images.
- **Replay** (task #43) — modal that walks the session chronologically with playback controls. UI sketch exists at `viewer/_replay.js` in an earlier branch; design reference in `docs/design/index.html` (the replay modal is the next prototype to build).
- **Workflow diagram for failed deploys** — boxes-and-arrows pipeline visualization the prototype demos for refusal turns. Data-shape-dependent (needs a policy/refusal marker on the failed node).
- **Wire real data into the remaining hub chart blocks** (`agent_heatmap`, `lane_flow`, `progress_arc`).

## Robustness

- **Renderer virtualization** (task #39). The viewer rebuilds the active turn every poll. Fine at ~500 nodes, stutters at 5 000+, locks at 50 000. Needs diff-based rendering that preserves `<details>` open state across rebuilds. ~6 hours.
- **Full orchestrator response synthesis.** v1.9.7's graph-derived capture handles simple turns. Multi-fork orchestrator turns (5 sub-agents dispatched, response interleaved with dispatches) still don't get cluster boundaries quite right. ~3 hours, mostly transcript-shape investigation. Start in `cadence_hook.js :: deriveCatchUpNodes`.
- **Browser matrix testing** — Safari + Firefox + Chrome + Edge, light + dark, mobile + desktop.
- **Strict UTF-8 handling on hook input** — edge case if a payload contains invalid bytes.
- **Image storage GC** — eventually `.claude/cadence/images/` could grow unboundedly. Need a `cadence-prune --images-older-than 30d` mode.

## Documentation

- `docs/HOOKS.md` — full hook taxonomy and how to add custom recorders.
- `docs/DATA-MODEL.md` — JSON schema for nodes + block types + image block.
- `docs/COOKBOOK.md` — examples of customizing what gets recorded.
- A short architecture diagram (one SVG) showing the hook → nodes.js → viewer → browser flow.
- GitHub Pages demo at `https://rohitsh26.github.io/ClaudeCadence/` hosting the design prototype with synthetic BloomList data. Requires enabling Pages in repo settings + choosing build approach (`docs/` folder vs `gh-pages` branch). ~30 min once decided.

## Recently shipped (last 5 releases)

For full history see [CHANGELOG](../CHANGELOG.md).

- **v2.7.0** — left-align prose in a 760 px feed, mono command prompts, compact system-activity rows, race-safe image extraction with poll + content-match verification.
- **v2.6.x** — real image attachments embedded inline in the prompt hero; full prompt body rendered as markdown (no more 96-char title truncation); legacy harness prompts filtered from render.
- **v2.5.x** — port the editorial design from the static prototype into the live viewer: sticky topbar with session dropdown + collapsible filter overlay, prompt hero with serif h1, phase anchors with apricot tint, ledger / rollup bodies, sage response band, lane accordion on dispatch groups, scroll-snap feed, session pulse coordinate plot.
- **v2.4.0** — task-notification grouping. Long-running background tasks no longer spawn 50+ noisy "prompt" rows; they fold into a single `task_group` node per `task-id` per turn with count + latest status + click-to-expand history.
- **v2.3.0** — stable layout (active turn re-renders on poll, frozen history zone below), syntax highlighting for diff blocks, mid-stream interrupt fix.
